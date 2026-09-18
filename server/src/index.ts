import { serve } from '@hono/node-server'
import { PublicKey } from '@solana/web3.js'
import { Hono, type Context } from 'hono'
import { auth, getSession } from './auth.ts'
import { addParticipant, botStatus, dayWindow, grantRole, memberNames, reports, startBot, tracker } from './bot.ts'
import { botConfigured, config, discordFor, oauthConfigured } from './config.ts'
import {
  ACTIVE_TRACKS,
  RegistrationError,
  buildRegisterTx,
  challengeEndMs,
  challengeStartMs,
  challengeState,
  dayIndexAt,
  faucetAddress,
  faucetBalanceSol,
  faucetConfigured,
  sendTestSol,
  walletBalanceSol,
  myChallenges,
  openChallengeId,
  oracleAddress,
  oracleBalanceSol,
  recordProgress,
  registeredTracks,
  resultsOpenMs,
  runningChallengeId,
  trackConfigOf,
  participantsOf,
  warningCounts,
} from './solana.ts'

const app = new Hono()

app.route('/auth', auth)

// Deployment check: says which pieces are configured, never what the values are.
app.get('/api/health', async (c) => {
  const [oracleSol, faucetSol, tracks] = await Promise.all([
    oracleBalanceSol().catch(() => null),
    faucetBalanceSol().catch(() => null),
    Promise.all(
      ACTIVE_TRACKS.map(async (track) => ({
        track,
        voiceChannel: Boolean(discordFor(track).voiceChannelId),
        role: Boolean(discordFor(track).roleId),
        openChallengeId: openChallengeId(track),
        openChallengeExists: Boolean(await challengeState(track, openChallengeId(track)).catch(() => null)),
      })),
    ),
  ])
  return c.json({
    ok: true,
    bot: botHealth(),
    discordLogin: oauthConfigured,
    discordBot: botConfigured,
    voiceChannel: Boolean(config.discord.voiceChannelId),
    appUrl: config.appUrl,
    tracks,
    oracle: oracleAddress,
    oracleSol,
    faucet: faucetConfigured,
    faucetAddress,
    faucetSol,
  })
})

/** Bot status for uptime monitors: stale when disconnected or no longer saving time. */
function botHealth() {
  const { ready, lastFlushAt, disconnectedAt } = botStatus()
  const flushAgeMs = lastFlushAt === null ? null : Date.now() - lastFlushAt
  const healthy = !botConfigured || (ready && flushAgeMs !== null && flushAgeMs < 3 * config.flushIntervalMs)
  return {
    healthy,
    ready,
    lastFlushSecondsAgo: flushAgeMs === null ? null : Math.round(flushAgeMs / 1000),
    disconnectedSince: disconnectedAt === null ? null : new Date(disconnectedAt).toISOString(),
  }
}

// Point an uptime monitor here: 503 means the bot is not counting time right now.
app.get('/api/health/bot', (c) => {
  const health = botHealth()
  return c.json(health, health.healthy ? 200 : 503)
})

app.get('/api/me', async (c) => {
  const session = await getSession(c)
  return c.json({
    oauthConfigured,
    discord: session ? { id: session.discordId, username: session.username, avatarUrl: session.avatarUrl } : null,
  })
})

// Testers rarely manage to get devnet SOL from public faucets, so we hand out just enough for fees.
app.post('/api/faucet', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Connect Discord first.' }, 401)
  if (!faucetConfigured) return c.json({ error: 'Test SOL is not available right now.' }, 503)

  const body = await c.req.json().catch(() => ({}))
  let wallet: PublicKey
  try {
    wallet = new PublicKey(body.wallet)
  } catch {
    return c.json({ error: 'Invalid wallet address.' }, 400)
  }

  const balance = await walletBalanceSol(wallet)
  if (balance >= config.faucetSol) {
    return c.json({ sent: false, reason: 'already-funded', balance })
  }
  if (!tracker.claimFaucet(session.discordId, wallet.toBase58(), Math.round(config.faucetSol * 1e9))) {
    return c.json({ error: 'You already received test SOL.', code: 'already-claimed' }, 429)
  }

  try {
    const { signature } = await sendTestSol(wallet, config.faucetSol)
    console.log(`[faucet] sent ${config.faucetSol} SOL to ${wallet.toBase58()}`)
    return c.json({ sent: true, sol: config.faucetSol, signature })
  } catch (err) {
    console.error('[faucet]', err)
    return c.json({ error: 'Could not send test SOL. Ask in Discord.' }, 502)
  }
})

