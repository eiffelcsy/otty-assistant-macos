import { useEffect, useRef, useState } from 'react'
import type { PouchItem } from '../../../shared/types'
import { KIND_LABELS, type PebbleKind } from '../../../shared/pebbles'
import { Icon } from '../components/Icon'
import type { Drawn } from '../draw/render'
import { SlideView } from '../draw/SlideView'

// One kept Pebble on the wall (D-77, Spec 12 Part 3). It's drawn when it scrolls into view, and one drawing runs at a
// time, so a long Pouch never draws everything at once.

export const GLYPH: Record<PebbleKind, string> = { chart: 'chart-histogram', diagram: 'diagram-project', deck: 'presentation', picture: 'picture' }

/** Every drawing waits its turn: one at a time, like Mermaid itself (draw/render.ts). */
let queue: Promise<unknown> = Promise.resolve()
export function drawOne(drawing: PouchItem['drawing'], code: string): Promise<Drawn> {
  const next = queue.then(() => import('../draw/render').then((r) => r.draw(drawing, code)))
  queue = next.catch(() => undefined)
  return next
}

/** The chat's name, or what the stone says once its chat is gone. */
export const fromWords = (item: PouchItem): string => (item.chatId ? `From “${item.chatTitle}”` : 'From a deleted chat')
const DATE = (ms: number): string => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
export const fromLine = (item: PouchItem): string => `${fromWords(item)} · ${DATE(item.chatAt)}`

export function Stone({ item, onOpen }: { item: PouchItem; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [drawn, setDrawn] = useState<Drawn | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const start = () => {
      void drawOne(item.drawing, item.code)
        .then((d) => live && setDrawn(d))
        .catch(() => live && setDrawn({ kind: 'error', error: 'draw failed' }))
    }
    // jsdom has no IntersectionObserver: draw at once there.
    if (typeof IntersectionObserver === 'undefined') {
      start()
      return () => {
        live = false
      }
    }
    let started = false
    const watch = new IntersectionObserver((entries) => {
      if (started || !entries.some((e) => e.isIntersecting)) return
      started = true
      watch.disconnect()
      start()
    })
    watch.observe(el)
    return () => {
      live = false
      watch.disconnect()
    }
  }, [item.drawing, item.code])

  const kind = KIND_LABELS[item.kind]
  const from = item.chatId ? `from ${item.chatTitle}` : 'from a deleted chat'
  return (
    <button ref={ref} className="stone" aria-label={`${item.title}, ${kind}, ${from}`} title={item.title} onClick={onOpen}>
      <span className="stone__pic">
        {drawn?.kind === 'picture' ? (
          <img src={drawn.dataUrl} alt="" draggable={false} />
        ) : drawn?.kind === 'slides' ? (
          <SlideView page={drawn.pages[0]} className="stone__slide" />
        ) : drawn?.kind === 'error' ? (
          <Icon name={GLYPH[item.kind]} className="stone__glyph" />
        ) : null}
      </span>
      <span className="stone__kind">
        <Icon name={GLYPH[item.kind]} />
        {kind}
      </span>
      <span className="stone__title">{item.title}</span>
      <span className="stone__from">{fromLine(item)}</span>
    </button>
  )
}
