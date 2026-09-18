import { AccountActions } from './components/AccountActions'
import { StaffPage } from './components/StaffPage'
import { Clock } from './components/Clock'
import { Header } from './components/Header'
import { NavMenu } from './components/NavMenu'
import { StatusPanel } from './components/StatusPanel'

export default function App() {
  // One extra page, no router: /staff is for running the challenges.
  if (window.location.pathname.replace(/\/$/, '') === '/staff') return <StaffPage />

  return (
    <main className="page">
      {/* Title and clock share the first row and bottom edge; cards line up with the account buttons. */}
      <div className="columns">
        <Header />
        <Clock />
        <AccountActions />
        <StatusPanel />
        <NavMenu />
      </div>
    </main>
  )
}
