import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Transaction } from '@solana/web3.js'
import { CHALLENGE, NETWORK_LABEL, explorerTxUrl } from '../config'
import {
  DISCORD_LOGIN_URL,
  confirmRegistration,
  getMe,
  getRegisterTx,
  logout,
  requestTestSol,
  type GrantResult,
  type Me,
} from '../lib/api'
import { challengePda, participantPda, usdcAta } from '../lib/program'
import { ExpiredError, signAndConfirm } from '../lib/send'
import type { OpenChallenge } from '../lib/schedule'

type Status =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'registered' }
  | { kind: 'paying' }
  | { kind: 'success'; signature: string }
  | { kind: 'error'; message: string }

type Access = { kind: 'idle' } | { kind: 'checking' } | { kind: 'done'; result: GrantResult } | { kind: 'failed' }

function formatUsdc(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
}

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

type Props = {
  challenge: OpenChallenge
  open: boolean
  discordError?: boolean
  /** Lets a surrounding modal refuse to close while a payment is in flight. */
  onBusyChange?: (busy: boolean) => void
}

export function PaymentPanel({ challenge: openChallenge, open, discordError, onBusyChange }: Props) {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [balance, setBalance] = useState<number | null>(null)
  const [sol, setSol] = useState<number | null>(null)
  const [funding, setFunding] = useState(false)
  const [me, setMe] = useState<Me | null>(null)
  const [access, setAccess] = useState<Access>({ kind: 'idle' })
  const [multiply, setMultiply] = useState(1)
  const [showInfo, setShowInfo] = useState(false)
  const challenge = useMemo(() => challengePda(CHALLENGE.track, openChallenge.id), [openChallenge.id])

  const busy = status.kind === 'paying' || access.kind === 'checking'
  const busyRef = useRef(busy)
  busyRef.current = busy
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])
  const total = CHALLENGE.entryFeeUsdc * multiply
  const discord = me?.discord ?? null

  const load = useCallback(async () => {
    if (!publicKey) return
    setStatus({ kind: 'loading' })
    getMe()
      .then(setMe)
      .catch(() => setMe({ oauthConfigured: false, discord: null }))
    try {
      const [participantInfo, tokenBalance, lamports] = await Promise.all([
        connection.getAccountInfo(participantPda(challenge, publicKey)),
        connection.getTokenAccountBalance(usdcAta(publicKey)).catch(() => null),
        connection.getBalance(publicKey).catch(() => null),
      ])
      setBalance(tokenBalance ? Number(tokenBalance.value.uiAmount ?? 0) : 0)
      setSol(lamports === null ? null : lamports / 1_000_000_000)
      if (participantInfo) setStatus({ kind: 'registered' })
      else setStatus({ kind: 'ready' })
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    }
  }, [connection, publicKey, challenge])

  // Refresh balance/registration each time the section is opened (not mid-payment).
  useEffect(() => {
    if (open && !busyRef.current) load()
  }, [open, load])

  const unlockDiscord = async () => {
    setAccess({ kind: 'checking' })
    try {
      setAccess({ kind: 'done', result: await confirmRegistration() })
    } catch {
      setAccess({ kind: 'failed' })
    }
  }

  const getTestSol = async () => {
    if (!publicKey) return
    setFunding(true)
    try {
      await requestTestSol(publicKey.toBase58())
      await load()
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    } finally {
      setFunding(false)
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
      const { challengeId, transaction, lastValidBlockHeight } = await getRegisterTx(publicKey.toBase58(), multiply)
      if (challengeId !== openChallenge.id) {
        throw new Error(`Registration moved to Weekly Challenge #${challengeId}. Reopen to continue.`)
      }
      const bytes = Buffer.from(transaction, 'base64')

      // Simulate on a copy: simulateTransaction replaces the blockhash, which would void the server signature.
      const sim = await connection.simulateTransaction(Transaction.from(bytes))
      if (sim.value.err) {
        const logs = sim.value.logs?.join('\n') ?? ''
        throw new Error(logs || JSON.stringify(sim.value.err))
      }

      // Wallet only signs; we send through our RPC. (Wallets like Nightly don't list localnet as a
      // supported chain, so the adapter's sendTransaction rejects before asking the wallet.)
      let signature: string
      try {
        signature = await signAndConfirm(connection, signTransaction, bytes, lastValidBlockHeight)
      } catch (err) {
        if (!(err instanceof ExpiredError)) throw err
        // Approval took too long: build a fresh transaction and ask for one more signature.
        const retry = await getRegisterTx(publicKey.toBase58(), multiply)
        signature = await signAndConfirm(
          connection,
          signTransaction,
          Buffer.from(retry.transaction, 'base64'),
          retry.lastValidBlockHeight,
        )
      }

      setBalance((b) => (b === null ? b : b - total))
      setStatus({ kind: 'success', signature })
      unlockDiscord()
    } catch (err) {
      setStatus({ kind: 'error', message: errorMessage(err) })
    }
  }

  // Without SOL a wallet cannot pay network fees — and an empty wallet does not exist on chain yet.
  const needsSol = sol !== null && sol < 0.01
  const insufficient = balance !== null && balance < total
  const canEdit = status.kind === 'ready' || status.kind === 'error'
  const displayBalance = balance === null ? '…' : balance.toFixed(2)
  const accessText = accessMessage(access)
  const canRetryAccess = access.kind === 'failed' || (access.kind === 'done' && !access.result.roleGranted)

  return (
    <div className="pay-box">
      <dl className="pay-rows">
        <dt>Entry fee</dt>
        <dd>{CHALLENGE.entryFeeUsdc} USDC</dd>
        <dt className="pay-multiply-label">
          Multiply
          <button
            type="button"
            className="pay-info"
            aria-label="What is multiply?"
            aria-expanded={showInfo}
            onClick={() => setShowInfo((v) => !v)}
          >
            i
          </button>
        </dt>
        <dd>
          <span className="pay-multiply">
          <span className="pay-stepper">
            <button
              type="button"
              aria-label="Decrease multiply"
              onClick={() => setMultiply((m) => Math.max(1, m - 1))}
              disabled={!canEdit || multiply <= 1}
            >
              −
            </button>
            <output aria-live="polite">{multiply}x</output>
            <button
              type="button"
              aria-label="Increase multiply"
              onClick={() => setMultiply((m) => Math.min(CHALLENGE.maxMultiply, m + 1))}
              disabled={!canEdit || multiply >= CHALLENGE.maxMultiply}
            >
              +
            </button>
          </span>
          {showInfo && (
            <p className="pay-info-text">
              Stake as much as you're confident in, and take home a bigger reward! See Rules for details.
            </p>
          )}
          </span>
        </dd>
        <dt>Your balance</dt>
        <dd>{displayBalance} USDC</dd>
        <dt>Wallet</dt>
        <dd>{publicKey ? shorten(publicKey.toBase58()) : '-'}</dd>
        <dt>Discord</dt>
        <dd>
          {me === null ? (
            '…'
          ) : discord ? (
            <span className="pay-discord">
              {discord.avatarUrl && <img src={discord.avatarUrl} alt="" />}
              {discord.username}
              {status.kind !== 'success' && status.kind !== 'registered' && (
                <button type="button" className="pay-link" onClick={switchDiscord} disabled={busy}>
                  switch
                </button>
              )}
            </span>
          ) : (
            <a className="pay-link" href={DISCORD_LOGIN_URL}>
              Connect Discord
            </a>
          )}
        </dd>
        <dt>Network</dt>
        <dd>{NETWORK_LABEL}</dd>
      </dl>

      {status.kind === 'success' ? (
        <div className="pay-message">
          <p>Registered. Start grinding!</p>
          {accessText && <p>{accessText}</p>}
          <a className="pay-link" href={explorerTxUrl(status.signature)} target="_blank" rel="noopener noreferrer">
            View transaction
          </a>
        </div>
      ) : status.kind === 'registered' ? (
        <div className="pay-message">
          <p>You are already registered.</p>
          {accessText && <p>{accessText}</p>}
        </div>
      ) : (
        <>
          {discordError && !discord && <p className="pay-message pay-error">Discord login failed. Try again.</p>}
          {me && !me.oauthConfigured && !discord && (
            <p className="pay-message pay-error">Discord login is not set up on the server yet.</p>
          )}
          {me?.oauthConfigured && !discord && <p className="pay-message">Connect Discord to pay.</p>}
          {needsSol && discord && (
            <>
              <p className="pay-message">Your wallet needs a little SOL for network fees.</p>
              <button type="button" className="pay-button" onClick={getTestSol} disabled={funding}>
                {funding ? 'Sending…' : 'Get test SOL'}
              </button>
            </>
          )}
          {status.kind === 'error' && <p className="pay-message pay-error">{status.message}</p>}
          {insufficient && status.kind !== 'loading' && <p className="pay-message pay-error">Not enough USDC.</p>}
          <button
            type="button"
            className="pay-button"
            onClick={pay}
            disabled={status.kind === 'loading' || busy || insufficient || !discord || needsSol}
          >
            {status.kind === 'paying' ? 'Processing…' : `Pay ${formatUsdc(total)} USDC`}
          </button>
        </>
      )}

      {status.kind === 'registered' && discord && (access.kind === 'idle' || canRetryAccess) && (
        <button type="button" className="pay-button" onClick={unlockDiscord}>
          Check Discord access
        </button>
      )}
      {status.kind === 'success' && canRetryAccess && (
        <button type="button" className="pay-button" onClick={unlockDiscord}>
          Retry Discord access
        </button>
      )}
    </div>
  )
}
