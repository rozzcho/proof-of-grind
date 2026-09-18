import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { BIWEEKLY, BIWEEKLY_OPEN } from '../config'
import { challengePda, participantPda } from '../lib/program'
import type { Challenge } from '../lib/schedule'
import { ChallengeCardBody } from './ChallengeCard'
import { PaymentPanel } from './PaymentPanel'

const RESUME_TRACK_KEY = 'pog:register-track'

// Set by the server when Discord OAuth sends the user back.
function takeReturnParams() {
  const url = new URL(window.location.href)
  const resume = url.searchParams.has('register')
  const discordError = url.searchParams.has('discord_error')
  if (resume || discordError) {
    url.searchParams.delete('register')
    url.searchParams.delete('discord_error')
    window.history.replaceState(null, '', url)
  }
  let track: number | null = null
  try {
    const saved = sessionStorage.getItem(RESUME_TRACK_KEY)
    track = saved === null ? null : Number(saved)
  } catch {
    // The form reopens on the first track instead.
  }
  return { resume, discordError, track }
}

// Read once at load (StrictMode runs state initializers twice, which would drop the params).
const returned = takeReturnParams()

/** Whether the connected wallet joined each challenge; `refresh` re-checks (e.g. after leaving the form). */
function useRegistered(challenges: Challenge[], refresh: number) {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [registered, setRegistered] = useState<Record<number, boolean>>({})
  const keys = challenges.map((c) => `${c.track}:${c.id}`).join(',')

  useEffect(() => {
    if (!publicKey) {
      setRegistered({})
      return
    }
    let cancelled = false
    const accounts = challenges.map((c) => participantPda(challengePda(c.track, c.id), publicKey))
    connection
      .getMultipleAccountsInfo(accounts)
      .then((infos) => {
        if (!cancelled) setRegistered(Object.fromEntries(challenges.map((c, i) => [c.track, Boolean(infos[i])])))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // `keys` stands in for `challenges`, which is a new array on every render.
  }, [connection, publicKey, keys, refresh])

  return [registered, setRegistered] as const
}

/**
 * The next challenge, one track at a time: the switch in the corner flips between Weekly and
 * Biweekly. Register turns the card into that track's registration form in place; Back returns
 * to the overview. Connects a wallet first when needed.
 */
export function NextChallengeCard({ challenge, biweekly }: { challenge: Challenge; biweekly: Challenge }) {
  const [registering, setRegistering] = useState(returned.resume)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [formTrack, setFormTrack] = useState(() =>
    returned.resume && returned.track === biweekly.track && BIWEEKLY_OPEN ? biweekly.track : challenge.track,
  )
  const [registered, setRegistered] = useRegistered([challenge, biweekly], refresh)
  const formChallenge = formTrack === biweekly.track ? biweekly : challenge
  const [shownTrack, setShownTrack] = useState(formTrack)
  const shown = shownTrack === biweekly.track ? biweekly : challenge
  const shownOpen = shown !== biweekly || BIWEEKLY_OPEN

  const back = useCallback(() => {
    if (busy) return
    setRegistering(false)
    setRefresh((n) => n + 1)
  }, [busy])

  useEffect(() => {
    if (!registering) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registering, back])

  const onRegisteredChange = useCallback(
    (value: boolean | null) => {
      if (value !== null) setRegistered((current) => ({ ...current, [formTrack]: value }))
    },
    [formTrack, setRegistered],
  )

  const start = (track: number) => {
    setFormTrack(track)
    try {
      // Discord login leaves the site; this reopens the same track's form on the way back.
      sessionStorage.setItem(RESUME_TRACK_KEY, String(track))
    } catch {
      // Falls back to the first track.
    }
    // The form opens without a wallet: the entry fee and multiply are the same for everyone,
    // and the form's Wallet row connects one when it is time to pay.
    setRegistering(true)
  }

  const showForm = registering
  const formRegistered = registered[formTrack]

  // Both views sit in the same grid cell, so the card keeps the height of the taller one
  // and does not jump when switching between them.
  return (
    <section className="card card-stack">
      <div className="card-pane" aria-hidden={showForm} inert={showForm} data-active={!showForm}>
        <div className="card-head">
          <h2 className="card-title">Next Challenge</h2>
          <button
            type="button"
            className="zone-toggle card-head-end"
            onClick={() => setShownTrack(shown === biweekly ? challenge.track : biweekly.track)}
            aria-label={`Showing ${shown === biweekly ? 'Biweekly' : 'Weekly'}. Switch.`}
          >
            {shown === biweekly ? 'biweekly' : 'weekly'}
          </button>
        </div>
        {shownOpen ? (
          <ChallengeCardBody challenge={shown} countdownTo={shown.startMs} emptyText="">
            <button type="button" className="pay-button" onClick={() => start(shown.track)}>
              {registered[shown.track] ? 'View registration' : 'Register'}
            </button>
          </ChallengeCardBody>
        ) : (
          <BiweeklyComingSoon />
        )}
      </div>
      <div
        className="card-pane"
        aria-hidden={!showForm}
        inert={!showForm}
        data-active={showForm}
        aria-label={`Register for ${formChallenge.label}`}
      >
        <div className="card-head">
          <button type="button" className="card-back" onClick={back} disabled={busy}>
            ← Back
          </button>
          <h2 className="card-title">{formRegistered ? 'Registration' : 'Register'}</h2>
        </div>
        <p className="card-subject">{formChallenge.label}</p>
        {/* keyed by challenge so the form resets when registration rolls over or the track changes */}
        <PaymentPanel
          key={`${formChallenge.track}:${formChallenge.id}`}
          challenge={formChallenge}
          // Loads while hidden too, so its messages are already there when the form opens.
          open
          discordError={returned.discordError}
          onBusyChange={setBusy}
          onRegisteredChange={onRegisteredChange}
        />
      </div>
    </section>
  )
}

/** Biweekly before it opens: the same layout as an open track, with nothing filled in. */
function BiweeklyComingSoon() {
  return (
    <>
      <p className="card-countdown" aria-label="Registration not open yet">
        --:--:--
      </p>
      <p className="card-subject">{BIWEEKLY.name} · Coming soon.</p>
      <dl className="card-rows">
        <dt>date</dt>
        <dd />
        <dt>participants</dt>
        <dd />
        <dt>prize pool</dt>
        <dd />
      </dl>
      <div className="card-actions">
        <button type="button" className="pay-button" disabled>
          Register
        </button>
      </div>
    </>
  )
}
