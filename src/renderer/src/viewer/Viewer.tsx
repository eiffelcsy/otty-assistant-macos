import { useEffect, useState } from 'react'
import type { DrawingView } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { SlideView } from '../draw/SlideView'

/**
 * The bigger view for a drawing (D-30): a picture filling the window, or slides one at a time. Present opens it
 * full screen. ← → (and Space, Page Up / Down) move between slides, N shows the speaker notes, and Esc closes it.
 */
export function Viewer() {
  const [view, setView] = useState<DrawingView | null>(null)
  const [at, setAt] = useState(0)
  const [notes, setNotes] = useState(false)

  useEffect(() => {
    void window.otty.viewerContent().then(setView)
  }, [])

  const count = view?.kind === 'slides' ? view.pages.length : 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return void window.otty.closeViewer()
      if (!count) return
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) setAt((i) => Math.min(count - 1, i + 1))
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) setAt((i) => Math.max(0, i - 1))
      else if (e.key === 'Home') setAt(0)
      else if (e.key === 'End') setAt(count - 1)
      else if (e.key.toLowerCase() === 'n') setNotes((v) => !v)
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [count])

  if (!view) return <div className="viewer" />

  if (view.kind === 'picture') {
    return (
      <div className="viewer viewer--picture">
        <img src={view.dataUrl} alt="Drawing by Otty" />
        <button className="viewer__close" title="Close (Esc)" onClick={() => void window.otty.closeViewer()}>
          <Icon name="cross-small" />
        </button>
      </div>
    )
  }

  const note = view.notes[at] ?? []
  return (
    <div className={`viewer viewer--slides${notes ? ' viewer--notes' : ''}`}>
      <SlideView page={view.pages[at]} className="viewer__slide" />
      {notes && (
        <div className="viewer__notes">{note.length ? note.map((n, i) => <p key={i}>{n}</p>) : <p className="viewer__muted">No notes for this slide.</p>}</div>
      )}
      <div className="viewer__bar">
        <button title="Previous (←)" disabled={at === 0} onClick={() => setAt((i) => Math.max(0, i - 1))}>
          <Icon name="arrow-left" />
        </button>
        <span>
          {at + 1} / {count}
        </span>
        <button title="Next (→)" disabled={at === count - 1} onClick={() => setAt((i) => Math.min(count - 1, i + 1))}>
          <Icon name="arrow-right" />
        </button>
        <button title="Speaker notes (N)" aria-pressed={notes} onClick={() => setNotes((v) => !v)}>
          Notes
        </button>
        <button title="Close (Esc)" onClick={() => void window.otty.closeViewer()}>
          <Icon name="cross-small" />
        </button>
      </div>
    </div>
  )
}
