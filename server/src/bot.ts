import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { ChannelType, Client, Events, GatewayIntentBits, type VoiceState } from 'discord.js'
import { botConfigured, config } from './config.ts'
import { openChallengeId, registeredDiscordIds, runningChallengeId } from './solana.ts'
import { GrindTracker } from './tracker.ts'

export type GrantResult = { roleGranted: boolean; joinedGuild: boolean; reason?: string }

let client: Client | null = null

mkdirSync(new URL('.', config.dbPath), { recursive: true })
export const tracker = new GrindTracker(fileURLToPath(config.dbPath), config.dailyGoalSeconds)

const FLUSH_INTERVAL_MS = 30_000
const PARTICIPANT_REFRESH_MS = 60_000
const ROLE_SYNC_MS = 10 * 60_000

// Discord ids registered for the running or the upcoming weekly challenge.
// Time is recorded for both; pass/fail only looks at days inside a challenge's week.
let participants = new Set<string>()

async function currentParticipantIds() {
  const running = runningChallengeId()
  const [open, current] = await Promise.all([
    registeredDiscordIds(openChallengeId()),
    running === null ? [] : registeredDiscordIds(running),
  ])
  return new Set([...open, ...current])
}

export async function startBot() {
  if (!botConfigured) {
    console.warn('[bot] DISCORD_BOT_TOKEN / GUILD_ID / ROLE_ID not set — role granting disabled')
    return
  }
  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] })
  client.once(Events.ClientReady, async (c) => {
    console.log(`[bot] logged in as ${c.user.tag}`)
    await syncRoles().catch((err) => console.error('[bot] role sync failed', err))
    setInterval(() => syncRoles().catch((err) => console.error('[bot] role sync failed', err)), ROLE_SYNC_MS)
    await startTracking().catch((err) => console.error('[tracker] failed to start', err))
  })
  client.on(Events.VoiceStateUpdate, (_old, state) => evaluate(state))
  await client.login(config.discord.botToken)
}

/** Counts only registered participants in the challenge channel with their camera on. */
function isCounting(state: VoiceState) {
  return state.channelId === config.discord.voiceChannelId && Boolean(state.selfVideo) && participants.has(state.id)
}

function evaluate(state: VoiceState) {
  const wasActive = tracker.isActive(state.id)
  if (isCounting(state)) {
    tracker.start(state.id)
    if (!wasActive) console.log(`[tracker] started counting ${state.member?.user.username ?? state.id}`)
  } else if (wasActive) {
    tracker.stop(state.id)
    console.log(`[tracker] stopped counting ${state.member?.user.username ?? state.id}`)
  }
}

/** Re-checks everyone currently in the challenge channel (startup, new registrations). */
async function evaluateChannel() {
  if (!client?.isReady() || !config.discord.voiceChannelId) return
  const channel = await client.channels.fetch(config.discord.voiceChannelId).catch(() => null)
  if (channel?.type !== ChannelType.GuildVoice) {
    console.warn('[tracker] voice channel not found or not visible to the bot')
    return
  }
  for (const member of channel.members.values()) evaluate(member.voice)
}

async function refreshParticipants() {
  participants = await currentParticipantIds()
  await evaluateChannel()
}

async function startTracking() {
  if (!config.discord.voiceChannelId) {
    console.warn('[tracker] DISCORD_VOICE_CHANNEL_ID not set — time tracking disabled')
    return
  }
  await refreshParticipants()
  console.log(`[tracker] tracking ${participants.size} participants (goal ${config.dailyGoalSeconds}s/day)`)
  setInterval(() => tracker.flush(), FLUSH_INTERVAL_MS)
  setInterval(() => refreshParticipants().catch((err) => console.error('[tracker] refresh failed', err)), PARTICIPANT_REFRESH_MS)
}

/** Call after a registration confirms so an already-streaming user starts counting right away. */
export async function addParticipant(discordId: string) {
  participants.add(discordId)
  await evaluateChannel()
}

/** Gives the paid role; adds the user to the server first if needed (requires their OAuth token). */
export async function grantRole(discordId: string, accessToken?: string): Promise<GrantResult> {
  if (!client?.isReady()) return { roleGranted: false, joinedGuild: false, reason: 'bot-not-ready' }
  const roleId = config.discord.roleId!
  const guild = await client.guilds.fetch(config.discord.guildId!)

  const member = await guild.members.fetch(discordId).catch(() => null)
  if (!member) {
    if (!accessToken) return { roleGranted: false, joinedGuild: false, reason: 'not-in-guild' }
    await guild.members.add(discordId, { accessToken, roles: [roleId] })
    return { roleGranted: true, joinedGuild: true }
  }
  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId, 'Paid Weekly Challenge #0')
  }
  return { roleGranted: true, joinedGuild: false }
}

/**
 * Keeps the challenge role in line with the chain: participants of the running or upcoming
 * challenge have it; last week's participants who did not sign up again lose it.
 */
async function syncRoles() {
  if (!client?.isReady()) return
  const allowed = await currentParticipantIds()
  const running = runningChallengeId()
  const previous = running === null || running === 0 ? [] : await registeredDiscordIds(running - 1)

  let granted = 0
  for (const id of allowed) {
    const result = await grantRole(id).catch(() => null)
    if (result?.roleGranted) granted++
  }

  const roleId = config.discord.roleId!
  const guild = await client.guilds.fetch(config.discord.guildId!)
  let revoked = 0
  for (const id of previous.filter((id) => !allowed.has(id))) {
    const member = await guild.members.fetch(id).catch(() => null)
    if (member?.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Weekly challenge ended').catch(() => null)
      revoked++
    }
  }
  console.log(`[bot] synced roles: ${granted}/${allowed.size} granted, ${revoked} revoked`)
}
