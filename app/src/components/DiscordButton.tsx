import discordIcon from '../assets/discord.webp'
import { DISCORD_INVITE_URL } from '../config'

export function DiscordButton() {
  return (
    <a
      className="discord-button"
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join Discord"
    >
      <img src={discordIcon} alt="" />
    </a>
  )
}
