import { serve } from '@hono/node-server'
import { PublicKey } from '@solana/web3.js'
import { Hono } from 'hono'
import { auth, getSession } from './auth.ts'
import { addParticipant, grantRole, startBot, tracker } from './bot.ts'
import { botConfigured, config, oauthConfigured } from './config.ts'
import {
  RegistrationError,
  buildRegisterTx,
  isDiscordRegistered,
  openChallengeId,
  runningChallengeId,
  TRACK,
  trackConfig,
} from './solana.ts'

const app = new Hono()

app.route('/auth', auth)

app.get('/api/me', async (c) => {
  const session = await getSession(c)
  return c.json({
    oauthConfigured,
    discord: session ? { id: session.discordId, username: session.username, avatarUrl: session.avatarUrl } : null,
  })
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

  try {
    return c.json(await buildRegisterTx(wallet, session.discordId, Number(body.multiply)))
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
  if (!(await isDiscordRegistered(session.discordId))) {
    return c.json({ error: 'No registration found for this Discord account.', code: 'not-registered' }, 404)
  }
  if (!botConfigured) return c.json({ roleGranted: false, joinedGuild: false, reason: 'bot-not-configured' })
  addParticipant(session.discordId).catch(() => {})
  try {
    return c.json(await grantRole(session.discordId, session.accessToken))
  } catch (err) {
    console.error('[confirm]', err)
    return c.json({ roleGranted: false, joinedGuild: false, reason: 'discord-error' }, 502)
  }
})

// Progress of the logged-in Discord user in the challenge being run (or the next one).
app.get('/api/progress', async (c) => {
  const session = await getSession(c)
  if (!session) return c.json({ error: 'Connect Discord first.' }, 401)
  const running = runningChallengeId()
  const challengeId = running ?? openChallengeId()
  return c.json({
    track: TRACK,
    challengeId,
    running: running !== null,
    goalSeconds: config.dailyGoalSeconds,
    counting: tracker.isActive(session.discordId),
    days: tracker.challenge(session.discordId, TRACK, challengeId, trackConfig.days),
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
