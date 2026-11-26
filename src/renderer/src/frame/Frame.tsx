import { createContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, m, useAnimate, useReducedMotion } from 'motion/react'
import { Cove } from '../components/Cove'
import { Icon } from '../components/Icon'
import { T, ebb, glide, swell } from '../lib/motion'
import { Otter } from '../components/Otter'
import { PauseButton } from '../components/PauseButton'
import { columns, sameLayout, type Band, bandFor } from './bands'
import { LIST_HIDE, LIST_MAX, LIST_MIN, NAV_FOLD, NAV_MAX, NAV_MIN, SIDES, canToggle, clamp, sideWidths, sidesOpen, toggleSides, type Sides } from './sides'

// The frame (D-64, Spec 05): navigation, the header and the columns. Screens fill the parts; the window's width alone
// decides where each part goes. Under 640 one screen at a time with a screen menu; from 640 a 72 px rail; from 712 a
// list column beside the main one; from 980 a 216 px sidebar. Nothing here measures anything but its own width. The sidebar and the list can be sized by their edges, and folded by the sidebar button (Spec 09).

export type Place = 'home' | 'chat' | 'chats' | 'logbook' | 'notebook' | 'calendar' | 'pouch' | 'settings'

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
  { place: 'notebook', label: 'Notebook', icon: 'book-bookmark', keys: '⌘4' },
  { place: 'calendar', label: 'Calendar', icon: 'calendar', keys: '⌘5' },
  { place: 'pouch', label: 'Pouch', icon: 'gem', keys: '⌘6' }
]

/** The rail and sidebar: Chats is the chat screen there, with its list beside it (Spec 05). */
const RAIL: NavItem[] = [NAV[0], { place: 'chat', label: 'Chats', icon: 'comment-alt', keys: '⌘2' }, NAV[3], NAV[4], NAV[5], NAV[6]]

/** True for the one render that swaps Home and the empty chat (Spec 09, Part 2): a screen mounting in it skips its arrival. */
export const StillMove = createContext(false)

