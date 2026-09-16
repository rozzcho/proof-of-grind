import { Connection, Transaction } from '@solana/web3.js'

export class ExpiredError extends Error {
  constructor() {
    super('The transaction expired before it was approved. Approve the new one to finish.')
  }
}

type SignTransaction = (tx: Transaction) => Promise<Transaction>

/**
 * Signs with the wallet and sends through our own RPC, re-broadcasting until the transaction
 * confirms. Wallets like Nightly refuse to send to a chain they don't know, and dropped
 * transactions are silently lost, so we drive sending and confirmation ourselves.
 * Throws ExpiredError if the blockhash expires (a transaction is valid for ~1 minute).
 */
export async function signAndConfirm(
  connection: Connection,
  signTransaction: SignTransaction,
  serializedTx: Buffer,
  lastValidBlockHeight: number,
  pollMs = 1500,
): Promise<string> {
  const tx = Transaction.from(serializedTx)
  // serialize() verifies both the server's and the wallet's signatures.
  const raw = (await signTransaction(tx)).serialize()
  const signature = await connection.sendRawTransaction(raw, { maxRetries: 5 })

  for (;;) {
    const status = (await connection.getSignatureStatuses([signature])).value[0]
    if (status?.err) throw new Error(JSON.stringify(status.err))
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
      return signature
    }
    if ((await connection.getBlockHeight()) > lastValidBlockHeight) {
      // Give it one more moment: it may have landed right before expiry.
      await new Promise((resolve) => setTimeout(resolve, pollMs))
      const final = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0]
      if (final?.err) throw new Error(JSON.stringify(final.err))
      if (final) return signature
      throw new ExpiredError()
    }
    await connection.sendRawTransaction(raw, { skipPreflight: true }).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
