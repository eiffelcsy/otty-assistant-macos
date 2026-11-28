import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

/** A 28 px icon button that opens a small menu over it (D-85); a click away or Esc closes it. */
export function MenuButton({ glyph, label, className = '', children }: { glyph: string; label: string; className?: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className={`menu-btn ${className}`} ref={box}>
      <button className="icon-btn icon-btn--sm" title={label} aria-label={label} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <Icon name={glyph} />
      </button>
      {open && (
        <div className="menu menu-btn__menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