/** The frame's own width, for the band. A container, not the viewport, so the preview and the window agree. */
export function useWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(420)
  useLayoutEffect(() => {
    // The observer reports once as it starts, then on every change.
    if (!el || typeof ResizeObserver === 'undefined') return
    // Only a width that changes the layout re-renders: during Expand the window passes through hundreds of widths.
    const watch = new ResizeObserver(([e]) => setWidth((was) => (sameLayout(was, e.contentRect.width) ? was : Math.round(e.contentRect.width))))
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
  /** Whether the list belongs to the screen on show. It stays mounted, shut, on the others, so it can open by its width. */
  listHere?: boolean
  /** With Remember my chats off there's no list of chats to go to. */
  noChats?: boolean
  /** The window's state (D-65): roomy windows have traffic lights in the nav and a 52 px header. */
  roomy?: boolean
  /** Expand to the roomy window, or Shrink back. */
  onResize?: () => void
  /** The side columns' sizes and folds (Spec 09, Part 3). */
  sides: Sides
  onSides: (next: Sides) => void
  notices?: ReactNode
  /** The living cove (D-74, Spec 07, Spec 08): `full` behind the whole screen on Home and the empty chat, `wash` (the band behind the header) on every other screen. */
  cove?: 'full' | 'wash'
  children: ReactNode
}

/** W6: whether what's under a header has scrolled, from any scroller inside (scroll events don't bubble, so capture). */
function useScrolled(screen: unknown): [boolean, (e: React.UIEvent) => void] {
  // Kept per screen, so a new one starts with no line.
  const [at, setAt] = useState<{ screen: unknown; scrolled: boolean }>({ screen, scrolled: false })
  return [at.screen === screen && at.scrolled, (e) => setAt({ screen, scrolled: (e.target as HTMLElement).scrollTop > 0 })]
}

/** The elements under `root` matching `sel` that have a box (a hidden screen's are display: none). */
const shown = (root: HTMLElement, sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getClientRects().length > 0)
const sharedBoxes = (root: HTMLElement): Map<string, DOMRect> => new Map(shown(root, '[data-shared]').map((el) => [el.dataset.shared ?? '', el.getBoundingClientRect()]))

/**
 * W4, the move between screens: forward glides in from the right, Back from the left, any other move surfaces. Played
 * on the body rather than keyed, so the chat stays mounted with its scroll; transform and opacity only, so it runs on the
 * compositor while the new screen is still rendering.
 */
function useScreenMove(place: Place, pushed: boolean, cove: FrameProps['cove']) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduced = useReducedMotion()
  const was = useRef({ place, pushed, cove })
  // Spec 09, Part 2: Home and the empty chat are one cove, so between them nothing fades as a whole. What both show
  // glides from where it was and only words that differ surface. The last move is state, so render can read it.
  const [move, setMove] = useState({ from: { place, pushed, cove }, to: { place, pushed, cove } })
  const from = useRef<Map<string, DOMRect> | null>(null)
  if (move.to.place !== place || move.to.pushed !== pushed || move.to.cove !== cove) {
    // eslint-disable-next-line react/refs -- FLIP's first box: the shared pieces are read in the render that sees the move, before React swaps the screens
    if (scope.current) from.current = sharedBoxes(scope.current)
    setMove({ from: move.to, to: { place, pushed, cove } })
  }
  const still = !reduced && move.from.place !== place && !pushed && !move.from.pushed && move.from.cove === 'full' && cove === 'full'
  useLayoutEffect(() => {
    const boxes = from.current
    from.current = null
    if (!still || !boxes || !scope.current) return
    for (const el of shown(scope.current, '[data-shared]')) {
      const old = boxes.get(el.dataset.shared ?? '')
      if (!old) continue
      const now = el.getBoundingClientRect()
      const x = old.left + old.width / 2 - (now.left + now.width / 2)
      const y = old.top - now.top
      if (x || y) animate(el, { x: [x, 0], y: [y, 0] }, { duration: T.settle, ease: glide })
    }
    for (const el of shown(scope.current, '[data-fresh]')) animate(el, { opacity: [0, 1] }, { duration: T.quick, ease: glide })
  }, [still, place, animate, scope])
  useEffect(() => {
    const before = was.current
    was.current = { place, pushed, cove }
    const tilt = (before.cove === 'full') !== (cove === 'full')
    if (!scope.current || (before.place === place && before.pushed === pushed && !tilt)) return
    if (still) return
    if (reduced) return void animate(scope.current, { opacity: [0, 1] }, { duration: 0.2 })
    // Spec 08 Part 9: through the camera's tilt, the screen waits for the sky (or the cove) to come into view, then surfaces.
    // Hidden first: the delay would otherwise show it at full strength over the moving painting. Spec 09 Part 1: the
    // header sits on the same sheet, so it rides in with the screen, never ahead of it.
    if (tilt) {
      const el = scope.current
      const head = el.parentElement?.querySelector<HTMLElement>(':scope > .panel__header')
      const parts = head ? [el, head] : [el]
      for (const part of parts) animate(part, { opacity: 0 }, { duration: 0 })
      // Up: the screen rides the last three quarters of the tilt. Down: the cove lands first, with the stand-in Otty,
      // then Home's words surface, and Home's own Otty takes over once the world is still (styles.css, data-landing).
      const down = cove === 'full'
      const [delay, duration] = down ? [T.camera * 0.55, T.camera * 0.6] : [T.camera * 0.25, T.camera * 0.75]
      if (down) el.setAttribute('data-landing', '')
      const done = setTimeout(() => el.removeAttribute('data-landing'), T.camera * 1000)
      for (const part of parts)
        animate(part, { opacity: [0, 1], x: [0, 0], y: [down ? 16 : 32, 0] }, { duration, delay, ease: swell, opacity: { duration, delay, ease: glide } })
      return () => {
        clearTimeout(done)
        el.removeAttribute('data-landing')
      }
    }
    const x = pushed && !before.pushed ? 24 : before.pushed && !pushed ? -24 : 0
    animate(scope.current, { opacity: [0, 1], x: [x, 0], y: [x ? 0 : 10, 0] }, { duration: T.settle, ease: glide, opacity: { duration: T.quick } })
  }, [place, pushed, cove, still, reduced, animate, scope])
  return { scope, still }
}

