import { serve } from '@hono/node-server'
import { PublicKey } from '@solana/web3.js'
import { Hono } from 'hono'
import { auth, getSession } from './auth.ts'
import { addParticipant, grantRole, startBot, tracker } from './bot.ts'
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
  registeredTracks,
  runningChallengeId,
  trackConfigOf,
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
    days: tracker.challenge(session.discordId, track, challengeId, trackConfigOf(track).days),
  })
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
    process.exit(0)
  })
}
