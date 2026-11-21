import { useEffect, useRef, useState } from 'react'
import { retryPrompt, type DrawingKind } from '../../../shared/drawing'
import type { DrawingResult } from '../../../shared/types'
import { Icon } from '../components/Icon'
import type { Drawn } from './render'
import { SlideView } from './SlideView'

/** What a card needs from the answer around it: whether it has finished, and a way to ask a follow-up. */
export interface DrawingHost {
  done: boolean
  ask: (text: string) => void
}

/** The renderer, the sanitiser and Mermaid load the first time a drawing appears, so most chats never pay for them. */
const renderer = () => import('./render')

const NAMES: Record<DrawingKind, string> = { mermaid: 'Otty diagram', svg: 'Otty picture', slides: 'Otty slides' }

const SAID: Record<DrawingResult, string | null> = {
  copied: 'Copied',
  saved: 'Saved',
  cancelled: null,
  failed: 'Otty couldn’t do that'
}

/** A chart of the user's data (D-35): Otty wrote the Mermaid from its own numbers, so See the text shows those. */
export interface ChartInfo {
  table: string
}

const CHART_RETRY = 'The chart didn’t draw. Call make_chart again, maybe with fewer bars.'

/** A diagram, picture or deck drawn on the Mac from the model's text, with ways to take it elsewhere. */
/** Which Pebble this card is (step 1): its answer and its place there, which main looks up to keep it. */
export interface PebbleRef {
  answerId: string
  index: number
}

export function DrawingCard({ kind, code, host, chart, pebble }: { kind: DrawingKind; code: string; host: DrawingHost; chart?: ChartInfo; pebble?: PebbleRef }) {
  const [drawn, setDrawn] = useState<Drawn | null>(null)
  const [kept, setKept] = useState(false)
  const { answerId, index } = pebble ?? {}
  useEffect(() => {
    if (answerId === undefined || index === undefined || !host.done) return
    let live = true
    void window.otty.keptPebbles(answerId).then((k) => live && setKept(k.includes(index)))
    return () => {
      live = false
    }
  }, [answerId, index, host.done])
  const keep = async () => {
    if (!pebble) return
    if (await window.otty.keepPebble(pebble.answerId, pebble.index, !kept)) setKept(!kept)
  }
  const [showText, setShowText] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Half a diagram doesn't parse, so wait for the answer to finish.
    if (!host.done) return
    let live = true
    void renderer()
      .then((r) => r.draw(kind, code))
      .then((d) => live && setDrawn(d))
    return () => {
      live = false
    }
  }, [kind, code, host.done])

  // One message at a time: a newer one cancels the older one's timer, which used to clear "Saved" right after "Copied".
  const clear = useRef<ReturnType<typeof setTimeout>>(undefined)
  const flash = (text: string | null) => {
    clearTimeout(clear.current)
    setSaid(text)
    if (text) clear.current = setTimeout(() => setSaid(null), 1800)
  }

  const out = async (how: 'copy' | 'png' | 'pdf') => {
    if (!drawn || drawn.kind === 'error' || busy) return
    setBusy(true)
    try {
      const d =
        drawn.kind === 'picture'
          ? { kind: 'picture' as const, svg: drawn.dataUrl, width: drawn.width, height: drawn.height, background: (await renderer()).theme().bg, name: chart ? 'Otty chart' : NAMES[kind] }
          : { kind: 'slides' as const, html: drawn.html, name: NAMES[kind] }
      flash(SAID[await window.otty.exportDrawing(d, how)])
    } finally {
      setBusy(false)
    }
  }

  const big = (present = false) => {
    if (!drawn || drawn.kind === 'error') return
    void window.otty.showDrawing(
      drawn.kind === 'picture'
        ? { kind: 'picture', dataUrl: drawn.dataUrl, width: drawn.width, height: drawn.height }
        : { kind: 'slides', pages: drawn.pages, notes: drawn.deck.slides.map((s) => s.notes), present }
    )
  }

  const label = kind === 'slides' ? 'slides' : chart ? 'chart' : 'drawing'
  return (
    <div className={`drawing-card drawing-card--${kind}`}>
      <div className="drawing-card__stage">
        {!drawn ? (
          <div className="drawing-card__wait">
            <Icon name="pencil" />
            <span className="dots">Otty is drawing</span>
          </div>
        ) : drawn.kind === 'error' ? (
          <div className="drawing-card__error">
            <span>This {label} didn’t come out right.</span>
            <button className="copy-btn drawing-card__retry" onClick={() => host.ask(chart ? CHART_RETRY : retryPrompt(kind, drawn.error))}>
              <Icon name="refresh" />
              Try again
            </button>
          </div>
        ) : drawn.kind === 'picture' ? (
          <button className="drawing-card__picture" onClick={() => big()} title="Show big">
            <img src={drawn.dataUrl} alt={kind === 'svg' ? 'Picture drawn by Otty' : 'Diagram drawn by Otty'} />
          </button>
        ) : (
          <button className="drawing-card__deck" onClick={() => big(true)} title="Present">
            <SlideView page={drawn.pages[0]} />
            <span className="drawing-card__count">{drawn.pages.length === 1 ? '1 slide' : `${drawn.pages.length} slides`}</span>
          </button>
        )}
      </div>
      {drawn && drawn.kind !== 'error' && (
        <div className="drawing-card__bar">
          {drawn.kind === 'slides' ? (
            <button className="copy-btn" onClick={() => big(true)}>
              <Icon name="play" />
              Present
            </button>
          ) : (
            <button className="copy-btn" onClick={() => big()}>
              <Icon name="expand" />
              Show big
            </button>
          )}
          {drawn.kind === 'picture' && (
            <button className="copy-btn" disabled={busy} onClick={() => void out('copy')}>
              <Icon name="copy-alt" />
              Copy as picture
            </button>
          )}
          {drawn.kind === 'picture' && (
            <button className="copy-btn" disabled={busy} onClick={() => void out('png')}>
              <Icon name="picture" />
              Save PNG
            </button>
          )}
          <button className="copy-btn" disabled={busy} onClick={() => void out('pdf')}>
            <Icon name="file-pdf" />
            Save PDF
          </button>
          <button className="copy-btn drawing-card__text-btn" aria-pressed={showText} onClick={() => setShowText((v) => !v)}>
            <Icon name="code-simple" />
            {showText ? (chart ? 'Hide the numbers' : 'Hide the text') : chart ? 'See the numbers' : 'See the text'}
          </button>
          {pebble && (
            <button className={`copy-btn drawing-card__keep${kept ? ' drawing-card__keep--on' : ''}`} aria-pressed={kept} onClick={() => void keep()}>
              <Icon name="bookmark" solid={kept} />
              {kept ? 'Kept' : 'Keep'}
            </button>
          )}
          {said && <span className="drawing-card__said">{said}</span>}
        </div>
      )}
      {showText && (
        <pre className="drawing-card__code">
          <code>{chart?.table ?? code}</code>
        </pre>
      )}
    </div>
  )
}
