import { Clock } from './components/Clock'
import { Header } from './components/Header'
import { NavMenu } from './components/NavMenu'
import { StatusPanel } from './components/StatusPanel'

export default function App() {
  return (
    <main className="page">
      <Header />
      {/* Clock sits above the menu so the menu's first line lines up with the top of the cards. */}
      <div className="columns">
        <Clock />
        <StatusPanel />
        <NavMenu />
      </div>
    </main>
  )
}
