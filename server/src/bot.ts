import { Client, Events, GatewayIntentBits } from 'discord.js'
import { botConfigured, config } from './config.ts'
import { registeredDiscordIds } from './solana.ts'

export type GrantResult = { roleGranted: boolean; joinedGuild: boolean; reason?: string }

let client: Client | null = null

export async function startBot() {
  if (!botConfigured) {
    console.warn('[bot] DISCORD_BOT_TOKEN / GUILD_ID / ROLE_ID not set — role granting disabled')
    return
  }
  client = new Client({ intents: [GatewayIntentBits.Guilds] })
  client.once(Events.ClientReady, async (c) => {
    console.log(`[bot] logged in as ${c.user.tag}`)
    await syncRoles().catch((err) => console.error('[bot] role sync failed', err))
  })
  await client.login(config.discord.botToken)
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

/** On startup, make sure every on-chain participant who is in the server has the role. */
async function syncRoles() {
  const ids = await registeredDiscordIds()
  let granted = 0
  for (const id of ids) {
    const result = await grantRole(id).catch(() => null)
    if (result?.roleGranted) granted++
  }
  console.log(`[bot] synced roles: ${granted}/${ids.length} participants`)
}
