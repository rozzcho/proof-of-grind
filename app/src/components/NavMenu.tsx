import { NAV_LINKS } from '../config'

export function NavMenu() {
  return (
    <nav className="nav-menu">
      {NAV_LINKS.map(({ label, href }) => (
        <div key={href} className="nav-item">
          <span className="nav-arrow">=&gt;</span>
          <a className="nav-link" href={href}>
            {label}
          </a>
        </div>
      ))}
    </nav>
  )
}
