import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { DiscordButton } from './DiscordButton'

export function AccountActions() {
  return (
    <div className="account-actions">
      <WalletMultiButton />
      <DiscordButton />
    </div>
  )
}
