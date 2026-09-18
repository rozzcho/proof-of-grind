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

export type ChallengeDay = {
  dayIndex: number
  seconds: number
  /** That day's goal, lowered by any server outage (older servers leave it out). */
  goalSeconds?: number
  goalMet: boolean
  recorded: boolean
}

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

export type StaffDay = { dayIndex: number; seconds: number; goalSeconds: number; goalMet: boolean; recorded: boolean }

export type StaffParticipant = {
  discordId: string
  name: string | null
  wallet: string
  multiply: number
  paidUsdc: number
  registeredAt: number
  daysPassed: number
  recorded: number
  onChainDays: number
  passedEveryDay: boolean
  warnings: number
  counting: boolean
  days: StaffDay[]
  tallied: boolean
  claimed: boolean
}

export type StaffChallenge = {
  track: number
  name: string
  challengeId: number
  startMs: number
  endMs: number
  resultsOpenMs: number
  exists: boolean
  finalized: boolean
  rolledOver: boolean
  entryPoolUsdc: number
  carryOverUsdc: number
  winnerCount: number
  tallied: number
  claimed: number
  days: number
  participants: StaffParticipant[]
}

export type StaffReport = {
  id: number
  track: number
  challengeId: number
  reporterId: string
  targetId: string
  reason: string | null
  status: string
  createdAt: number
  warned: boolean
  jurors: { vote: string | null; expired: boolean }[]
  names: Record<string, string>
}

export type StaffOverview = {
  now: number
  goalSeconds: number
  challenges: StaffChallenge[]
  server: {
    bot: { healthy: boolean; ready: boolean; lastFlushSecondsAgo: number | null; disconnectedSince: string | null }
    oracle: string
    oracleSol: number | null
    faucet: string | null
    faucetSol: number | null
    faucetMaxSol: number
    outages: { startMs: number; endMs: number }[]
  }
  reports: StaffReport[]
}

export function getStaffOverview() {
  return request<StaffOverview>('/api/staff/overview')
}

export function staffSendSol(wallet: string, sol: number) {
  return request<{ sent: boolean; sol: number; signature: string; balance: number }>('/api/staff/send-sol', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet, sol }),
  })
}

export function staffCreditDay(track: number, challengeId: number, discordId: string, dayIndex: number) {
  return request<{ credited: boolean; signature: string }>('/api/staff/credit-day', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track, challengeId, discordId, dayIndex }),
  })
}

export function requestTestSol(wallet: string) {
  return request<{ sent: boolean; sol?: number; reason?: string }>('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  })
}
