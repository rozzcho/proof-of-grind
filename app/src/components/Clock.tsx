import { useEffect, useState } from 'react'

const time = (date: Date, timeZone?: string) =>
  date.toLocaleTimeString('en-GB', { hour12: false, timeZone })

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <p className="clock">
      <span>UTC {time(now, 'UTC')}</span>
      <span aria-hidden="true">·</span>
      <span>Local {time(now)}</span>
    </p>
  )
}
