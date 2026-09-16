import { useCallback, useEffect, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Program, type Idl } from '@anchor-lang/core'
import { AnchorProvider } from '@anchor-lang/core'
import idl from '../idl/proof_of_grind.json'
import { USDC_MINT, WEEKLY } from '../config'
import { getProgress, type Progress } from '../lib/api'
import { challengePda, participantPda, usdcAta } from '../lib/program'
import { signAndConfirm } from '../lib/send'

type Claim = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string }

/** Progress in the challenge you are in, plus the Claim button once it is settled. */
export function MyChallenge() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const [progress, setProgress] = useState<Progress | null>(null)
  const [claimable, setClaimable] = useState(false)
  const [claim, setClaim] = useState<Claim>({ kind: 'idle' })

  const load = useCallback(async () => {
    const data = await getProgress().catch(() => null)
    setProgress(data)
    if (!data || !publicKey) return

    // Claimable when the challenge is finalized, every day passed, and nothing claimed yet.
    const challenge = challengePda(WEEKLY.track, data.challengeId)
    const [challengeInfo, participantInfo] = await Promise.all([
      connection.getAccountInfo(challenge),
      connection.getAccountInfo(participantPda(challenge, publicKey)),
    ])
    if (!challengeInfo || !participantInfo) {
      setClaimable(false)
      return
    }
    const program = new Program(idl as unknown as Idl, { connection } as AnchorProvider)
    const challengeState = program.coder.accounts.decode<{ finalized: boolean }>('Challenge', challengeInfo.data)
    const participant = program.coder.accounts.decode<{ days_completed: number; claimed: boolean }>(
      'Participant',
      participantInfo.data,
    )
    const fullMask = (1 << data.days.length) - 1
    setClaimable(challengeState.finalized && !participant.claimed && participant.days_completed === fullMask)
  }, [connection, publicKey])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  if (!progress || !publicKey) return null

  const sendClaim = async () => {
    if (!signTransaction) return
    setClaim({ kind: 'sending' })
    try {
      const challenge = challengePda(WEEKLY.track, progress.challengeId)
      const program = new Program(idl as unknown as Idl, { connection } as AnchorProvider)
      const ix = await program.methods
        .claim()
        .accountsPartial({
          user: publicKey,
          challenge,
          participant: participantPda(challenge, publicKey),
          mint: USDC_MINT,
          userTokenAccount: usdcAta(publicKey),
          vault: usdcAta(challenge),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const { Transaction } = await import('@solana/web3.js')
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(ix)
      await signAndConfirm(
        connection,
        signTransaction,
        tx.serialize({ requireAllSignatures: false }),
        lastValidBlockHeight,
      )
      setClaim({ kind: 'done' })
      load()
    } catch (err) {
      setClaim({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const goalHours = progress.goalSeconds / 3600

  return (
    <section className="card">
      <h2 className="card-title">My Challenge</h2>
      <p className="card-subject">
        Weekly Challenge #{progress.challengeId} {progress.running ? '· running' : '· starts soon'}
      </p>
      <ol className="day-grid">
        {progress.days.map((day) => (
          <li
            key={day.dayIndex}
            className="day"
            data-state={day.goalMet ? 'passed' : 'open'}
            title={`Day ${day.dayIndex + 1}: ${(day.seconds / 3600).toFixed(1)}h`}
          >
            {day.dayIndex + 1}
          </li>
        ))}
      </ol>
      <p className="card-note">
        {progress.counting ? 'Camera on — counting now.' : `Goal: ${goalHours}h per day.`}
      </p>
      {claimable && (
        <button type="button" className="pay-button" onClick={sendClaim} disabled={claim.kind === 'sending'}>
          {claim.kind === 'sending' ? 'Claiming…' : 'Claim reward'}
        </button>
      )}
      {claim.kind === 'done' && <p className="card-note">Reward sent to your wallet.</p>}
      {claim.kind === 'error' && <p className="pay-message pay-error">{claim.message}</p>}
    </section>
  )
}
