import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import { keyWords, prettyKey } from '../../lib/keys'

// Settings rows (D-61, docs/design/specs/02-settings.md, "Row anatomy"): a group of rows, each one control saved on
// change. Kinds: switch, choice, link, value, keys and hold.

/** A labelled box of rows. `found` makes the row with that id glow once, after Find a setting. */
export function Group({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="set-group" role="group" aria-labelledby={id}>
      <div className="set-group__label" id={id}>
        {label}
      </div>
      <div className="set-group__box">{children}</div>
    </div>
  )
}

interface RowProps {
  title: string
  description?: ReactNode
  /** The row Find a setting jumped to: it scrolls into view and glows once. */
  found?: boolean
  /** "Couldn't save that." folds open under the row. */
  failed?: boolean
  disabled?: boolean
}

function useFound(found: boolean | undefined) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (found) ref.current?.scrollIntoView({ block: 'center' })
  }, [found])
  return ref
}

const Failed = ({ failed }: { failed?: boolean }) => (failed ? <span className="set-row__failed">Couldn’t save that. Try again.</span> : null)

function Text({ title, description, failed, id }: RowProps & { id?: string }) {
  return (
    <span className="set-row__text">
      <span className="set-row__title">{title}</span>
      {description && (
        <span className="set-row__desc" id={id}>
          {description}
        </span>
      )}
      <Failed failed={failed} />
    </span>
  )
}

/** The whole row flips the switch. */
export function SwitchRow({ on, onChange, ...row }: RowProps & { on: boolean; onChange: (on: boolean) => void }) {
  const ref = useFound(row.found)
  const desc = useId()
  return (
    <label ref={ref as React.RefObject<HTMLLabelElement>} className={`set-row set-row--tap${row.found ? ' set-row--found' : ''}${row.disabled ? ' set-row--off' : ''}`}>
      <Text {...row} id={desc} />
      <input type="checkbox" className="switch" checked={on} disabled={row.disabled} aria-describedby={row.description ? desc : undefined} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

/** A pop-up button: a native menu, with the current choice ticked by macOS. */
export function ChoiceRow<T extends string>({ value, options, onChange, ...row }: RowProps & { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const ref = useFound(row.found)
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={`set-row${row.found ? ' set-row--found' : ''}`}>
      <Text {...row} />
      <span className="popup">
        <select aria-label={row.title} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="angle-small-down" />
      </span>
    </div>
  )
}

/** The whole row is the button. `out` is for a page outside Otty. */
export function LinkRow({ onClick, out = false, ...row }: RowProps & { onClick: () => void; out?: boolean }) {
  const ref = useFound(row.found)
  return (
    <button ref={ref as React.RefObject<HTMLButtonElement>} className={`set-row set-row--tap${row.found ? ' set-row--found' : ''}`} onClick={onClick}>
      <Text {...row} />
      <Icon name={out ? 'arrow-up-right-from-square' : 'angle-small-right'} className="set-row__chevron" />
    </button>
  )
}

export function ValueRow({ value, ...row }: RowProps & { value?: ReactNode }) {
  const ref = useFound(row.found)
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={`set-row${row.found ? ' set-row--found' : ''}`}>
      <Text {...row} />
      {value !== undefined && <span className="set-row__value">{value}</span>}
    </div>
  )
}

/** A row with something of its own on the right (the limit field). */
export function CustomRow({ children, ...row }: RowProps & { children: ReactNode }) {
  const ref = useFound(row.found)
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={`set-row${row.found ? ' set-row--found' : ''}`}>
      <Text {...row} />
      {children}
    </div>
  )
}

/** "Alt+Shift+Space" as the keys people see. */
function Keycaps({ accelerator }: { accelerator: string }) {
  return (
    <span className="keycaps">
      {prettyKey(accelerator)
        .split(' ')
        .map((k, i) => (
          <kbd key={i}>{k}</kbd>
        ))}
    </span>
  )
}

const MODIFIERS: ['ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', string][] = [
  ['ctrlKey', 'Control'],
  ['altKey', 'Alt'],
  ['shiftKey', 'Shift'],
  ['metaKey', 'Command']
]

