import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import flame from '../assets/flame.png'
import { DiscordButton } from './DiscordButton'

export function Header() {
  return (
    <header className="header">
      <div className="brand">
        <img className="brand-logo" src={flame} alt="" />
        <h1 className="brand-title">Proof of Grind</h1>
      </div>
      <div className="header-actions">
        <WalletMultiButton />
        <DiscordButton />
      </div>
    </header>
  )
}