app.post('/api/register-tx', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Connect Discord first.' }, 401)

  const body = await c.req.json().catch(() => ({}))
  let wallet: PublicKey
  try {
    wallet = new PublicKey(body.wallet)
  } catch {
    return c.json({ error: 'Invalid wallet address.' }, 400)
  }

  // Older clients do not send a track: they register for the first track this server runs.
  const track = body.track === undefined ? ACTIVE_TRACKS[0] : Number(body.track)
  try {
    return c.json(await buildRegisterTx(track, wallet, session.discordId, Number(body.multiply)))
  } catch (err) {
    if (err instanceof RegistrationError) return c.json({ error: err.message, code: err.code }, err.status)
    console.error('[register-tx]', err)
    return c.json({ error: 'Could not build the transaction.' }, 500)
  }
})

// Called after the payment confirms (and from "check Discord access"): grants the private-room role.
app.post('/api/register/confirm', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Connect Discord first.' }, 401)
  const tracks = await registeredTracks(session.discordId)
  if (tracks.length === 0) {
    return c.json({ error: 'No registration found for this Discord account.', code: 'not-registered' }, 404)
  }
  if (!botConfigured) return c.json({ roleGranted: false, joinedGuild: false, reason: 'bot-not-configured' })
  addParticipant().catch(() => {})
  try {
    return c.json(await grantRole(session.discordId, tracks, session.accessToken))
  } catch (err) {
    console.error('[confirm]', err)
    return c.json({ roleGranted: false, joinedGuild: false, reason: 'discord-error' }, 502)
  }
})

/**
 * Progress in the challenge this user actually cares about, on any track: the one running now,
 * then a finished one still waiting on settlement or a claim, then the next one they joined.
 * Falls back to the running (or upcoming) challenge of the first track.
 */
app.get('/api/progress', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Connect Discord first.' }, 401)

  const now = Date.now()
  const joined = await myChallenges(session.discordId)
  const mine =
    joined.find((entry) => entry.startMs <= now && now < entry.endMs) ??
    joined.find((entry) => entry.endMs <= now && (!entry.finalized || (entry.passedEveryDay && !entry.claimed))) ??
    joined.filter((entry) => now < entry.startMs).sort((a, b) => a.startMs - b.startMs).at(0) ??
    joined.at(0)

  const track = mine?.track ?? ACTIVE_TRACKS[0]
  const challengeId = mine?.challengeId ?? runningChallengeId(track) ?? openChallengeId(track)
  const startMs = challengeStartMs(track, challengeId)
  const endMs = challengeEndMs(track, challengeId)

  return c.json({
    track,
    challengeId,
    registered: Boolean(mine),
    claimed: mine?.claimed ?? false,
    running: startMs <= now && now < endMs,
    over: endMs <= now,
    goalSeconds: config.dailyGoalSeconds,
    counting: tracker.isActive(session.discordId),
    currentDay: dayIndexAt(track, challengeId, now),
    days: tracker.challenge(session.discordId, track, challengeId, trackConfigOf(track).days, dayWindow),
  })
})

/** Staff pages and actions: a Discord session whose id is in ADMIN_DISCORD_IDS. */
async function admin(c: Context) {
  const session = await getSession(c)
  if (!session || !config.adminDiscordIds.includes(session.discordId)) return null
  return session
}

/** Everything about a challenge in one place: the chain, the tracker and Discord names. */
async function challengeReport(track: number, challengeId: number) {
  const { days, name } = trackConfigOf(track)
  const [state, participants] = await Promise.all([
    challengeState(track, challengeId).catch(() => null),
    participantsOf(track, challengeId).catch(() => []),
  ])
  const [warnings, names] = await Promise.all([
    warningCounts(track, challengeId, participants.map((p) => p.user)).catch(() => participants.map(() => 0)),
    memberNames(participants.map((p) => p.discordId)),
  ])
  const fullMask = (1 << days) - 1

  return {
    track,
    name,
    challengeId,
    startMs: challengeStartMs(track, challengeId),
    endMs: challengeEndMs(track, challengeId),
    resultsOpenMs: resultsOpenMs(track, challengeId),
    exists: Boolean(state),
    finalized: state?.finalized ?? false,
    rolledOver: state?.rolledOver ?? false,
    entryPoolUsdc: state ? state.totalDeposited.toNumber() / 1e6 : 0,
    carryOverUsdc: state ? state.carryOver.toNumber() / 1e6 : 0,
    winnerCount: state?.winnerCount ?? 0,
    tallied: state?.talliedCount ?? 0,
    claimed: state?.claimedCount ?? 0,
    days,
    participants: participants.map((p, i) => {
      const progress = tracker.challenge(p.discordId, track, challengeId, days, dayWindow)
      return {
        discordId: p.discordId,
        name: names.get(p.discordId) ?? null,
        wallet: p.user.toBase58(),
        multiply: p.multiply,
        paidUsdc: p.paidUsdc,
        registeredAt: p.registeredAt,
        daysPassed: progress.filter((day) => day.goalMet).length,
        recorded: progress.filter((day) => day.recorded).length,
        onChainDays: p.daysCompleted,
        passedEveryDay: (p.daysCompleted & fullMask) === fullMask,
        warnings: warnings[i] ?? 0,
        counting: tracker.isActive(p.discordId),
        days: progress,
        tallied: p.tallied,
        claimed: p.claimed,
      }
    }),
  }
}

