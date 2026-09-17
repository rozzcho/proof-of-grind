import flame from '../assets/flame.png'
import flameLight from '../assets/flame-light.png'
import { useTheme } from '../lib/theme'

export function Header() {
  const [theme] = useTheme()
  return (
    <header className="header">
      <div className="brand">
        <img className="brand-logo" src={theme === 'light' ? flameLight : flame} alt="" />
        <h1 className="brand-title">Proof of Grind</h1>
      </div>
    </header>
  )
}
