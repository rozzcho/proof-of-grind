import { useEffect, useState } from 'react'
import { HOW_TO_START, RULES, SUMMARY } from '../content'
import { RULES_URL } from '../config'
import { getMe } from '../lib/api'
import { LineList, NavLink, NavToggle, ToggleList } from './NavToggle'

const CONTACTS = [
  { title: 'Telegram', label: '@suynjo', href: 'https://t.me/suynjo' },
  { title: 'Email', label: 'suynjo@gmail.com', href: 'mailto:suynjo@gmail.com' },
  { title: 'Discord', label: '#ask-the-team', href: 'https://discord.gg/scNbdXFTxq' },
  { title: 'Bugs & feedback', label: '#bug-reports', href: 'https://discord.gg/wxEaVBygGk' },
]

type Section = 'summary' | 'start' | 'rules' | 'contact'

/** Only one section is open at a time: opening one closes the others. */
/** True when the Discord account signed in here may open the staff page. */
function useStaff() {
  const [staff, setStaff] = useState(false)
  useEffect(() => {
    const check = () =>
      getMe()
        .then((me) => setStaff(Boolean(me.staff)))
        .catch(() => setStaff(false))
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [])
  return staff
}

export function NavMenu() {
  const staff = useStaff()
  const [open, setOpen] = useState<Section | null>(null)
  const toggle = (section: Section) => ({
    open: open === section,
    onToggle: () => setOpen((current) => (current === section ? null : section)),
  })

  return (
    <nav className="nav-menu">
      <NavToggle label="Challenge summary" {...toggle('summary')}>
        <ToggleList items={SUMMARY} numbered={false} />
      </NavToggle>
      <NavToggle label="How to start" {...toggle('start')}>
        <ToggleList items={HOW_TO_START} />
      </NavToggle>
      <NavToggle label="Rules" {...toggle('rules')}>
        <LineList
          items={RULES}
          footer={
            <p className="steps-footer">
              <a href={RULES_URL} target="_blank" rel="noopener noreferrer">
                Full rules
              </a>
            </p>
          }
        />
      </NavToggle>
      <NavToggle label="Contact" {...toggle('contact')}>
        <ul className="steps steps-plain contact-list">
          {CONTACTS.map((contact) => (
            <li key={contact.title}>
              <div>
                <strong>{contact.title}</strong>
                <p>
                  {contact.href ? (
                    <a href={contact.href} target="_blank" rel="noopener noreferrer">
                      {contact.label}
                    </a>
                  ) : (
                    contact.label
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </NavToggle>
      {staff && <NavLink label="Staff" href="/staff" />}
    </nav>
  )
}