export function Frame(p: FrameProps) {
  const { scope: bodyRef, still } = useScreenMove(p.place, p.pushed, p.cove)
  const [mainScrolled, onMainScroll] = useScrolled(p.place)
  const [listScrolled, onListScroll] = useScrolled(null)
  const band: Band = bandFor(p.width)
  const hasList = Boolean(p.list) && p.listHere !== false
  /** The list can be a column here: it's mounted, open or shut, whenever this is true. */
  const listColumn = Boolean(p.list) && columns(p.width, true).list
  // While an edge is dragged its width leads; sideWidths keeps it in bounds and the main column at its minimum.
  const [drag, setDrag] = useState<{ side: 'nav' | 'list'; w: number } | null>(null)
  // Spec 09, Part 3: what an edge's width means, the same live and on letting go. Past the line the nav snaps to the
  // rail and the list away at once, and back the moment the hand returns; the width it had is kept for next time.
  const after = (side: 'nav' | 'list', w: number): Sides =>
    side === 'nav'
      ? w < NAV_FOLD
        ? { ...p.sides, navFolded: true }
        : { ...p.sides, navFolded: false, nav: clamp(Math.round(w), NAV_MIN, NAV_MAX) }
      : w < LIST_HIDE
        ? { ...p.sides, listHidden: true }
        : { ...p.sides, listHidden: false, list: clamp(Math.round(w), LIST_MIN, LIST_MAX) }
  const s = sideWidths(p.width, hasList, Boolean(p.roomy), drag ? after(drag.side, drag.w) : p.sides)
  const navEdge = columns(p.width, false).nav === 'sidebar'
  const toggle = canToggle(p.width, hasList)
  const open = sidesOpen(p.width, hasList, p.sides)
  const toggleButton = toggle && (
    <button
      className="icon-btn frame__side-toggle"
      title={open ? 'Hide sidebar ⌃⌘S' : 'Show sidebar ⌃⌘S'}
      aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
      aria-expanded={open}
      onClick={() => p.onSides(toggleSides(p.width, hasList, p.sides))}
    >
      <Icon name="sidebar" />
    </button>
  )
  // Spec 09, Part 3: beside a roomy rail the traffic lights fill the rail, so the button leads the next column's header
  // (on the cove's sky, in its ink); everywhere else it floats in the nav's top row, last in the DOM so the header's drag
  // region can't swallow its clicks.
  const toggleLeads = Boolean(p.roomy) && s.nav === 'rail'

  // Spec 09, Part 2: the list opens and closes by its width (--list-now, which the cove is clipped at too), so whatever
  // is centred in the main column rides over with it. Kept on show while it closes; instant on resizes and while the
  // window glides between states.
  const [frame, play] = useAnimate<HTMLDivElement>()
  const reduced = useReducedMotion()
  const wanted = useRef(s.list)
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const to = s.list ? s.listW : 0
    const turned = wanted.current !== s.list
    wanted.current = s.list
    if (!turned || !listColumn || reduced || el.closest('.panel--moving')) {
      el.style.setProperty('--list-now', `${to}px`)
      return
    }
    const from = parseFloat(el.style.getPropertyValue('--list-now')) || 0
    // Snapped by a drag it keeps up with the hand; opened by the button or a move it takes its time.
    const run = play(el, { '--list-now': [`${from}px`, `${to}px`] }, { duration: el.hasAttribute('data-resizing') ? T.quick : T.settle, ease: glide })
    return () => run.stop()
  }, [s.list, s.listW, listColumn, reduced, frame, play])

  const done = (side: 'nav' | 'list', w: number) => {
    setDrag(null)
    p.onSides(after(side, w))
  }

  return (
    <div
      ref={frame}
      data-resizing={drag ? '' : undefined}
      className={`frame frame--${band}${p.roomy ? ' frame--roomy' : ''} frame--nav-${s.nav}${toggle ? ' frame--toggle' : ''}`}
      data-band={band}
      style={{ '--nav-w': `${s.navW}px`, '--list-w': `${s.listW}px` } as CSSProperties}
    >
      <div className="frame__haze" aria-hidden="true" />
      {s.nav !== 'none' && (
        <Nav
          kind={s.nav}
          edge={
            navEdge && (
              <Edge
                label="Sidebar width"
                width={s.navW}
                min={NAV_MIN}
                max={NAV_MAX}
                onMove={(w) => setDrag({ side: 'nav', w })}
                onDone={(w) => done('nav', w)}
                onReset={() => p.onSides({ ...p.sides, navFolded: false, nav: SIDES.nav })}
                onCancel={() => setDrag(null)}
                onStep={(d) => {
                  // From the keyboard the rail opens at its narrowest, and the sidebar folds past it (Spec 09, Part 3).
                  if (s.nav === 'rail') {
                    if (d > 0) p.onSides({ ...p.sides, navFolded: false, nav: NAV_MIN })
                  } else p.onSides(s.navW + d * 8 < NAV_MIN ? { ...p.sides, navFolded: true } : after('nav', s.navW + d * 8))
                }}
              />
            )
          }
          {...p}
        />
      )}
      {listColumn && (
        <section className="frame__list" data-column data-shut={(!s.list && !drag) || undefined} inert={!s.list || undefined} aria-label="Chats" tabIndex={-1} onScrollCapture={onListScroll}>
          {/* The header splits at the column line: the list's own title and its one action over it (Spec 05). */}
          <header className={`panel__header frame__list-head${listScrolled ? ' panel__header--scrolled' : ''}`}>
            {toggleLeads && s.list && toggleButton}
            <h2 className="panel__title">Chats</h2>
            <button className="icon-btn" title="New chat ⌘N" aria-label="New chat" onClick={p.onNewChat}>
              <Icon name="comment-medical" />
            </button>
          </header>
          {p.list}
          <Edge
            label="Chat list width"
            width={s.listW}
            min={LIST_MIN}
            max={LIST_MAX}
            onMove={(w) => setDrag({ side: 'list', w })}
            onDone={(w) => done('list', w)}
            onReset={() => p.onSides({ ...p.sides, list: null })}
            onCancel={() => setDrag(null)}
          />
        </section>
      )}
      <main className={`frame__main${p.cove ? ` frame__main--cove frame__main--${p.cove}` : ''}`} data-column tabIndex={-1} onScrollCapture={onMainScroll}>
        {p.cove && <Cove mode={p.cove} />}
        <Header {...p} compact={s.nav === 'none'} scrolled={mainScrolled} lead={toggleLeads && !s.list ? toggleButton : null} />
        {p.notices}
        <div className="frame__body" ref={bodyRef} data-still={still || undefined}>
          <StillMove.Provider value={still}>{p.children}</StillMove.Provider>
        </div>
      </main>
      {/* Last in the DOM: Electron lays out drag regions in DOM order (Spec 09). */}
      {!toggleLeads && toggleButton}
    </div>
  )
}

