import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { NETWORK_LABEL, WEEKLY_CHALLENGE, explorerTxUrl } from '../config'
import {
  DISCORD_LOGIN_URL,
  confirmRegistration,
  getMe,
  getRegisterTx,
  logout,
  type GrantResult,
  type Me,
} from '../lib/api'
import { challengePda, participantPda, usdcAta } from '../lib/program'

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'registered' }
  | { kind: 'paying' }
  | { kind: 'success'; signature: string }
  | { kind: 'error'; message: string }

type Access = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; result: GrantResult } | { kind: 'failed' }

const challenge = challengePda(WEEKLY_CHALLENGE.track, WEEKLY_CHALLENGE.id)

function shorten(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

function errorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message || err.name : String(err)
  if (/already in use/i.test(text)) return 'You are already registered.'
  if (/insufficient funds/i.test(text)) return 'Not enough USDC.'
  if (/User rejected|rejected the request/i.test(text)) return 'Transaction was cancelled.'
  if (/Failed to fetch|Request failed \(50[24]\)/i.test(text)) return 'Server is offline. Start it with `npm --prefix server run dev`.'
  if (/Signature verification failed/i.test(text)) return 'Wallet signature was invalid. Try again.'
  return text || 'Something went wrong. Try again.'
}

function accessMessage(access: Access) {
  switch (access.kind) {
    case 'checking':
      return 'Unlocking the private Discord room…'
    case 'failed':
      return "Couldn't reach Discord. Try again."
    case 'done': {
      const { roleGranted, joinedGuild, reason } = access.result
      if (roleGranted) return joinedGuild ? 'Joined the Discord server. Private room unlocked.' : 'Private room unlocked on Discord.'
      if (reason === 'bot-not-configured') return 'The Discord bot is offline. Your role will be given once it is running.'
      if (reason === 'not-in-guild') return 'Join the Discord server, then check again.'
      return "Couldn't give the Discord role. Try again."
    }
    default:
      return null
  }
}

