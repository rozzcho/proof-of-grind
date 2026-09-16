import { useSyncExternalStore } from 'react'

export type TimeZoneMode = 'local' | 'utc'

const STORAGE_KEY = 'pog:time-zone'
const listeners = new Set<() => void>()

let mode: TimeZoneMode = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'utc' ? 'utc' : 'local'
  } catch {
    return 'local'
  }
})()

function toggle() {
  mode = mode === 'local' ? 'utc' : 'local'
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Remembering the choice is only a convenience.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shared by every card, so switching one switches them all. */
export function useTimeZoneMode() {
  return [useSyncExternalStore(subscribe, () => mode), toggle] as const
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** e.g. "Sep 21 09:00" */
export function formatDateTime(ms: number, zone: TimeZoneMode) {
  const d = new Date(ms)
  const utc = zone === 'utc'
  const month = utc ? d.getUTCMonth() : d.getMonth()
  const day = utc ? d.getUTCDate() : d.getDate()
  const hours = utc ? d.getUTCHours() : d.getHours()
  const minutes = utc ? d.getUTCMinutes() : d.getMinutes()
  return `${MONTHS[month]} ${day} ${pad(hours)}:${pad(minutes)}`
}