/** A key press as an Electron accelerator, or null until it's a whole chord (a modifier and a key). */
export function accelerator(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  const mods = MODIFIERS.filter(([k]) => e[k]).map(([, name]) => name)
  const key = /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3)
    : /^Digit\d$/.test(e.code)
      ? e.code.slice(5)
      : /^F\d{1,2}$/.test(e.code)
        ? e.code
        : e.code === 'Space'
          ? 'Space'
          : /^Arrow(Up|Down|Left|Right)$/.test(e.code)
            ? e.code.slice(5)
            : null
  return key && mods.length ? [...mods, key].join('+') : null
}

/** Click the keycaps to record a new shortcut. Esc cancels; the first whole chord is saved. */
export function KeysRow({
  value,
  clash,
  free,
  onUse,
  onChange,
  ...row
}: RowProps & {
  value: string
  clash?: boolean
  /** D-80: a shortcut that works, once asked; null when none does. */
  free?: string | null
  onUse?: (accel: string) => void
  onChange: (accel: string) => void
}) {
  const ref = useFound(row.found)
  const [recording, setRecording] = useState(false)
  const [held, setHeld] = useState('')
  const field = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (recording) field.current?.focus()
  }, [recording])
  const onKey = (e: React.KeyboardEvent) => {
    e.preventDefault()
    if (e.key === 'Escape') return setRecording(false)
    const accel = accelerator(e.nativeEvent)
    if (!accel) return setHeld(MODIFIERS.filter(([k]) => e.nativeEvent[k]).map(([, n]) => n).join('+'))
    setRecording(false)
    if (accel !== value) onChange(accel)
  }
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} className={`set-row${row.found ? ' set-row--found' : ''}`}>
      <span className="set-row__text">
        <span className="set-row__title">{row.title}</span>
        {row.description && <span className="set-row__desc">{row.description}</span>}
        {clash && (
          <span className="set-row__failed">
            {free ? `Another app uses this. ${keyWords(free)} is free.` : 'Another app uses this. Pick a different one.'}
            {free && onUse && (
              <button className="btn btn--soft btn--small" onClick={() => onUse(free)}>
                Use it
              </button>
            )}
          </span>
        )}
        <Failed failed={row.failed} />
      </span>
      {recording ? (
        <button ref={field} className="recorder" aria-label={`${row.title}: recording. Press the new shortcut, or Escape to cancel.`} onKeyDown={onKey} onBlur={() => setRecording(false)}>
          {held ? <Keycaps accelerator={held} /> : 'Press the new shortcut'}
        </button>
      ) : (
        <button
          className="keys-btn"
          aria-label={`${row.title}: ${value}. Click to change.`}
          onClick={() => {
            setHeld('')
            setRecording(true)
          }}
        >
          <Keycaps accelerator={value} />
        </button>
      )}
    </div>
  )
}

export const HOLD_MS = 1200

/** Can't be undone, so it's held: the fill sweeps over 1.2 s, and letting go early does nothing. */
export function HoldButton({ label = 'Hold to forget', what, onDone, disabled = false }: { label?: string; what?: string; onDone: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = () => {
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      onDone()
    }, HOLD_MS)
  }
  const stop = () => {
    clearTimeout(timer.current)
    setHolding(false)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <button
      className={`btn btn--warn btn--small hold${holding ? ' hold--on' : ''}`}
      disabled={disabled}
      aria-label={what ? `${label}: ${what}` : undefined}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && (e.preventDefault(), start())}
      onKeyUp={stop}
    >
      {label}
    </button>
  )
}

export function HoldRow({ onDone, ...row }: RowProps & { onDone: () => void }) {
  const [done, setDone] = useState(false)
  return (
    <div className="set-row">
      <Text {...row} description={done ? 'Forgotten' : row.description} />
      {!done && (
        <HoldButton
          what={row.title}
          disabled={row.disabled}
          onDone={() => {
            setDone(true)
            onDone()
          }}
        />
      )}
    </div>
  )
}
