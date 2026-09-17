import { useEffect, useState } from 'react'
import { useTheme } from '../lib/theme'

const time = (date: Date, timeZone?: string) =>
  date.toLocaleTimeString('en-GB', { hour12: false, timeZone })

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  const [theme, toggleTheme] = useTheme()
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <p className="clock">
      <span>UTC {time(now, 'UTC')}</span>
      <span aria-hidden="true">·</span>
      <span>Local {time(now)}</span>
      <button
        type="button"
        className="zone-toggle theme-toggle"
        onClick={toggleTheme}
        aria-label={`${theme === 'dark' ? 'Dark' : 'Light'} mode. Switch.`}
      >
        {theme}
      </button>
    </p>
  )
}
