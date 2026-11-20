import { useState, type ClipboardEvent, type ReactNode, type Ref } from 'react'
import { Capsule } from './Capsule'
import { Icon } from './Icon'

// The one message box (D-62, docs/design/specs/03-chat.md): the panel's composer, the quick view's first question and
// its follow-up. Enter sends, Shift-Enter makes a new line, and nothing is sent mid-composition (Chinese input).
// The text grows from one line to six, then scrolls.

interface Props {
  value: string
  onChange: (text: string) => void
  onSend: () => void
  placeholder: string
  label?: string
  /** There's something to send: text, or a tray that has a first quick action. */
  canSend: boolean
  /** An answer is running: Send becomes Stop. */
  busy?: boolean
  onStop?: () => void
  /** Snip and Attach, in the panel. Dimmed while answering. */
  tools?: { onSnip: () => void; onAttach: () => void }
  /** Captures, files and the tray's actions, inside the box over the text (Spec 03, Tray). */
  tray?: ReactNode
  /** Beside Send: the language choice for the next answer. */
  extra?: ReactNode
  /** Leave Send out, for a box whose sending lives elsewhere (the quick view's hint row). */
  noSend?: boolean
  /** No surface of its own, inside a card that already has one. */
  bare?: boolean
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  onBlur?: () => void
  /** Everything is paused (D-39): Send becomes "Paused · Carry on", and Enter sends nothing until it's pressed. */
  paused?: boolean
  /** ↑ in an empty box. */
  onArrowUp?: () => void
  inputRef?: Ref<HTMLTextAreaElement>
}

export function MessageBox({ value, onChange, onSend, placeholder, label, canSend, busy = false, onStop, tools, extra, noSend, bare, onPaste, onBlur, onArrowUp, paused = false, tray, inputRef }: Props) {
  // The liquid capsule: key presses nudge the outline, a send lets a drop go. A bare box has no outline of its own.
  const [nudges, setNudges] = useState(0)
  const [sends, setSends] = useState(0)
  const send = () => {
    if (canSend && !busy) setSends((n) => n + 1)
    onSend()
  }
  return (
    <div className={`message-box${bare ? ' message-box--bare' : ''}`}>
      {!bare && <Capsule nudges={nudges} sends={sends} />}
      {tray}
      <div className="composer__row">
        {tools && (
          <>
            <button className="composer__tool" title={busy ? 'After this answer' : 'Snap part of my screen'} aria-label="Snap part of my screen" onClick={tools.onSnip} disabled={busy}>
              <Icon name="scissors" />
            </button>
            <button className="composer__tool" title={busy ? 'After this answer' : 'Attach files'} aria-label="Attach files" onClick={tools.onAttach} disabled={busy}>
              <Icon name="clip" />
            </button>
          </>
        )}
        <textarea
          ref={inputRef}
          className="composer__input"
          rows={1}
          placeholder={paused ? 'Otty is paused' : placeholder}
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key.length === 1 || e.key === 'Backspace') setNudges((n) => n + 1)
            if (e.key === 'ArrowUp' && !value && onArrowUp) {
              e.preventDefault()
              onArrowUp()
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!paused) send()
            }
          }}
        />
        {!paused && extra}
        {!noSend &&
          (paused ? (
            <button className="btn btn--quiet btn--small message-box__paused" title="Otty is paused. Let it carry on" onClick={() => void window.otty.saveSettings({ workPaused: false })}>
              Paused · Carry on
            </button>
          ) : busy && onStop ? (
            <button className="send-btn send-btn--stop" title="Stop" aria-label="Stop" onClick={onStop}>
              <Icon name="stop" solid />
            </button>
          ) : (
            <button className="send-btn" title="Send" aria-label="Send" disabled={!canSend || busy} onClick={send}>
              <Icon name="arrow-small-up" />
            </button>
          ))}
      </div>
    </div>
  )
}
