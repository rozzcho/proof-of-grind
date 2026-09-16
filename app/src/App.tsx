import { Header } from './components/Header'
import { NavMenu } from './components/NavMenu'
import { SidePanel } from './components/SidePanel'

export default function App() {
  return (
    <main className="page">
      <Header />
      <div className="columns">
        <NavMenu />
        <SidePanel />
      </div>
    </main>
  )
}
