import { useState } from 'react'
import { HOW_TO_START, RULES, SUMMARY } from '../content'
import { NavToggle, ToggleList } from './NavToggle'

const CONTACTS = [
  { title: 'Telegram', label: '@suynjo', href: 'https://t.me/suynjo' },
  { title: 'Email', label: 'suynjo@gmail.com', href: 'mailto:suynjo@gmail.com' },
  // Add the Discord support channel link here once it exists.
  { title: 'Discord', label: 'Support channel coming soon', href: null },
]

type Section = 'summary' | 'start' | 'rules' | 'contact'

/** Only one section is open at a time: opening one closes the others. */
export function NavMenu() {
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
        <ToggleList items={RULES} />
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
    </nav>
  )
}
