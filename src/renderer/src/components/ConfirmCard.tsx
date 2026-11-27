import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import type { ConfirmCard as Card, Receipt, Unusual } from '../../../shared/types'
import { Icon } from './Icon'

// Confirm cards and the receipts they leave (D-60, docs/design/specs/01-decisions.md). Main sends each card already
// split into its parts; this only lays them out. A card can't be approved by a stray click: its buttons ignore the
// pointer until it has been at least half on screen for ARM_MS. The keyboard is never delayed, because reaching a
// button with Tab is already a deliberate step.

export const ARM_MS = 400
/** After this long, the card says since when it has been waiting. */
const WAITING_MS = 10 * 60_000
/** Coming back to a card older than this draws one slow ring around it. */
const RING_MS = 60_000

const GLYPH: Record<Card['kind'], string> = { read: 'globe', open: 'arrow-up-right-from-square', search: 'search', reminder: 'bell', job: 'lookup', use: 'puzzle-alt', event: 'calendar-plus' }

const UNUSUAL: Record<Unusual, string> = {
  alphabet: 'This address uses letters from another alphabet.',
  http: 'This page isn’t private: anyone on your network could see it.',
  private: 'These words leave your Mac. Check they don’t include anything private.',
  cap: 'You’re past this month’s limit.'
}

/** True once the element has been at least half visible for ARM_MS. Without an observer (tests), it counts from now. */
function useArmed(el: React.RefObject<HTMLElement | null>): boolean {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const start = () => (timer ??= setTimeout(() => setArmed(true), ARM_MS))
    const stop = () => {
      clearTimeout(timer)
      timer = undefined
    }
    if (typeof IntersectionObserver === 'undefined' || !el.current) {
      start()
      return stop
    }
    const seen = new IntersectionObserver(([e]) => (e.intersectionRatio >= 0.5 ? start() : stop()), { threshold: [0, 0.5] })
    seen.observe(el.current)
    return () => {
      seen.disconnect()
      stop()
    }
  }, [el])
  return armed
}

/** A query clipped to three lines, with Show all when there's more. */
function Query({ text }: { text: string }) {
  const el = useRef<HTMLDivElement>(null)
  const [long, setLong] = useState(false)
  const [all, setAll] = useState(false)
  useLayoutEffect(() => setLong((el.current?.scrollHeight ?? 0) > (el.current?.clientHeight ?? 0) + 1), [text])
  return (
    <>
      <div ref={el} className={`ask__query${all ? '' : ' ask__query--clip'}`}>“{text}”</div>
      {long && !all && (
        <button className="ask__more" onClick={() => setAll(true)}>
          Show all
        </button>
      )}
    </>
  )
}

function Detail({ card }: { card: Card }) {
  switch (card.kind) {
    case 'read':
    case 'open':
      return (
        <>
          <div className="ask__host">
            {card.host}
            {card.readable && <span className="ask__readable"> {card.readable}</span>}
          </div>
          {card.rest && <div className="ask__sub">{card.rest}</div>}
          {card.kind === 'open' && <div className="ask__meta">Opens in your browser</div>}
        </>
      )
    case 'search':
      return (
        <>
          <Query text={card.query ?? ''} />
          {card.service && <div className="ask__meta">Goes to {card.service}</div>}
        </>
      )
    case 'reminder':
      return (
        <>
          <div className="ask__host">{card.item}</div>
          {card.when && <div className="ask__sub">{card.when}</div>}
          {card.list && <div className="ask__meta">{card.list}</div>}
        </>
      )
    case 'use':
      return (
        <>
          <div className="ask__host">{card.item}</div>
          {card.query && <Query text={card.query} />}
          {card.service && <div className="ask__meta">{card.service}</div>}
        </>
      )
    case 'event':
      return (
        <>
          <div className="ask__host">{card.item}</div>
          {card.when && <div className="ask__meta">{card.when}</div>}
        </>
      )
    case 'job':
      return <div className="ask__long">{card.detail}</div>
  }
}

