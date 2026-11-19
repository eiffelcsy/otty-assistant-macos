import { useEffect, useRef, useState } from 'react'
import { pauseEnd, type PauseChoice } from '../../../shared/pauseUntil'
import { Icon } from './Icon'

// Pause everything (D-39), as a 32 px icon button with its three lengths in a menu. Once paused it says so and lets
// Otty carry on in one press. The same control as the otter's menu and the menu bar, which main keeps in step.

const CHOICES: [PauseChoice, string][] = [
  ['hour', 'For an hour'],
  ['morning', 'Until tomorrow morning'],
  ['manual', 'Until I say']
]

export function PauseButton({ paused }: { paused: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])

  if (paused) {
    return (
      <button className="icon-btn icon-btn--on" title="Let Otty carry on" aria-label="Let Otty carry on" onClick={() => void window.otty.saveSettings({ workPaused: false })}>
        <Icon name="play" />
      </button>
    )
  }
  const choose = (choice: PauseChoice) => {
    setOpen(false)
    void window.otty.saveSettings({ workPaused: true, workPausedUntil: pauseEnd(choice) })
  }
  return (
    <div className="pause-btn" ref={ref}>
      <button className="icon-btn" title="Pause everything" aria-label="Pause everything" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="pause" />
      </button>
      {open && (
        <div className="menu pause-btn__menu" role="menu" aria-label="Pause everything">
          {CHOICES.map(([choice, label]) => (
            <button key={choice} role="menuitem" className="menu__item" onClick={() => choose(choice)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
