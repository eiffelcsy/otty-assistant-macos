import { useEffect, useState } from 'react'
import type { PouchItem } from '../../../shared/types'
import { KIND_LABELS } from '../../../shared/pebbles'
import { findRanges, parseQuery } from '../../../shared/match'
import type { Band } from '../frame/bands'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'
import { Stone } from './Stone'
import { StoneCard } from './StoneCard'

// The Pouch (D-77, Spec 12): what you kept, on shelves. It's a wall, not a file browser: no folders, no sort menu.
// The Put back line stays for six seconds, and Undo puts the stone back.

const OK_MS = 6000
const LOOSE = 'Not on a shelf'

export const keyOf = (i: PouchItem): string => `${i.answerId}:${i.index}`

/** Shelves in the order they were first used (each one's oldest keep), then the loose stones, which keep the Pouch's order. */
export function shelvesOf(items: PouchItem[]): { label: string | null; shelf: string | null; items: PouchItem[] }[] {
  const first = new Map<string, number>()
  for (const i of items) if (i.shelf) first.set(i.shelf, Math.min(first.get(i.shelf) ?? Infinity, i.kept))
  const names = [...first.keys()].sort((a, b) => first.get(a)! - first.get(b)!)
  const groups: { label: string | null; shelf: string | null; items: PouchItem[] }[] = names.map((shelf) => ({ label: shelf, shelf, items: items.filter((i) => i.shelf === shelf) }))
  const loose = items.filter((i) => !i.shelf)
  if (loose.length) groups.push({ label: names.length ? LOOSE : null, shelf: null, items: loose })
  return groups
}

/** Search over the title, the kind's label, the shelf and the chat's title (`shared/match.ts`, as Find does). */
const matches = (i: PouchItem, terms: string[]): boolean =>
  terms.every((t) => findRanges([i.title, KIND_LABELS[i.kind], i.shelf ?? '', i.chatTitle].join(' '), [t]).length > 0)

export function Pouch({ band, onOpenChat }: { band: Band; onOpenChat: (chatId: string, answerId: string) => void }) {
  const compact = band === 'compact'
  const [all, setAll] = useState<PouchItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [ok, setOk] = useState<PouchItem | null>(null)

  useEffect(() => {
    void window.otty.pouch().then(setAll, () => setAll([]))
  }, [])

  // The Put back line goes after OK_MS, or at the next Put back.
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(null), OK_MS)
    return () => clearTimeout(t)
  }, [ok])

  const putBack = async (item: PouchItem) => {
    setOpen(null)
    const gone = await window.otty.putBack(item.answerId, item.index).catch(() => false)
    if (!gone) return
    setAll((list) => list?.filter((i) => keyOf(i) !== keyOf(item)) ?? null)
    setOk(item)
  }
  const undo = async () => {
    const item = ok
    if (!item) return
    setOk(null)
    const back = await window.otty.undoPutBack(item.answerId, item.index).catch(() => false)
    if (back) void window.otty.pouch().then(setAll, () => undefined)
  }
  const shelve = (item: PouchItem, shelf: string | null) => {
    void window.otty.setShelf(item.answerId, item.index, shelf).then(setAll, () => undefined)
  }

  const items = all ?? []
  const terms = parseQuery(query)
  const shown = terms.length ? items.filter((i) => matches(i, terms)) : items
  const groups = shelvesOf(shown)
  const shelves = shelvesOf(items).flatMap((g) => (g.shelf ? [g.shelf] : []))
  const current = open ? items.find((i) => keyOf(i) === open) : undefined

  return (
    <div className={`frame__screen pouch${compact ? ' pouch--list' : ''}`}>
      <div className="pouch-bar">
        <h2 className="pouch-bar__title">
          Pouch
          {items.length > 0 && <span className="pouch-bar__count"> · {items.length}</span>}
        </h2>
        <label className="set-find pouch-find">
          <Icon name="search" />
          <input
            placeholder="Find in your Pouch"
            aria-label="Find in your Pouch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation()
                setQuery('')
              }
            }}
          />
        </label>
      </div>
      {ok && (
        <div className="ok-card pouch-ok">
          <span className="pouch-ok__text">Put back “{ok.title}”</span>
          <button className="btn btn--quiet btn--small" aria-label="Undo" onClick={() => void undo()}>
            Undo
          </button>
        </div>
      )}
      {all && items.length === 0 && (
        <div className="pouch-empty">
          <Otter state="idle" size={64} />
          <p className="pouch-empty__line">Keep a chart, a diagram or slides from any answer, and it lands here.</p>
        </div>
      )}
      {items.length > 0 && terms.length > 0 && shown.length === 0 && <div className="pouch-note">Nothing in your Pouch matches “{query.trim()}”.</div>}
      <div className="pouch-body">
        {groups.map((g, n) => (
          <section key={`${n}:${g.label ?? ''}`} className="pouch-group">
            {g.label && <div className="set-group__label">{g.label}</div>}
            <div className="pouch-grid">
              {g.items.map((i) => (
                <Stone key={keyOf(i)} item={i} onOpen={() => setOpen(keyOf(i))} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {current && (
        <StoneCard
          key={keyOf(current)}
          item={current}
          shelves={shelves}
          onClose={() => setOpen(null)}
          onShelf={(shelf) => shelve(current, shelf)}
          onOpenChat={(chatId, answerId) => {
            setOpen(null)
            onOpenChat(chatId, answerId)
          }}
          onPutBack={() => void putBack(current)}
        />
      )}
    </div>
  )
}
