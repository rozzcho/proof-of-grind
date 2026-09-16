import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { config, oauthConfigured, redirectUri, secureCookies } from './config.ts'

export type Session = {
  discordId: string
  username: string
  avatarUrl: string | null
  accessToken: string
}

// In-memory sessions: restarting the server logs everyone out (fine for local dev).
const sessions = new Map<string, Session>()

const SESSION_COOKIE = 'pog_session'
const STATE_COOKIE = 'pog_oauth_state'
const cookieOptions = { httpOnly: true, sameSite: 'Lax', path: '/', secure: secureCookies } as const

export async function getSession(c: Context): Promise<Session | null> {
  const id = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE)
  return (id && sessions.get(id)) || null
}

export const auth = new Hono()

auth.get('/discord/login', async (c) => {
  if (!oauthConfigured) return c.text('Discord login is not configured on the server.', 503)
  const state = crypto.randomUUID()
  await setSignedCookie(c, STATE_COOKIE, state, config.sessionSecret, { ...cookieOptions, maxAge: 600 })
  const params = new URLSearchParams({
    client_id: config.discord.clientId!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'identify guilds.join',
    state,
    // Always show Discord's authorize screen: connecting an account should be a deliberate
    // click, and it is also how someone switches to a different account ("Not you?").
    prompt: 'consent',
  })
  return c.redirect(`https://discord.com/oauth2/authorize?${params}`)
})

auth.get('/discord/callback', async (c) => {
  const expected = await getSignedCookie(c, config.sessionSecret, STATE_COOKIE)
  deleteCookie(c, STATE_COOKIE, { path: '/' })
  const { code, state, error } = c.req.query()
  if (error || !code || !state || state !== expected) {
    return c.redirect(`${config.appUrl}/?register=1&discord_error=1`)
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.discord.clientId!,
      client_secret: config.discord.clientSecret!,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenRes.ok) return c.redirect(`${config.appUrl}/?register=1&discord_error=1`)
  const token = (await tokenRes.json()) as { access_token: string }

  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userRes.ok) return c.redirect(`${config.appUrl}/?register=1&discord_error=1`)
  const user = (await userRes.json()) as { id: string; username: string; global_name?: string; avatar?: string }

  const sessionId = crypto.randomUUID()
  sessions.set(sessionId, {
    discordId: user.id,
    username: user.global_name || user.username,
    avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null,
    accessToken: token.access_token,
  })
  await setSignedCookie(c, SESSION_COOKIE, sessionId, config.sessionSecret, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 7,
  })
  return c.redirect(`${config.appUrl}/?register=1`)
})

auth.post('/logout', async (c) => {
  const id = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE)
  if (id) sessions.delete(id)
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})
