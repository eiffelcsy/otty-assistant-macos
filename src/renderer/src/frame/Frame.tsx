import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { PauseButton } from '../components/PauseButton'
import { columns, type Band, bandFor } from './bands'

// The frame (D-64, Spec 05): navigation, the header and the columns. Screens fill the parts; the window's width alone
// decides where each part goes. Under 640 one screen at a time with a screen menu; from 640 a 72 px rail; from 712 a
// list column beside the main one; from 980 a 216 px sidebar. Nothing here measures anything but its own width.

export type Place = 'home' | 'chat' | 'chats' | 'logbook' | 'notebook' | 'settings'

interface NavItem {
  place: Place
  label: string
  icon: string
  keys: string
}

/** The screens, in the order of their shortcuts. Narrow, the chat list is a page of its own, so it's on the menu too. */
export const NAV: NavItem[] = [
  { place: 'home', label: 'Home', icon: 'home', keys: '⌘1' },
  { place: 'chat', label: 'Chat', icon: 'comment-alt', keys: '⌘2' },
  { place: 'chats', label: 'Chats', icon: 'time-past', keys: '⇧⌘F' },
  { place: 'logbook', label: 'Logbook', icon: 'journal-alt', keys: '⌘3' },
  { place: 'notebook', label: 'Notebook', icon: 'book-bookmark', keys: '⌘4' }
]

/** The rail and sidebar: Chats is the chat screen there, with its list beside it (Spec 05). */
const RAIL: NavItem[] = [NAV[0], { place: 'chat', label: 'Chats', icon: 'comment-alt', keys: '⌘2' }, NAV[3], NAV[4]]

/** The frame's own width, for the band. A container, not the viewport, so the preview and the window agree. */
export function useWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(420)
  useLayoutEffect(() => {
    // The observer reports once as it starts, then on every change.
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    watch.observe(el)
    return () => watch.disconnect()
  }, [el])
  return width
}

export interface FrameProps {
  width: number
  /** Where the user is: highlights the nav and names the screen. */
  place: Place
  title: string
  /** A pushed page: the header shows Back and this title instead of the screen menu. */
  pushed: boolean
  onBack: () => void
  onGo: (place: Place | 'settings') => void
  needsYou: number
  /** One line of how Otty is: "Reading train times", "1 needs you", "All quiet", "Paused until 3pm". */
  status: string
  busy: boolean
  paused: boolean
  /** Extra items for the compact screen menu, for the screen on show (Find in this chat…). */
  menuExtras?: { label: string; icon: string; keys?: string; onClick: () => void }[]
  /** The screen's own actions in the header, at most three 32 px icon buttons. */
  actions?: ReactNode
  onNewChat: () => void
  /** The list part, shown as a column when there's room (Chats beside the chat). */
  list?: ReactNode
  /** With Remember my chats off there's no list of chats to go to. */
  noChats?: boolean
  /** The window's state (D-65): roomy windows have traffic lights in the nav and a 52 px header. */
  roomy?: boolean
  /** Expand to the roomy window, or Shrink back. */
  onResize?: () => void
  /** The sidebar folded to the rail by ⌃⌘S. */
  sidebarHidden: boolean
  notices?: ReactNode
  children: ReactNode
}

export function Frame(p: FrameProps) {
  const band: Band = bandFor(p.width)
  const cols = columns(p.width, Boolean(p.list))
  const nav = cols.nav === 'sidebar' && p.sidebarHidden ? 'rail' : cols.nav
  return (
    <div className={`frame frame--${band}${p.roomy ? ' frame--roomy' : ''}`} data-band={band}>
      {nav !== 'none' && <Nav kind={nav} {...p} />}
      {cols.list && p.list && (
        <section className="frame__list" data-column aria-label="Chats" tabIndex={-1}>
          {/* The header splits at the column line: the list's own title and its one action over it (Spec 05). */}
          <header className="panel__header frame__list-head">
            <h2 className="panel__title">Chats</h2>
            <button className="icon-btn" title="New chat ⌘N" aria-label="New chat" onClick={p.onNewChat}>
              <Icon name="comment-medical" />
            </button>
          </header>
          {p.list}
        </section>
      )}
      <main className="frame__main" data-column tabIndex={-1}>
        <Header {...p} compact={nav === 'none'} />
        {p.notices}
        {p.children}
      </main>
    </div>
  )
}

