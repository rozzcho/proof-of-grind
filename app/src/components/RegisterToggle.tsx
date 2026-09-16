import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { useOpenWeeklyChallenge } from '../lib/schedule'
import { NavToggle } from './NavToggle'
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

export function RegisterToggle() {
  const { connected } = useWallet()
  const { visible: walletModalVisible, setVisible: setWalletModalVisible } = useWalletModal()
  const [resuming, setResuming] = useState(returned.resume)
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)
  const challenge = useOpenWeeklyChallenge()

  // Back from Discord: wait for wallet auto-connect, then reopen the section.
  useEffect(() => {
    if (!resuming) return
    if (connected) {
      setResuming(false)
      setOpen(true)
      return
    }
    const timer = setTimeout(() => {
      setResuming(false)
      setPending(true)
      setWalletModalVisible(true)
    }, 1500)
    return () => clearTimeout(timer)
  }, [resuming, connected, setWalletModalVisible])

  // Open right after the wallet connects; drop the intent if the wallet modal is dismissed.
  useEffect(() => {
    if (!pending) return
    if (connected) {
      setPending(false)
      setOpen(true)
    } else if (!walletModalVisible) {
      setPending(false)
    }
  }, [pending, connected, walletModalVisible])

  // Disconnecting the wallet collapses the section.
  useEffect(() => {
    if (!connected) setOpen(false)
  }, [connected])

  const toggle = () => {
    if (open) {
      setOpen(false)
    } else if (connected) {
      setOpen(true)
    } else {
      setPending(true)
      setWalletModalVisible(true)
    }
  }

  return (
    <NavToggle label={`Register ${challenge.label}`} open={open} onToggle={toggle}>
      {/* keyed by challenge so the panel resets when registration rolls over to the next week */}
      {connected && (
        <PaymentPanel key={challenge.id} challenge={challenge} open={open} discordError={returned.discordError} />
      )}
    </NavToggle>
  )
}
