import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'
import { ChannelType, Client, Events, GatewayIntentBits, type VoiceState } from 'discord.js'
import { botConfigured, config, discordFor } from './config.ts'
import {
  ACTIVE_TRACKS,
  challengeState,
  dayEndMs,
  dayIndexAt,
  openChallengeId,
  oracleAddress,
  oracleBalanceSol,
  participantsOf,
  recordProgress,
  registeredDiscordIds,
  resultsOpenMs,
  rollover,
  runningChallengeId,
  tally,
  trackConfigOf,
  TRACKS,
} from './solana.ts'
import { setupJury } from './jury.ts'
import { ReportStore } from './reports.ts'
import { GrindTracker, type Slot } from './tracker.ts'

export type GrantResult = { roleGranted: boolean; joinedGuild: boolean; reason?: string }

let client: Client | null = null

const dbPath = typeof config.dbPath === 'string' ? config.dbPath : fileURLToPath(config.dbPath)
mkdirSync(dirname(dbPath), { recursive: true })
export const tracker = new GrindTracker(dbPath, config.dailyGoalSeconds)
const reports = new ReportStore(dbPath)

const FLUSH_INTERVAL_MS = config.flushIntervalMs
const PARTICIPANT_REFRESH_MS = 60_000
const ROLE_SYNC_MS = 10 * 60_000
const CHAIN_SYNC_MS = 60_000

type Registration = { track: number; challengeId: number }

/**
 * Running and upcoming challenges each Discord id joined, across the active tracks.
 * Time is counted for all of them; it goes to whichever challenge is running at that moment.
 */
let registrations = new Map<string, Registration[]>()

/** The challenge a participant is running right now, if any. */
function currentChallenge(discordId: string) {
  const slot = slotOf(discordId, Date.now())
  return slot && { track: slot.track, challengeId: slot.challengeId }
}

function slotOf(discordId: string, atMs: number): Slot | null {
  for (const { track, challengeId } of registrations.get(discordId) ?? []) {
    const dayIndex = dayIndexAt(track, challengeId, atMs)
    if (dayIndex !== null) return { track, challengeId, dayIndex, endMs: dayEndMs(track, challengeId, dayIndex) }
  }
  return null
}

/** The running and the upcoming challenge of a track. */
function currentChallenges(track: number) {
  const running = runningChallengeId(track)
  return [openChallengeId(track), ...(running === null ? [] : [running])]
}

async function registrationsOn(track: number) {
  const perChallenge = await Promise.all(
    currentChallenges(track).map(async (challengeId) =>
      (await registeredDiscordIds(track, challengeId)).map((discordId) => ({ discordId, track, challengeId })),
    ),
  )
  return perChallenge.flat()
}

function voiceChannels() {
  return [...new Set(ACTIVE_TRACKS.map((track) => discordFor(track).voiceChannelId).filter(Boolean))] as string[]
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
    setupJury(c, reports, currentChallenge)
  })
  client.on(Events.VoiceStateUpdate, (_old, state) => evaluate(state))
  await client.login(config.discord.botToken)
}

