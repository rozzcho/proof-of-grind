import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import type { Challenge } from '../lib/schedule'
import { ChallengeCard } from './ChallengeCard'
import { PaymentPanel } from './PaymentPanel'

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
  return { resume, discordError }
}

// Read once at load (StrictMode runs state initializers twice, which would drop the params).
const returned = takeReturnParams()

/**
 * The next challenge. Register turns this card into the registration form in place;
 * Back returns to the overview. Connects a wallet first when needed.
 */
export function NextChallengeCard({ challenge }: { challenge: Challenge }) {
  const { connected } = useWallet()
  const { visible: walletModalVisible, setVisible: setWalletModalVisible } = useWalletModal()
  const [resuming, setResuming] = useState(returned.resume)
  const [pending, setPending] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [busy, setBusy] = useState(false)

  // Back from Discord: wait for wallet auto-connect, then reopen the form.
  useEffect(() => {
    if (!resuming) return
    if (connected) {
      setResuming(false)
      setRegistering(true)
      return
    }
    const timer = setTimeout(() => {
      setResuming(false)
      setPending(true)
      setWalletModalVisible(true)
    }, 1500)
    return () => clearTimeout(timer)
  }, [resuming, connected, setWalletModalVisible])

  // Open the form right after the wallet connects; drop the intent if the wallet modal is dismissed.
  useEffect(() => {
    if (!pending) return
    if (connected) {
      setPending(false)
      setRegistering(true)
    } else if (!walletModalVisible) {
      setPending(false)
    }
  }, [pending, connected, walletModalVisible])

  useEffect(() => {
    if (!connected) setRegistering(false)
  }, [connected])

  const back = useCallback(() => {
    if (!busy) setRegistering(false)
  }, [busy])

  useEffect(() => {
    if (!registering) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [registering, back])

  const start = () => {
    if (connected) {
      setRegistering(true)
    } else {
      setPending(true)
      setWalletModalVisible(true)
    }
  }

  if (registering && connected) {
    return (
      <section className="card" aria-label={`Register for ${challenge.label}`}>
        <div className="card-head">
          <button type="button" className="card-back" onClick={back} disabled={busy}>
            ← Back
          </button>
          <h2 className="card-title">Register</h2>
        </div>
        <p className="card-subject">{challenge.label}</p>
        {/* keyed by challenge so the form resets when registration rolls over */}
        <PaymentPanel
          key={challenge.id}
          challenge={challenge}
          open
          discordError={returned.discordError}
          onBusyChange={setBusy}
        />
      </section>
    )
  }

  return (
    <ChallengeCard title="Next Challenge" challenge={challenge} countdownTo={challenge.startMs} emptyText="">
      <button type="button" className="pay-button" onClick={start}>
        Register
      </button>
    </ChallengeCard>
  )
}