function Header(p: FrameProps & { compact: boolean; scrolled: boolean; lead?: ReactNode }) {
  return (
    <header className={`panel__header${p.scrolled ? ' panel__header--scrolled' : ''}`}>
      {p.lead}
      {p.pushed ? (
        <>
          <button className="icon-btn frame__back" title="Back ⌘[" aria-label="Back" onClick={p.onBack}>
            <Icon name="angle-small-left" />
          </button>
          <Title text={p.title} />
        </>
      ) : p.compact ? (
        <ScreenMenu {...p} />
      ) : (
        <Title text={p.title} />
      )}
      <div className="panel__actions">
        {p.actions}
        {/* Pause has one place at each width: here when compact, at the foot of the rail or sidebar otherwise. */}
        {p.compact && <PauseButton paused={p.paused} />}
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

/** W13: a new screen's name surfaces in place of the old one. */
function Title({ text }: { text: string }) {
  return (
    <m.h1 key={text} className="panel__title" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.quick }}>
      {text}
    </m.h1>
  )
}

/** On a root screen at compact width: the screen's icon and name, opening every other screen (Spec 05). */
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
        aria-label={`${p.title}, switch screen${p.needsYou ? `, ${p.needsYou} needs you` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon
          className="screen-menu__icon"
          name={NAV.find((n) => n.place === p.place)?.icon ?? (p.place === 'settings' ? 'settings' : 'home')}
        />
        <span className="screen-menu__title">{p.title}</span>
        <Icon className="screen-menu__chev" name="angle-small-down" />
        {p.needsYou > 0 && <span className="icon-btn__dot" />}
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            className="menu screen-menu__list"
            role="menu"
            aria-label="Screens"
            style={{ transformOrigin: '24px 0' }}
            initial={{ opacity: 0, scale: 0.97, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: T.quick, ease: glide } }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: ebb } }}
          >
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
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** The rail (640–979) or the sidebar (from 980): the screens, Pause, and Settings at the foot. */
function Nav({ kind, edge, ...p }: FrameProps & { kind: 'rail' | 'sidebar'; edge: ReactNode }) {
  const wide = kind === 'sidebar'
  return (
    <nav className={`frame__nav frame__nav--${kind}`} aria-label="Otty" data-column>
      <div className="frame__nav-top" />
      <button className="frame__otty" title={wide ? undefined : p.status} aria-label={`Otty: ${p.status}`} onClick={() => p.onGo('home')}>
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
      {edge}
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
      title={wide ? undefined : item.label}
      aria-label={count ? `${item.label}, ${count} needs you` : item.label}
      onClick={() => onGo(item.place)}
    >
      {/* W5: one highlight that glides to the item chosen, across the rail or sidebar and its foot. */}
      {selected && <m.span layoutId="nav-mark" className="nav-btn__mark" transition={{ duration: T.settle, ease: glide }} />}
      <Icon name={item.icon} />
      {wide && <span className="nav-btn__label">{item.label}</span>}
      {count > 0 && (wide ? <span className="nav-btn__count">{count}</span> : <span className="nav-btn__dot" />)}
    </button>
  )
}

/** A column's right edge (Spec 09, Part 3): drag to size it, past the line to fold or hide it, double-click for the usual width. */
function Edge({ label, width, min, max, onMove, onDone, onReset, onCancel, onStep }: { label: string; width: number; min: number; max: number; onMove: (w: number) => void; onDone: (w: number) => void; onReset: () => void; onCancel: () => void; onStep?: (direction: 1 | -1) => void }) {
  const start = useRef<{ x: number; w: number; last: number } | null>(null)
  // Every way a drag can end ends it, so the edge never stays stuck to the pointer: let go, a lost capture (the window
  // lost focus, say), a cancel, or a move with no button held (a let-go that never arrived). A click without a move changes nothing.
  const end = (w?: number) => {
    const was = start.current
    if (!was) return
    start.current = null
    const to = w ?? was.last
    if (Math.abs(to - was.w) < 2) onCancel()
    else onDone(to)
  }
  return (
    <div
      className="frame__edge"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, w: width, last: width }
      }}
      onPointerMove={(e) => {
        const was = start.current
        if (!was) return
        const w = was.w + e.clientX - was.x
        if (!(e.buttons & 1)) return end(w)
        was.last = w
        onMove(w)
      }}
      onPointerUp={(e) => start.current && end(start.current.w + e.clientX - start.current.x)}
      onPointerCancel={() => end()}
      onLostPointerCapture={() => end()}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const direction = e.key === 'ArrowRight' ? 1 : -1
        if (onStep) onStep(direction)
        else onDone(width + direction * 8)
      }}
    />
  )
}