/** Counts only participants in their own track's channel with their camera on. */
function isCounting(state: VoiceState) {
  if (!state.channelId || !state.selfVideo) return false
  return (registrations.get(state.id) ?? []).some(({ track }) => discordFor(track).voiceChannelId === state.channelId)
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

/** Re-checks everyone currently in the challenge channels (startup, new registrations). */
async function evaluateChannels() {
  if (!client?.isReady()) return
  for (const channelId of voiceChannels()) {
    const channel = await client.channels.fetch(channelId).catch(() => null)
    if (channel?.type !== ChannelType.GuildVoice) {
      console.warn(`[tracker] voice channel ${channelId} not found or not visible to the bot`)
      continue
    }
    for (const member of channel.members.values()) evaluate(member.voice)
  }
}

async function refreshParticipants() {
  const next = new Map<string, Registration[]>()
  for (const track of ACTIVE_TRACKS) {
    for (const { discordId, ...registration } of await registrationsOn(track)) {
      next.set(discordId, [...(next.get(discordId) ?? []), registration])
    }
  }
  registrations = next
  await evaluateChannels()
}

/** Puts days that hit the goal on chain, retrying anything that failed earlier. */
async function recordPending() {
  const pending = tracker.pendingRecords().filter((record) => TRACKS[record.track])
  if (pending.length === 0) return
  const byChallenge = new Map<string, Awaited<ReturnType<typeof participantsOf>>>()
  for (const record of pending) {
    const key = `${record.track}:${record.challengeId}`
    try {
      if (!byChallenge.has(key)) byChallenge.set(key, await participantsOf(record.track, record.challengeId))
      const participant = byChallenge.get(key)!.find((p) => p.discordId === record.discordId)
      if (!participant) continue
      await recordProgress(record.track, record.challengeId, participant.user, record.dayIndex)
      tracker.markRecorded(record)
      console.log(
        `[chain] recorded day ${record.dayIndex} of track ${record.track} #${record.challengeId} for ${record.discordId}`,
      )
    } catch (err) {
      console.error(`[chain] could not record day ${record.dayIndex} of track ${record.track} #${record.challengeId}`, err)
    }
  }
}

/** After a challenge ends: count everyone, then roll the pool over if nobody passed. */
async function settleFinishedChallenge(track: number) {
  const running = runningChallengeId(track)
  const finished = running === null ? null : running - 1
  if (finished === null || finished < 0) return
  // Days can still be recorded until the record window closes; counting before that could miss them.
  if (Date.now() < resultsOpenMs(track, finished)) return
  const state = await challengeState(track, finished)
  if (!state) return

  if (!state.finalized) {
    for (const participant of await participantsOf(track, finished)) {
      if (participant.tallied) continue
      await tally(track, finished, participant.user).catch((err) => console.error('[chain] tally failed', err))
    }
    console.log(`[chain] tallied track ${track} #${finished}`)
  }

  const settled = await challengeState(track, finished)
  if (settled?.finalized && settled.winnerShares.isZero() && !settled.rolledOver) {
    const next = openChallengeId(track)
    if (await challengeState(track, next)) {
      await rollover(track, finished, next)
      console.log(`[chain] nobody passed track ${track} #${finished}: prize pool rolled over into #${next}`)
    }
  }
}

async function syncChain() {
  await recordPending()
  for (const track of ACTIVE_TRACKS) {
    await settleFinishedChallenge(track).catch((err) => console.error(`[chain] settling track ${track} failed`, err))
  }
}

async function startTracking() {
  if (voiceChannels().length === 0) {
    console.warn('[tracker] no voice channel set (DISCORD_VOICE_CHANNEL_ID) — time tracking disabled')
    return
  }
  tracker.setSlotResolver(slotOf)
  await refreshParticipants()
  const balance = await oracleBalanceSol()
  for (const track of ACTIVE_TRACKS) {
    const { name, dayMs } = trackConfigOf(track)
    const { voiceChannelId } = discordFor(track)
    if (!voiceChannelId) console.warn(`[tracker] ${name}: no voice channel set — its time is not tracked`)
    console.log(`[tracker] ${name} (track ${track}): goal ${config.dailyGoalSeconds}s per ${dayMs / 1000}s day`)
  }
  console.log(`[tracker] ${registrations.size} participants`)
  if (balance < 0.05) console.warn(`[chain] oracle ${oracleAddress} has only ${balance} SOL — top it up`)
  setInterval(() => tracker.flush(), FLUSH_INTERVAL_MS)
  setInterval(() => refreshParticipants().catch((err) => console.error('[tracker] refresh failed', err)), PARTICIPANT_REFRESH_MS)
  setInterval(() => {
    tracker.flush()
    syncChain().catch((err) => console.error('[chain] sync failed', err))
  }, CHAIN_SYNC_MS)
  await syncChain().catch((err) => console.error('[chain] sync failed', err))
}

/** Call after a registration confirms so an already-streaming user starts counting right away. */
export async function addParticipant() {
  await refreshParticipants()
}

function rolesFor(tracks: number[]) {
  return [...new Set(tracks.map((track) => discordFor(track).roleId).filter(Boolean))] as string[]
}

/**
 * Gives the role of each track the user joined; adds them to the server first if needed
 * (requires their OAuth token).
 */
export async function grantRole(discordId: string, tracks: number[], accessToken?: string): Promise<GrantResult> {
  if (!client?.isReady()) return { roleGranted: false, joinedGuild: false, reason: 'bot-not-ready' }
  const roleIds = rolesFor(tracks)
  if (roleIds.length === 0) return { roleGranted: false, joinedGuild: false, reason: 'role-not-configured' }
  const guild = await client.guilds.fetch(config.discord.guildId!)

  const member = await guild.members.fetch(discordId).catch(() => null)
  if (!member) {
    if (!accessToken) return { roleGranted: false, joinedGuild: false, reason: 'not-in-guild' }
    await guild.members.add(discordId, { accessToken, roles: roleIds })
    return { roleGranted: true, joinedGuild: true }
  }
  const missing = roleIds.filter((roleId) => !member.roles.cache.has(roleId))
  if (missing.length > 0) await member.roles.add(missing, 'Paid a challenge entry')
  return { roleGranted: true, joinedGuild: false }
}

/**
 * Keeps each track's role in line with the chain: participants of its running or upcoming
 * challenge have it; the previous challenge's participants who did not sign up again lose it.
 * Tracks that share a role are merged, so one track never revokes a role another track needs.
 */
async function syncRoles() {
  if (!client?.isReady()) return
  const allowed = new Map<string, Set<string>>() // roleId -> discord ids
  const previous = new Map<string, Set<string>>()
  for (const track of ACTIVE_TRACKS) {
    const { roleId } = discordFor(track)
    if (!roleId) continue
    const running = runningChallengeId(track)
    const current = await registrationsOn(track)
    const last = running === null || running === 0 ? [] : await registeredDiscordIds(track, running - 1)
    allowed.set(roleId, new Set([...(allowed.get(roleId) ?? []), ...current.map((r) => r.discordId)]))
    previous.set(roleId, new Set([...(previous.get(roleId) ?? []), ...last]))
  }

  const guild = await client.guilds.fetch(config.discord.guildId!)
  let granted = 0
  let revoked = 0
  for (const [roleId, ids] of allowed) {
    for (const id of ids) {
      const member = await guild.members.fetch(id).catch(() => null)
      if (!member) continue
      if (!member.roles.cache.has(roleId)) await member.roles.add(roleId, 'Paid a challenge entry').catch(() => null)
      granted++
    }
    for (const id of previous.get(roleId) ?? []) {
      if (ids.has(id)) continue
      const member = await guild.members.fetch(id).catch(() => null)
      if (member?.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Challenge ended').catch(() => null)
        revoked++
      }
    }
  }
  console.log(`[bot] synced roles: ${granted} granted, ${revoked} revoked`)
}
