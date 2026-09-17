import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
} from 'discord.js'
import { config, discordFor } from './config.ts'
import { CANCEL_WINDOW_MS, JUROR_TIMEOUT_MS, ReportStore, tallyVotes, type Report, type Vote } from './reports.ts'
import { MAX_WARNINGS, addWarning, participantsOf, warningCount } from './solana.ts'

/** The challenge a participant is in right now, on any track. */
export type CurrentChallenge = (discordId: string) => { track: number; challengeId: number } | null

const SWEEP_MS = 30_000

const minutes = (ms: number) => Math.round(ms / 60_000)

/**
 * `/report @user [reason]`: a participant reports someone in their challenge room. Three random
 * participants in the same room vote by DM; two matching votes decide. An upheld report puts a
 * warning on chain, and 3 warnings knock a participant out.
 */
export function setupJury(client: Client, store: ReportStore, currentChallenge: CurrentChallenge) {
  const guildId = config.discord.guildId!

  client.on('interactionCreate', (interaction: Interaction) => {
    handle(interaction).catch((err) => console.error('[jury] interaction failed', err))
  })

  async function handle(interaction: Interaction) {
    if (interaction.isChatInputCommand() && interaction.commandName === 'report') return onReport(interaction)
    if (!interaction.isButton()) return
    const [kind, id, choice] = interaction.customId.split(':')
    if (kind === 'report-cancel') return onCancel(interaction, Number(id))
    if (kind === 'report-vote') return onVote(interaction, Number(id), choice as Vote)
  }

  async function onReport(interaction: ChatInputCommandInteraction) {
    const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral })
    const reporterId = interaction.user.id
    const target = interaction.options.getUser('user', true)
    const reason = interaction.options.getString('reason')?.trim().slice(0, 200) || null

    const mine = currentChallenge(reporterId)
    if (!mine) return reply('Only participants of a running challenge can report.')
    if (target.id === reporterId) return reply("You can't report yourself.")
    const theirs = currentChallenge(target.id)
    if (!theirs || theirs.track !== mine.track || theirs.challengeId !== mine.challengeId) {
      return reply(`${target} is not in your challenge.`)
    }

    const roomId = discordFor(mine.track).voiceChannelId
    const guild = await client.guilds.fetch(guildId)
    const [reporter, reported] = await Promise.all([
      guild.members.fetch(reporterId).catch(() => null),
      guild.members.fetch(target.id).catch(() => null),
    ])
    if (!roomId || reporter?.voice.channelId !== roomId || reported?.voice.channelId !== roomId) {
      return reply('You both need to be in the challenge voice channel to report.')
    }
    if (store.pendingAgainst(target.id)) return reply(`${target} is already being reviewed.`)

    const report = store.create({
      track: mine.track,
      challengeId: mine.challengeId,
      voiceChannelId: roomId,
      reporterId,
      targetId: target.id,
      reason,
    })
    await interaction.reply({
      content:
        `Report received. 3 random participants in the room will check ${target}. ` +
        `Your name is not shared. You can cancel within ${minutes(CANCEL_WINDOW_MS)} minutes.`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`report-cancel:${report.id}`).setLabel('Cancel report').setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    console.log(`[jury] report #${report.id} opened`)
    await log(`Report #${report.id} opened against <@${target.id}>${reason ? `: ${reason}` : ''}`)
    await fillSeats(report)
  }

  async function onCancel(interaction: ButtonInteraction, reportId: number) {
    const result = store.cancel(reportId, interaction.user.id)
    if (!result.ok) {
      const text = result.reason === 'too-late' ? 'The cancel window has passed.' : 'This report is already closed.'
      return interaction.reply({ content: text, flags: MessageFlags.Ephemeral })
    }
    await interaction.update({ content: 'Report cancelled.', components: [] })
    await closeJurorMessages(result.report, 'This report was cancelled.')
    await log(`Report #${reportId} cancelled by the reporter`)
  }

  async function onVote(interaction: ButtonInteraction, reportId: number, vote: Vote) {
    if (vote !== 'uphold' && vote !== 'dismiss') return
    const result = store.vote(reportId, interaction.user.id, vote)
    if (!result.ok) {
      const text =
        result.reason === 'too-late'
          ? 'Your 10 minutes ran out, so someone else was asked. Thanks anyway.'
          : result.reason === 'already-voted'
            ? 'You already voted.'
            : 'This report is closed.'
      return interaction.update({ content: text, components: [] })
    }
    await interaction.update({ content: `Thanks. You voted to ${vote} the report.`, components: [] })
    const report = store.get(reportId)
    if (report) await settle(report)
  }

  // One report is handled at a time, so a sweep and a vote never ask the same seat twice.
  const busy = new Set<number>()

  /** Asks more jurors until 3 hold a seat, or closes the report when nobody is left to ask. */
  async function fillSeats(report: Report) {
    if (busy.has(report.id)) return
    busy.add(report.id)
    try {
      await fillSeatsNow(report)
    } finally {
      busy.delete(report.id)
    }
  }

  async function fillSeatsNow(report: Report) {
    for (;;) {
      const current = store.get(report.id)
      if (!current || current.status !== 'pending') return
      const { outcome, seatsOpen, waiting } = tallyVotes(store.jurors(report.id))
      if (outcome) return close(current, outcome)
      if (seatsOpen === 0) return

      const asked = new Set(store.jurors(report.id).map((j) => j.jurorId))
      const candidates = await roomCandidates(current, asked)
      if (candidates.length === 0) {
        // Nobody left to ask. With jurors still thinking, wait for them; otherwise the report lapses.
        if (waiting === 0) return close(current, 'void')
        return
      }
      const jurorId = candidates[Math.floor(Math.random() * candidates.length)]
      store.addJuror(report.id, jurorId)
      const delivered = await askJuror(current, jurorId)
      if (!delivered) store.expireJuror(report.id, jurorId)
    }
  }

  /** Participants of the same challenge in the room right now, not yet asked. */
  async function roomCandidates(report: Report, asked: Set<string>) {
    const channel = await client.channels.fetch(report.voiceChannelId).catch(() => null)
    if (channel?.type !== ChannelType.GuildVoice) return []
    return [...channel.members.keys()].filter((id) => {
      if (id === report.reporterId || id === report.targetId || asked.has(id)) return false
      const challenge = currentChallenge(id)
      return challenge?.track === report.track && challenge.challengeId === report.challengeId
    })
  }

  async function askJuror(report: Report, jurorId: string) {
    try {
      const user = await client.users.fetch(jurorId)
      const message = await user.send({
        content:
          `**Jury request.** <@${report.targetId}> was reported in your challenge room` +
          `${report.reason ? ` for: "${report.reason}"` : ''}.\n` +
          'Check the voice channel. Are they not actually studying on camera, or not treating others with respect?\n' +
          `Please answer within ${minutes(JUROR_TIMEOUT_MS)} minutes. Your vote is anonymous.`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`report-vote:${report.id}:uphold`).setLabel('Uphold').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`report-vote:${report.id}:dismiss`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary),
          ),
        ],
      })
      store.setJurorMessage(report.id, jurorId, message.channelId, message.id)
      return true
    } catch {
      // DMs closed: skip this person.
      return false
    }
  }

  /** Closes the report once the jury has decided; otherwise tops up the jury. */
  async function settle(report: Report) {
    const { outcome } = tallyVotes(store.jurors(report.id))
    if (!outcome) return fillSeats(report)
    await close(report, outcome)
  }

  async function close(report: Report, status: 'upheld' | 'dismissed' | 'void') {
    store.close(report.id, status)
    const done = { upheld: 'The jury upheld this report.', dismissed: 'The jury dismissed this report.', void: 'This report lapsed.' }
    await closeJurorMessages(report, done[status])
    console.log(`[jury] report #${report.id} ${status}`)
    await log(`Report #${report.id} ${status}`)

    if (status === 'upheld') {
      await dm(report.reporterId, `Your report was upheld. <@${report.targetId}> received a warning.`)
      await warn(report)
    } else if (status === 'dismissed') {
      await dm(report.reporterId, 'Your report was reviewed and dismissed by the jury.')
    } else {
      await dm(report.reporterId, 'Your report lapsed: not enough participants in the room could review it.')
    }
  }

  /** Puts the warning on chain and tells the participant. Retried by the sweep until it lands. */
  async function warn(report: Report) {
    try {
      const participant = (await participantsOf(report.track, report.challengeId)).find(
        (p) => p.discordId === report.targetId,
      )
      if (!participant) throw new Error('participant not found on chain')
      await addWarning(report.track, report.challengeId, participant.user)
      store.markWarned(report.id)
      const count = await warningCount(report.track, report.challengeId, participant.user)
      await dm(
        report.targetId,
        count >= MAX_WARNINGS
          ? `You received a warning (${count}/${MAX_WARNINGS}) after a jury upheld a report. You are out of this challenge.`
          : `You received a warning (${count}/${MAX_WARNINGS}) after a jury upheld a report. ` +
              `Keep your camera on while you study and treat others with respect. ${MAX_WARNINGS} warnings and you are out.`,
      )
      await log(`Report #${report.id}: warning ${count}/${MAX_WARNINGS} recorded on chain for <@${report.targetId}>`)
    } catch (err) {
      console.error(`[jury] could not record the warning for report #${report.id}`, err)
    }
  }

  async function closeJurorMessages(report: Report, text: string) {
    for (const juror of store.jurors(report.id)) {
      if (juror.vote !== null || !juror.dmChannelId || !juror.dmMessageId) continue
      const channel = await client.channels.fetch(juror.dmChannelId).catch(() => null)
      if (!channel?.isTextBased()) continue
      const message = await channel.messages.fetch(juror.dmMessageId).catch(() => null)
      await message?.edit({ content: text, components: [] }).catch(() => null)
    }
  }

  async function dm(userId: string, content: string) {
    const user = await client.users.fetch(userId).catch(() => null)
    await user?.send(content).catch(() => null)
  }

  async function log(content: string) {
    if (!config.discord.reportsChannelId) return
    const channel = await client.channels.fetch(config.discord.reportsChannelId).catch(() => null)
    if (channel?.isSendable()) await channel.send({ content, allowedMentions: { parse: [] } }).catch(() => null)
  }

  /** Replaces jurors who ran out of time, and retries warnings that did not reach the chain. */
  async function sweep() {
    const expired = store.expireStale()
    for (const juror of expired) {
      await closeJurorMessageFor(juror.reportId, juror.jurorId)
    }
    for (const report of store.pending()) await fillSeats(report)
    for (const report of store.unwarned()) await warn(report)
  }

  async function closeJurorMessageFor(reportId: number, jurorId: string) {
    const juror = store.jurors(reportId).find((j) => j.jurorId === jurorId)
    if (!juror?.dmChannelId || !juror.dmMessageId) return
    const channel = await client.channels.fetch(juror.dmChannelId).catch(() => null)
    if (!channel?.isTextBased()) return
    const message = await channel.messages.fetch(juror.dmMessageId).catch(() => null)
    await message
      ?.edit({ content: 'Your 10 minutes ran out, so someone else was asked. Thanks anyway.', components: [] })
      .catch(() => null)
  }

  async function registerCommand() {
    const guild = await client.guilds.fetch(guildId)
    await guild.commands.set([
      {
        name: 'report',
        description: 'Report a participant in your challenge room. 3 random participants will review it.',
        options: [
          {
            name: 'user',
            description: 'Who you are reporting',
            type: ApplicationCommandOptionType.User,
            required: true,
          },
          {
            name: 'reason',
            description: 'What is wrong, e.g. empty desk, looped video, rude',
            type: ApplicationCommandOptionType.String,
            required: false,
            max_length: 200,
          },
        ],
      },
    ])
  }

  registerCommand()
    .then(() => console.log('[jury] /report ready'))
    .catch((err) =>
      console.error('[jury] could not register /report — invite the bot with the applications.commands scope', err),
    )
  setInterval(() => sweep().catch((err) => console.error('[jury] sweep failed', err)), SWEEP_MS)
}
