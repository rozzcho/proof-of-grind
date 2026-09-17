import { useCallback } from 'react'
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { AnchorProvider, Program, type Idl } from '@anchor-lang/core'
import { Transaction } from '@solana/web3.js'
import idl from '../idl/proof_of_grind.json'
import { USDC_MINT } from '../config'
import { challengePda, participantPda, usdcAta, warningPda } from './program'
import { signAndConfirm } from './send'

/** Sends the claim transaction for one challenge with the connected wallet. */
export function useClaimReward() {
  const { connection } = useConnection()
  const { publicKey, signTransaction } = useWallet()
  const anchorWallet = useAnchorWallet()

  return useCallback(
    async (track: number, challengeId: number) => {
      if (!publicKey || !signTransaction || !anchorWallet) throw new Error('Connect your wallet first.')
      const challenge = challengePda(track, challengeId)
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' })
      const program = new Program(idl as unknown as Idl, provider)
      const ix = await program.methods
        .claim()
        .accountsPartial({
          user: publicKey,
          challenge,
          participant: participantPda(challenge, publicKey),
          warning: warningPda(challenge, publicKey),
          mint: USDC_MINT,
          userTokenAccount: usdcAta(publicKey),
          vault: usdcAta(challenge),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction()
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      const tx = new Transaction({ feePayer: publicKey, blockhash, lastValidBlockHeight }).add(ix)
      await signAndConfirm(connection, signTransaction, tx.serialize({ requireAllSignatures: false }), lastValidBlockHeight)
    },
    [connection, publicKey, signTransaction, anchorWallet],
  )
}
