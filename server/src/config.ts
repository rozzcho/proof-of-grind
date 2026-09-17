function optional(name: string) {
  return process.env[name] || undefined
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  // A trailing slash would produce '//auth/discord/callback', which Discord rejects.
  appUrl: (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  rpcUrl: process.env.RPC_URL ?? 'http://127.0.0.1:8899',
  sessionSecret: optional('SESSION_SECRET') ?? crypto.randomUUID() + crypto.randomUUID(),
  // Local dev keeps the key in a file; hosting providers pass it as a JSON array instead.
  verifierKeyPath: new URL('../.keys/verifier.json', import.meta.url),
  verifierSecretKey: optional('VERIFIER_SECRET_KEY'),
  // Hands out a little SOL so testers can pay transaction fees.
  faucetKeyPath: new URL('../.keys/faucet.json', import.meta.url),
  faucetSecretKey: optional('FAUCET_SECRET_KEY'),
  faucetSol: Number(process.env.FAUCET_SOL ?? 0.05),
  discord: {
    clientId: optional('DISCORD_CLIENT_ID'),
    clientSecret: optional('DISCORD_CLIENT_SECRET'),
    botToken: optional('DISCORD_BOT_TOKEN'),
    guildId: optional('DISCORD_GUILD_ID'),
    // Weekly (and the test track) use these; Biweekly has its own room and role.
    roleId: optional('DISCORD_ROLE_ID'),
    voiceChannelId: optional('DISCORD_VOICE_CHANNEL_ID'),
    biweeklyRoleId: optional('DISCORD_BIWEEKLY_ROLE_ID'),
    biweeklyVoiceChannelId: optional('DISCORD_BIWEEKLY_VOICE_CHANNEL_ID'),
    // Staff channel where report outcomes are logged (optional).
    reportsChannelId: optional('DISCORD_REPORTS_CHANNEL_ID'),
  },
  dailyGoalSeconds: Number(process.env.DAILY_GOAL_SECONDS ?? 3 * 60 * 60),
  // Tracks this server runs, e.g. "0,1". 0 = Weekly, 1 = Biweekly, 2 = the short test track.
  // CHALLENGE_TRACK (a single track) still works for older setups.
  challengeTracks: (process.env.CHALLENGE_TRACKS ?? process.env.CHALLENGE_TRACK ?? '0')
    .split(',')
    .map((track) => Number(track.trim())),
  flushIntervalMs: Number(process.env.FLUSH_INTERVAL_MS ?? 30_000),
  dbPath: process.env.DB_PATH ?? new URL('../data/grind.db', import.meta.url),
}

/** Cookies must be Secure when the site is served over https. */
export const secureCookies = config.appUrl.startsWith('https://')

// OAuth callback goes through the app origin (Vite proxies /auth) so cookies stay first-party.
export const redirectUri = `${config.appUrl}/auth/discord/callback`

export const oauthConfigured = Boolean(config.discord.clientId && config.discord.clientSecret)
const BIWEEKLY = 1

/** The Discord role and voice channel for a track's participants. */
export function discordFor(track: number) {
  return track === BIWEEKLY
    ? { roleId: config.discord.biweeklyRoleId, voiceChannelId: config.discord.biweeklyVoiceChannelId }
    : { roleId: config.discord.roleId, voiceChannelId: config.discord.voiceChannelId }
}

export const botConfigured = Boolean(config.discord.botToken && config.discord.guildId && config.discord.roleId)