app.get('/api/staff/overview', async (c) => {
  if (!(await admin(c))) return c.json({ error: 'Staff only.' }, 403)
  const now = Date.now()
  const challenges = []
  for (const track of ACTIVE_TRACKS) {
    const running = runningChallengeId(track)
    for (const id of new Set([running, openChallengeId(track), running === null ? null : running - 1])) {
      if (id !== null && id >= 0) challenges.push(await challengeReport(track, id))
    }
  }
  const [oracleSol, faucetSol] = await Promise.all([
    oracleBalanceSol().catch(() => null),
    faucetBalanceSol().catch(() => null),
  ])
  return c.json({
    now,
    goalSeconds: config.dailyGoalSeconds,
    challenges,
    server: {
      bot: botHealth(),
      oracle: oracleAddress,
      oracleSol,
      faucet: faucetAddress,
      faucetSol,
      faucetMaxSol: config.staffFaucetMaxSol,
      outages: tracker.outages().slice(-10).map((o) => ({ startMs: o.start_ms, endMs: o.end_ms })),
    },
    reports: await Promise.all(
      reports.recent(10).map(async (report) => ({
        ...report,
        jurors: reports.jurors(report.id).map((juror) => ({ vote: juror.vote, expired: juror.expired })),
        names: Object.fromEntries(await memberNames([report.reporterId, report.targetId])),
      })),
    ),
  })
})

// Hands out SOL without waiting for the faucet's one-per-account rule.
app.post('/api/staff/send-sol', async (c) => {
  if (!(await admin(c))) return c.json({ error: 'Staff only.' }, 403)
  if (!faucetConfigured) return c.json({ error: 'No faucet key on this server.' }, 503)
  const body = await c.req.json().catch(() => ({}))
  let wallet: PublicKey
  try {
    wallet = new PublicKey(body.wallet)
  } catch {
    return c.json({ error: 'Invalid wallet address.' }, 400)
  }
  const sol = Number(body.sol)
  if (!Number.isFinite(sol) || sol <= 0 || sol > config.staffFaucetMaxSol) {
    return c.json({ error: `Send between 0 and ${config.staffFaucetMaxSol} SOL.` }, 400)
  }
  try {
    const { signature } = await sendTestSol(wallet, sol)
    console.log(`[staff] sent ${sol} SOL to ${wallet.toBase58()}`)
    return c.json({ sent: true, sol, signature, balance: await walletBalanceSol(wallet) })
  } catch (err) {
    console.error('[staff] send-sol', err)
    return c.json({ error: 'Could not send SOL.' }, 502)
  }
})

// For days lost to an outage the automatic handling cannot cover.
app.post('/api/staff/credit-day', async (c) => {
  if (!(await admin(c))) return c.json({ error: 'Staff only.' }, 403)
  const body = await c.req.json().catch(() => ({}))
  const track = Number(body.track)
  const challengeId = Number(body.challengeId)
  const dayIndex = Number(body.dayIndex)
  const discordId = String(body.discordId ?? '')
  if (![track, challengeId, dayIndex].every(Number.isInteger) || !discordId) {
    return c.json({ error: 'Need track, challengeId, discordId and dayIndex.' }, 400)
  }
  const participant = (await participantsOf(track, challengeId)).find((p) => p.discordId === discordId)
  if (!participant) return c.json({ error: 'That account is not registered for this challenge.' }, 404)
  try {
    const signature = await recordProgress(track, challengeId, participant.user, dayIndex)
    console.log(`[staff] credited day ${dayIndex} of track ${track} #${challengeId} to ${discordId}`)
    return c.json({ credited: true, signature })
  } catch (err) {
    console.error('[staff] credit-day', err)
    return c.json({ error: 'Could not record that day. The record window may have closed.' }, 502)
  }
})

// Railway and friends set PORT; listen on every interface so their proxy can reach us.
serve({ fetch: app.fetch, port: config.port, hostname: '0.0.0.0' }, ({ port }) => {
  console.log(`[server] http://localhost:${port}  (oauth: ${oauthConfigured ? 'on' : 'off'}, bot: ${botConfigured ? 'on' : 'off'})`)
})

startBot().catch((err) => console.error('[bot] failed to start', err))

// Credit in-progress sessions before exiting (also runs on `node --watch` restarts).
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    tracker.stopAll()
    tracker.heartbeat()
    process.exit(0)
  })
}
