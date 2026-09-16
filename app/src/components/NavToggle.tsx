import { useId, useState, type ReactNode } from 'react'

export type ToggleItem = { title: string; body: string }

type Props = {
  label: string
  children: ReactNode
  /** Controlled mode: pass both `open` and `onToggle`. */
  open?: boolean
  onToggle?: () => void
}

/** Menu entry that slides its content open below it. */
export function NavToggle({ label, children, open: controlledOpen, onToggle }: Props) {
  const [localOpen, setLocalOpen] = useState(false)
  const open = controlledOpen ?? localOpen
  const panelId = useId()

  return (
    <div className="nav-item">
      <span className="nav-arrow">=&gt;</span>
      <button
        type="button"
        className="nav-link"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle ?? (() => setLocalOpen((o) => !o))}
      >
        {label}
      </button>
      <div id={panelId} className="nav-panel" data-open={open} inert={!open}>
        <div className="nav-panel-inner">{children}</div>
      </div>
    </div>
  )
}

/** Numbered for real sequences (How to start); plain for facts that have no order (the summary). */
export function ToggleList({ items, numbered = true }: { items: ToggleItem[]; numbered?: boolean }) {
  return (
    <ol className={numbered ? 'steps' : 'steps steps-plain'}>
      {items.map((item) => (
        <li key={item.title}>
          <div>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
