import { useEffect, useState } from 'react'
import type { BubbleMood, BubbleState } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { Otter, type OtterFace } from '../components/Otter'

/** Otty dozes off after this long with nothing happening (D-38); a hover wakes it. */
export const SLEEP_MS = 10 * 60_000
/** One munch, then back to whatever it was doing (D-37). */
const MUNCH_MS = 700

const TITLES: Record<NonNullable<BubbleMood> | 'badge' | 'idle', string> = {
  idle: 'Click to ask Otty · Right-click for more',
  badge: 'Otty has an answer for you · Click to see it',
  working: 'Otty is looking into something for you · Click to ask Otty',
  waiting: 'Otty needs your OK on something · Click, then open the Logbook',
  paused: 'Otty is paused · Right-click to let it carry on'
}

export function Bubble() {
  const [state, setState] = useState<BubbleState>('idle')
  const [badge, setBadge] = useState(false)
  const [mood, setMood] = useState<BubbleMood>(null)
  /** Files or text are being dragged over the otter (D-37). */
  const [feeding, setFeeding] = useState(false)
  const [munching, setMunching] = useState(false)
  /** Pressed: caught by the pointer, then a wiggle when let go (D-38). */
  const [held, setHeld] = useState(false)
  const [landed, setLanded] = useState(false)
  const [asleep, setAsleep] = useState(false)
  const [nudged, setNudged] = useState(0)

  useEffect(() => window.otty.onBubbleState(setState), [])
  useEffect(() => window.otty.onBubbleBadge(setBadge), [])
  useEffect(() => window.otty.onBubbleMood(setMood), [])
  // A timer reset by anything that happens, never a poll.
  useEffect(() => {
    setAsleep(false)
    if (state !== 'idle' || mood || held || feeding) return
    const t = setTimeout(() => setAsleep(true), SLEEP_MS)
    return () => clearTimeout(t)
  }, [state, mood, held, feeding, nudged])
  useEffect(() => {
    if (!munching) return
    const t = setTimeout(() => setMunching(false), MUNCH_MS)
    return () => clearTimeout(t)
  }, [munching])
  useEffect(() => {
    if (!landed) return
    const t = setTimeout(() => setLanded(false), 600)
    return () => clearTimeout(t)
  }, [landed])

  const face: OtterFace = munching ? 'munch' : feeding ? 'hungry' : held ? 'caught' : state !== 'idle' ? state : asleep ? 'sleepy' : 'idle'

  return (
    <div
      className={`bubble bubble--${state}${feeding ? ' bubble--feeding' : ''}${landed ? ' bubble--landed' : ''}`}
      title={TITLES[mood ?? (badge ? 'badge' : 'idle')]}
      onPointerEnter={() => setNudged((n) => n + 1)}
      // D-37: feed Otty files, or text dragged from another app.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('text/plain')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setFeeding(true)
      }}
      onDragLeave={() => setFeeding(false)}
      onDrop={(e) => {
        e.preventDefault()
        setFeeding(false)
        const files = [...e.dataTransfer.files]
        const text = files.length ? '' : e.dataTransfer.getData('text/plain').trim()
        if (!files.length && !text) return
        setMunching(true)
        if (text) void window.otty.feedOttyText(text)
        else void window.otty.dropFiles(files).then((pending) => (pending.length ? window.otty.feedOtty(pending.map((f) => f.id)) : undefined))
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setHeld(true)
        window.otty.bubbleDrag('start')
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return
        setHeld(false)
        setLanded(true)
        window.otty.bubbleDrag('end')
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        window.otty.bubbleMenu()
      }}
    >
      <span className="bubble__avatar">
        <Otter state={face} size={70} />
      </span>
      {mood === 'working' && <span className="bubble__working" />}
      {mood === 'waiting' && <span className="bubble__working bubble__working--waiting" />}
      {mood === 'paused' && (
        <span className="bubble__paused">
          <Icon name="pause" solid />
        </span>
      )}
      {badge && <span className="bubble__badge" />}
    </div>
  )
}
