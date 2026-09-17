export type DiscordUser = { id: string; username: string; avatarUrl: string | null }

export type Me = { oauthConfigured: boolean; discord: DiscordUser | null }

export type GrantResult = { roleGranted: boolean; joinedGuild: boolean; reason?: string }

export const DISCORD_LOGIN_URL = '/auth/discord/login'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body as T
}

export function getMe() {
  return request<Me>('/api/me')
}

export function logout() {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' })
}

export function getRegisterTx(wallet: string, multiply: number, track: number) {
  return request<{ track: number; challengeId: number; transaction: string; lastValidBlockHeight: number }>(
    '/api/register-tx',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, multiply, track }),
    },
  )
}

export function confirmRegistration() {
  return request<GrantResult>('/api/register/confirm', { method: 'POST' })
}

export type ChallengeDay = { dayIndex: number; seconds: number; goalMet: boolean; recorded: boolean }

export type Progress = {
  track: number
  challengeId: number
  registered: boolean
  claimed: boolean
  running: boolean
  over: boolean
  goalSeconds: number
  counting: boolean
  /** Which day of the challenge is running now, or null outside it. */
  currentDay: number | null
  days: ChallengeDay[]
}

export function getProgress() {
  return request<Progress>('/api/progress')
}

export function requestTestSol(wallet: string) {
  return request<{ sent: boolean; sol?: number; reason?: string }>('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
}
