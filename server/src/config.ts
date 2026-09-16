function optional(name: string) {
  return process.env[name] || undefined
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  rpcUrl: process.env.RPC_URL ?? 'http://127.0.0.1:8899',
  sessionSecret: optional('SESSION_SECRET') ?? crypto.randomUUID() + crypto.randomUUID(),
  verifierKeyPath: new URL('../.keys/verifier.json', import.meta.url),
  discord: {
    clientId: optional('DISCORD_CLIENT_ID'),
    clientSecret: optional('DISCORD_CLIENT_SECRET'),
    botToken: optional('DISCORD_BOT_TOKEN'),
    guildId: optional('DISCORD_GUILD_ID'),
    roleId: optional('DISCORD_ROLE_ID'),
    voiceChannelId: optional('DISCORD_VOICE_CHANNEL_ID'),
  },
  dailyGoalSeconds: Number(process.env.DAILY_GOAL_SECONDS ?? 3 * 60 * 60),
  // 0 = weekly, 2 = the short test track (see the program's constants)
  challengeTrack: Number(process.env.CHALLENGE_TRACK ?? 0),
  flushIntervalMs: Number(process.env.FLUSH_INTERVAL_MS ?? 30_000),
  dbPath: new URL('../data/grind.db', import.meta.url),
}

// OAuth callback goes through the app origin (Vite proxies /auth) so cookies stay first-party.
export const redirectUri = `${config.appUrl}/auth/discord/callback`

export const oauthConfigured = Boolean(config.discord.clientId && config.discord.clientSecret)
export const botConfigured = Boolean(config.discord.botToken && config.discord.guildId && config.discord.roleId)
