import flame from '../assets/flame.png'

export function Header() {
  return (
    <header className="header">
      <div className="brand">
        <img className="brand-logo" src={flame} alt="" />
        <h1 className="brand-title">Proof of Grind</h1>
      </div>
    </header>
  )
}
