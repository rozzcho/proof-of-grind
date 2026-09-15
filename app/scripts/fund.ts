// Sends test SOL + test USDC to a wallet on the local validator.
// usage: npm run local:fund -- <WALLET_ADDRESS> [usdc=100]
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import { USDC_MINT, admin, connection } from './common.ts'

const [address, usdcArg = '100'] = process.argv.slice(2)
if (!address) {
  console.error('usage: npm run local:fund -- <WALLET_ADDRESS> [usdc]')
  process.exit(1)
}
const owner = new PublicKey(address)
const usdc = Number(usdcArg)

const airdrop = await connection.requestAirdrop(owner, 5 * LAMPORTS_PER_SOL)
await connection.confirmTransaction({ signature: airdrop, ...(await connection.getLatestBlockhash()) })

const ata = await getOrCreateAssociatedTokenAccount(connection, admin, USDC_MINT, owner)
await mintTo(connection, admin, USDC_MINT, ata.address, admin, BigInt(Math.round(usdc * 1_000_000)))

console.log(`Funded ${owner.toBase58()}: +5 SOL, +${usdc} USDC`)