function Header(p: FrameProps & { compact: boolean }) {
  return (
    <header className="panel__header">
      {p.pushed ? (
        <>
          <button className="icon-btn frame__back" title="Back ⌘[" aria-label="Back" onClick={p.onBack}>
            <Icon name="angle-small-left" />
          </button>
          <h1 className="panel__title">{p.title}</h1>
        </>
      ) : p.compact ? (
        <ScreenMenu {...p} />
      ) : (
        <h1 className="panel__title">{p.title}</h1>
      )}
      <div className="panel__actions">
        {p.actions}
        {/* Pause has one place at each width: here when compact, at the foot of the rail or sidebar otherwise. */}
        {p.compact && <PauseButton paused={p.paused} />}
        {p.compact && p.place !== 'logbook' && (
          <button
            className="icon-btn icon-btn--dot"
            title="Logbook ⌘3"
            aria-label={p.needsYou ? `Logbook, ${p.needsYou} needs you` : 'Logbook'}
            onClick={() => p.onGo('logbook')}
          >
            <Icon name="journal-alt" />
            {p.needsYou > 0 && <span className="icon-btn__dot" />}
          </button>
        )}
        {(p.compact || (p.place === 'chat' && !p.list)) && (
          <button className="icon-btn" title="New chat ⌘N" aria-label="New chat" onClick={p.onNewChat}>
            <Icon name="comment-medical" />
          </button>
        )}
        {p.onResize &&
          (p.roomy ? (
            <button className="icon-btn" title="Shrink to floating ⇧⌘E" aria-label="Shrink to floating" onClick={p.onResize}>
              <Icon name="compress" />
            </button>
          ) : (
            <button className="icon-btn frame__expand" title="Expand ⇧⌘E" aria-label="Expand" onClick={p.onResize}>
              <Icon name="expand" />
            </button>
          ))}
        {/* The floating window has no traffic lights, so it needs its own way out (Esc does the same). */}
        {!p.roomy && (
          <button className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={() => void window.otty.closePanel()}>
            <Icon name="cross-small" />
          </button>
        )}
      </div>
    </header>
  )
}

/** On a root screen at compact width: the otter and the screen's name, opening every other screen (Spec 05). */
function ScreenMenu(p: FrameProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])
  const go = (place: Place | 'settings') => {
    setOpen(false)
    p.onGo(place)
  }
  return (
    <div className="screen-menu" ref={ref}>
      <button
        className="screen-menu__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${p.title}, switch screen`}
        onClick={() => setOpen((o) => !o)}
      >
        <Otter state={p.busy ? 'thinking' : 'idle'} size={28} />
        <span className="screen-menu__title">{p.title}</span>
        <Icon name="angle-small-down" />
      </button>
      {open && (
        <div className="menu screen-menu__list" role="menu" aria-label="Screens">
          {NAV.filter((n) => !(p.noChats && n.place === 'chats')).map((n) => (
            <button
              key={n.place}
              role="menuitem"
              className="menu__item screen-menu__item"
              aria-current={n.place === p.place || undefined}
              onClick={() => go(n.place)}
            >
              <Icon name={n.icon} />
              <span className="screen-menu__label">{n.label}</span>
              {n.place === 'logbook' && p.needsYou > 0 && <span className="screen-menu__count">{p.needsYou}</span>}
              <span className="screen-menu__keys">{n.keys}</span>
            </button>
          ))}
          {/* The chat's own actions are a group of their own, under the screens. */}
          {p.menuExtras?.length ? <div className="menu__sep" role="separator" /> : null}
          {p.menuExtras?.map((x) => (
            <button key={x.label} role="menuitem" className="menu__item screen-menu__item" onClick={() => (setOpen(false), x.onClick())}>
              <Icon name={x.icon} />
              <span className="screen-menu__label">{x.label}</span>
              {x.keys && <span className="screen-menu__keys">{x.keys}</span>}
            </button>
          ))}
          <div className="menu__sep" role="separator" />
          <button role="menuitem" className="menu__item screen-menu__item" aria-current={p.place === 'settings' || undefined} onClick={() => go('settings')}>
            <Icon name="settings" />
            <span className="screen-menu__label">Settings</span>
            <span className="screen-menu__keys">⌘,</span>
          </button>
        </div>
      )}
    </div>
  )
}

