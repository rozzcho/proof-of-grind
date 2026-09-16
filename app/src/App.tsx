import { AccountActions } from './components/AccountActions'
import { Clock } from './components/Clock'
import { Header } from './components/Header'
import { NavMenu } from './components/NavMenu'
import { StatusPanel } from './components/StatusPanel'

export default function App() {
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
