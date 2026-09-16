import { HOW_TO_START, RULES } from '../content'
import { NavToggle, ToggleList } from './NavToggle'
import { RegisterToggle } from './RegisterToggle'

export function NavMenu() {
  return (
    <nav className="nav-menu">
      <RegisterToggle />
      <NavToggle label="How to start">
        <ToggleList items={HOW_TO_START} />
      </NavToggle>
      <NavToggle label="Rules">
        <ToggleList items={RULES} />
      </NavToggle>
    </nav>
  )
}
