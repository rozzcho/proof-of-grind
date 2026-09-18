import { useEffect, useRef, useState } from 'react'
import discordIcon from '../assets/discord.webp'
import { DISCORD_INVITE_URL } from '../config'
import { DISCORD_LOGIN_URL, getMe, logout, type Me } from '../lib/api'

/**
 * The Discord half of the account buttons, next to the wallet button: connects an account, then
 * shows who is connected with the server link, switching accounts and logging out behind it.
 */
export function DiscordButton() {
  const [me, setMe] = useState<Me | null>(null)
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = () =>
    getMe()
      .then(setMe)
      .catch(() => setMe({ oauthConfigured: false, discord: null }))

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])

  // A click anywhere outside closes the menu.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const discord = me?.discord ?? null

  // Not connected (or Discord login is not set up): the button starts the login.
  if (!discord) {
    return (
      <a className="discord-button" href={DISCORD_LOGIN_URL} aria-label="Connect Discord">
        <img src={discordIcon} alt="" />
        <span className="discord-label">Connect</span>
      </a>
    )
  }

  return (
    <div className="discord-menu" ref={menuRef}>
      <button
        type="button"
        className="discord-button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={discord.username}
      >
        <img src={discord.avatarUrl ?? discordIcon} alt="" className={discord.avatarUrl ? 'discord-avatar' : undefined} />
        <span className="discord-label">{discord.username}</span>
      </button>
      {open && (
        <div className="discord-dropdown">
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">
            Open server
          </a>
          <a
            href={`${DISCORD_LOGIN_URL}?switch=1`}
            onClick={async (e) => {
              e.preventDefault()
              await logout().catch(() => {})
              window.location.href = `${DISCORD_LOGIN_URL}?switch=1`
            }}
          >
            Switch account
          </a>
          <button
            type="button"
            onClick={async () => {
              await logout().catch(() => {})
              setOpen(false)
              load()
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