export function PaymentModal({ discordError, onClose }: { discordError?: boolean; onClose: () => void }) {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [balance, setBalance] = useState<number | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [access, setAccess] = useState<Access>({ kind: 'idle' })

  const busy = status.kind === 'paying' || access.kind === 'checking'
  const fee = WEEKLY_CHALLENGE.entryFeeUsdc
  const discord = me?.discord ?? null

  const load = useCallback(async () => {
    if (!publicKey) return
    setStatus({ kind: 'loading' })
    getMe()
      .then(setMe)
      .catch(() => setMe({ oauthConfigured: false, discord: null }))
    try {
      const [challengeInfo, participantInfo, tokenBalance] = await Promise.all([
        connection.getAccountInfo(challenge),
        connection.getAccountInfo(participantPda(challenge, publicKey)),
        connection.getTokenAccountBalance(usdcAta(publicKey)).catch(() => null),
      ])
      setBalance(tokenBalance ? Number(tokenBalance.value.uiAmount ?? 0) : 0)
      if (!challengeInfo) setStatus({ kind: 'not-found' })
      else if (participantInfo) setStatus({ kind: 'registered' })
      else setStatus({ kind: 'ready' })
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    }
  }, [connection, publicKey])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const unlockDiscord = async () => {
    setAccess({ kind: 'checking' })
    try {
      setAccess({ kind: 'done', result: await confirmRegistration() })
    } catch {
      setAccess({ kind: 'failed' })
    }
  }

  const switchDiscord = async () => {
    await logout().catch(() => {})
    window.location.href = `${DISCORD_LOGIN_URL}?switch=1`
  }

  const pay = async () => {
    if (!publicKey) return
    if (!signTransaction) {
      setStatus({ kind: 'error', message: 'This wallet cannot sign transactions.' })
      return
    }
    setStatus({ kind: 'paying' })
    try {
      // Server builds the transaction and co-signs it for the verified Discord account.
      const { transaction, lastValidBlockHeight } = await getRegisterTx(publicKey.toBase58())
      const bytes = Buffer.from(transaction, 'base64')

      // Simulate on a copy: simulateTransaction replaces the blockhash, which would void the server signature.
      const sim = await connection.simulateTransaction(Transaction.from(bytes))
      if (sim.value.err) {
        const logs = sim.value.logs?.join('\n') ?? ''
        throw new Error(logs || JSON.stringify(sim.value.err))
      }

      // Wallet only signs; we send through our RPC. (Wallets like Nightly don't list localnet as a
      // supported chain, so the adapter's sendTransaction rejects before asking the wallet.)
      const tx = Transaction.from(bytes)
      const signed = await signTransaction(tx)
      // serialize() verifies both the verifier's and the wallet's signatures.
      const signature = await connection.sendRawTransaction(signed.serialize())
      const result = await connection.confirmTransaction(
        { signature, blockhash: tx.recentBlockhash!, lastValidBlockHeight },
        'confirmed',
      )
      if (result.value.err) throw new Error(JSON.stringify(result.value.err))

      setBalance((b) => (b === null ? b : b - fee))
      setStatus({ kind: 'success', signature })
      unlockDiscord()
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    }
  }

  const insufficient = balance !== null && balance < fee
  const displayBalance = balance === null ? '…' : balance.toFixed(2)
  const accessText = accessMessage(access)
  const canRetryAccess = access.kind === 'failed' || (access.kind === 'done' && !access.result.roleGranted)

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="payment-title" className="modal-title">
            {WEEKLY_CHALLENGE.label}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>

        <dl className="modal-rows">
          <dt>Entry fee</dt>
          <dd>{fee} USDC</dd>
          <dt>Your balance</dt>
          <dd>{displayBalance} USDC</dd>
          <dt>Wallet</dt>
          <dd>{publicKey ? shorten(publicKey.toBase58()) : '-'}</dd>
          <dt>Discord</dt>
          <dd>
            {me === null ? (
              '…'
            ) : discord ? (
              <span className="modal-discord">
                {discord.avatarUrl && <img src={discord.avatarUrl} alt="" />}
                {discord.username}
                {status.kind !== 'success' && status.kind !== 'registered' && (
                  <button type="button" className="modal-link" onClick={switchDiscord} disabled={busy}>
                    switch
                  </button>
                )}
              </span>
            ) : (
              <a className="modal-link" href={DISCORD_LOGIN_URL}>
                Connect Discord
              </a>
            )}
          </dd>
          <dt>Network</dt>
          <dd>{NETWORK_LABEL}</dd>
        </dl>

        {status.kind === 'success' ? (
          <div className="modal-message">
            <p>Registered. Start grinding!</p>
            {accessText && <p>{accessText}</p>}
            <a className="modal-link" href={explorerTxUrl(status.signature)} target="_blank" rel="noopener noreferrer">
              View transaction
            </a>
          </div>
        ) : status.kind === 'registered' ? (
          <div className="modal-message">
            <p>You are already registered.</p>
            {accessText && <p>{accessText}</p>}
          </div>
        ) : status.kind === 'not-found' ? (
          <p className="modal-message">This challenge is not open yet.</p>
        ) : (
          <>
            {discordError && !discord && <p className="modal-message modal-error">Discord login failed. Try again.</p>}
            {me && !me.oauthConfigured && !discord && (
              <p className="modal-message modal-error">Discord login is not set up on the server yet.</p>
            )}
            {status.kind === 'error' && <p className="modal-message modal-error">{status.message}</p>}
            {insufficient && status.kind !== 'loading' && (
              <p className="modal-message modal-error">Not enough USDC.</p>
            )}
            <button
              type="button"
              className="modal-pay"
              onClick={pay}
              disabled={status.kind === 'loading' || busy || insufficient || !discord}
            >
              {status.kind === 'paying' ? 'Processing…' : discord ? `Pay ${fee} USDC` : 'Connect Discord to pay'}
            </button>
          </>
        )}

        {status.kind === 'registered' && discord && (access.kind === 'idle' || canRetryAccess) && (
          <button type="button" className="modal-pay" onClick={unlockDiscord}>
            Check Discord access
          </button>
        )}
        {status.kind === 'success' && canRetryAccess && (
          <button type="button" className="modal-pay" onClick={unlockDiscord}>
            Retry Discord access
          </button>
        )}
      </div>
    </div>
  )
}
