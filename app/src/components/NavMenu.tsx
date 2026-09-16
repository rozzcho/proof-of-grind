import { HOW_TO_START, RULES, SUMMARY } from '../content'
import { NavToggle, ToggleList } from './NavToggle'

export function NavMenu() {
  return (
    <nav className="nav-menu">
      <NavToggle label="Challenge summary">
        <ToggleList items={SUMMARY} numbered={false} />
      </NavToggle>
      <NavToggle label="How to start">
        <ToggleList items={HOW_TO_START} />
      </NavToggle>
      <NavToggle label="Rules">
        <ToggleList items={RULES} />
      </NavToggle>
    </nav>
  )
}
