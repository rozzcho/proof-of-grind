import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { WEEKLY_CHALLENGE } from '../config'
import { PaymentModal } from './PaymentModal'

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

export function RegisterButton() {
  const { connected } = useWallet()
  const { visible: walletModalVisible, setVisible: setWalletModalVisible } = useWalletModal()
  const [resuming, setResuming] = useState(returned.resume)
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)

  // Back from Discord: wait for wallet auto-connect, then reopen payment.
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

  // Open payment right after the wallet connects; drop the intent if the wallet modal is dismissed.
  useEffect(() => {
    if (!pending) return
    if (connected) {
      setPending(false)
      setOpen(true)
    } else if (!walletModalVisible) {
      setPending(false)
    }
  }, [pending, connected, walletModalVisible])

  const handleClick = () => {
    if (connected) {
      setOpen(true)
    } else {
      setPending(true)
      setWalletModalVisible(true)
    }
  }

  return (
    <>
      <button type="button" className="nav-link" onClick={handleClick}>
        Register {WEEKLY_CHALLENGE.label}
      </button>
      {open && <PaymentModal discordError={returned.discordError} onClose={() => setOpen(false)} />}
    </>
  )
}