const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** A card waiting for the user. `since` is when it appeared, for "waiting since" and the ring on return. */
export function ConfirmCard({ confirmId, card, since }: { confirmId: string; card: Card; since: number }) {
  const el = useRef<HTMLDivElement>(null)
  const armed = useArmed(el)
  const [pressed, setPressed] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)
  const [said, setSaid] = useState('')
  const [ring, setRing] = useState(false)
  const [late, setLate] = useState(false)
  const what = card.host ?? card.item ?? card.query ?? ''

  useEffect(() => {
    // Said once, politely, after the region exists. Focus moves to the card only when the user isn't typing somewhere.
    const say = setTimeout(() => setSaid(`Otty is asking: ${card.title} ${what}`), 50)
    const active = document.activeElement
    if (!active || active === document.body) el.current?.focus({ preventScroll: true })
    const waited = setTimeout(() => setLate(true), Math.max(0, since + WAITING_MS - Date.now()))
    const back = () => document.visibilityState === 'visible' && Date.now() - since > RING_MS && setRing(true)
    document.addEventListener('visibilitychange', back)
    return () => {
      clearTimeout(say)
      clearTimeout(waited)
      document.removeEventListener('visibilitychange', back)
    }
  }, [card.title, what, since])

  const answer = (allow: boolean) => (e: MouseEvent) => {
    // A pointer click before the card is armed does nothing; Enter and Space on a focused button (detail 0) always count.
    if ((!armed && e.detail > 0) || pressed !== null) return
    setPressed(allow)
    setFailed(false)
    window.otty.respondConfirm(confirmId, allow).catch(() => {
      setPressed(null)
      setFailed(true)
    })
  }

  return (
    <div
      ref={el}
      className={`confirm-card ask${card.unusual ? ' ask--unusual' : ''}${armed ? '' : ' ask--arming'}${ring ? ' ask--ring' : ''}`}
      role="group"
      aria-labelledby={`ask-${confirmId}`}
      tabIndex={-1}
      onAnimationEnd={() => setRing(false)}
    >
      <span className="sr-only" role="status">
        {said}
      </span>
      <Icon name={GLYPH[card.kind]} className="ask__glyph" />
      <div className="ask__body">
        <div className="ask__title" id={`ask-${confirmId}`}>
          {card.title}
        </div>
        <div className="ask__detail">
          <Detail card={card} />
        </div>
        {card.unusual && (
          <div className="ask__unusual">
            <Icon name="triangle-warning" />
            {UNUSUAL[card.unusual]}
          </div>
        )}
        <div className="confirm-card__row">
          <button className="btn btn--primary" aria-label={what ? `${card.yes}: ${what}` : card.yes} aria-busy={pressed === true} disabled={pressed === false} onClick={answer(true)}>
            {card.yes}
          </button>
          <button className="btn btn--soft" aria-busy={pressed === false} disabled={pressed === true} onClick={answer(false)}>
            Skip
          </button>
          {late && <span className="ask__since">waiting since {clock(since)}</span>}
        </div>
        {failed && <div className="ask__failed">Couldn’t send that. Try again.</div>}
      </div>
    </div>
  )
}

/** What a card was answered with, kept in the chat. Undo shows only when main recorded how to take it back. */
export function ReceiptLine({ answerId, at, receipt, fresh = false }: { answerId: string; at: number; receipt: Receipt; fresh?: boolean }) {
  const [failed, setFailed] = useState(false)
  const undo = async () => setFailed(!(await window.otty.undoReceipt(answerId, at).catch(() => false)))
  return (
    <div className={`receipt${receipt.allowed ? '' : ' receipt--skipped'}${fresh ? ' receipt--fresh' : ''}`}>
      <Icon name={receipt.allowed ? 'check' : 'minus-small'} />
      <span className="receipt__text">
        {receipt.verb} <b>{receipt.what}</b>
        {receipt.why && ` (${receipt.why})`}
        {receipt.undone && ' · Undone'}
        {receipt.undo && !receipt.undone && (
          <>
            {' · '}
            <button className="receipt__undo" aria-label={receipt.undo.label} onClick={() => void undo()}>
              Undo
            </button>
          </>
        )}
        {failed && ' · Couldn’t undo that.'}
      </span>
    </div>
  )
}