/** The rail (640–979) or the sidebar (from 980): the screens, Pause, and Settings at the foot. */
function Nav({ kind, ...p }: FrameProps & { kind: 'rail' | 'sidebar' }) {
  const wide = kind === 'sidebar'
  return (
    <nav className={`frame__nav frame__nav--${kind}`} aria-label="Otty" data-column>
      <div className="frame__nav-top" />
      <button className="frame__otty" title={p.status} aria-label={`Otty: ${p.status}`} onClick={() => p.onGo('home')}>
        <Otter state={p.busy ? 'thinking' : 'idle'} size={40} />
        {wide && (
          <span className="frame__otty-text">
            <span className="frame__otty-name">Otty</span>
            <span className="frame__otty-status">{p.status}</span>
          </span>
        )}
      </button>
      <div className="frame__nav-items">
        {RAIL.map((n) => (
          <NavButton
            key={n.place}
            item={n}
            wide={wide}
            selected={n.place === p.place || (n.place === 'chat' && p.place === 'chats')}
            count={n.place === 'logbook' || (wide && n.place === 'home') ? p.needsYou : 0}
            onGo={p.onGo}
          />
        ))}
      </div>
      <div className="frame__nav-foot">
        {wide ? (
          <div className="pause-card">
            <div className="pause-card__line">
              <span className={`pause-card__dot${p.paused ? ' pause-card__dot--paused' : p.busy ? ' pause-card__dot--busy' : ''}`} />
              <span>
                <b>{p.paused ? 'Paused' : p.busy ? 'Working' : 'All quiet'}</b>
              </span>
            </div>
            <PauseCardButton paused={p.paused} />
          </div>
        ) : (
          <PauseButton paused={p.paused} />
        )}
        <NavButton
          item={{ place: 'settings', label: 'Settings', icon: 'settings', keys: '⌘,' }}
          wide={wide}
          selected={p.place === 'settings'}
          count={0}
          onGo={p.onGo}
        />
      </div>
    </nav>
  )
}

function PauseCardButton({ paused }: { paused: boolean }) {
  if (paused)
    return (
      <button className="btn btn--primary btn--small btn--wide" onClick={() => void window.otty.saveSettings({ workPaused: false })}>
        Carry on
      </button>
    )
  return (
    <button className="btn btn--soft btn--small btn--wide" onClick={() => void window.otty.saveSettings({ workPaused: true, workPausedUntil: null })}>
      Pause everything
    </button>
  )
}

function NavButton({
  item,
  wide,
  selected,
  count,
  onGo
}: {
  item: NavItem
  wide: boolean
  selected: boolean
  count: number
  onGo: (p: Place | 'settings') => void
}) {
  return (
    <button
      className={`nav-btn${wide ? ' nav-btn--row' : ''}`}
      aria-current={selected || undefined}
      title={`${item.label}  ${item.keys}${count ? ` · ${count} needs you` : ''}`}
      aria-label={count ? `${item.label}, ${count} needs you` : item.label}
      onClick={() => onGo(item.place)}
    >
      <Icon name={item.icon} />
      {wide && <span className="nav-btn__label">{item.label}</span>}
      {count > 0 && (wide ? <span className="nav-btn__count">{count}</span> : <span className="nav-btn__dot" />)}
    </button>
  )
}
