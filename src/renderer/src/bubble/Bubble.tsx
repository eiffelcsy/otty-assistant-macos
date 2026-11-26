import { useEffect, useRef, useState } from 'react'
import type { BubbleMood, BubbleState } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { InWater, Ripple, RefractFilter } from '../components/InWater'
import float from '../assets/otty/float.webp'
import floatDoze from '../assets/otty/float-doze.webp'
import floatPaddle from '../assets/otty/float-paddle.webp'
import floatPebble from '../assets/otty/float-pebble.webp'
import dawnWater from '../assets/cove/cove-dawn-water.webp'
import dayWater from '../assets/cove/cove-day-water.webp'
import goldenWater from '../assets/cove/cove-golden-water.webp'
import nightWater from '../assets/cove/cove-night-water.webp'
import { coveTime, untilNextCove, type CoveTime } from '../lib/cove'

/** Otty dozes off after this long with nothing happening (D-38); a hover wakes it. */
export const SLEEP_MS = 10 * 60_000
/** How far a press moves before it's a carry, not a click. */
const CARRY_PX = 4
/** How long a hover's bob runs (Spec 13, Part 2). */
const BOB_MS = 600
/** The idle dip: every 40 to 70 s, for 1.6 s (D-83, decision 3). */
const IDLE_MIN_MS = 40_000
const IDLE_SPAN_MS = 30_000
const DIP_MS = 1600
const REDUCED = '(prefers-reduced-motion: reduce)'

const WATER: Record<CoveTime, string> = { dawn: dawnWater, day: dayWater, golden: goldenWater, night: nightWater }

const TITLES: Record<NonNullable<BubbleMood> | 'badge' | 'idle', string> = {
  idle: 'Click to ask Otty · Right-click for more',
  badge: 'Otty has an answer for you · Click to see it',
  working: 'Otty is looking into something for you · Click to ask Otty',
  waiting: 'Otty needs your OK on something · Click, then open the Logbook',
  paused: 'Otty is paused · Right-click to let it carry on'
}

/** What the pool shows, in order: the first that's true is the one (Spec 13, Part 2). */
type PoolState = 'paused' | 'waiting' | 'working' | 'feeding' | 'carried' | 'asleep' | 'resting'

export function Bubble() {
  const [state, setState] = useState<BubbleState>('idle')
  const [badge, setBadge] = useState(false)
  const [mood, setMood] = useState<BubbleMood>(null)
  /** Files or text are being dragged over the otter (D-37). */
  const [feeding, setFeeding] = useState(false)
  /** Picked up: caught by the pointer once a press moves (a click isn't a carry), then a ring when let go (D-38). */
  const [held, setHeld] = useState(false)
  const pressedAt = useRef<{ x: number; y: number } | null>(null)
  /** Ripples (D-83): a hover, a feed, a landing, a state change or an idle dip. Each new one plays again. */
  const [ripples, setRipples] = useState(0)
  const ripple = () => setRipples((n) => n + 1)
  /** The idle dip is on for DIP_MS. */
  const [dip, setDip] = useState(false)
  /** A hover's bob, for BOB_MS after each enter. */
  const [enters, setEnters] = useState(0)
  const [bobbing, setBobbing] = useState(false)
  const [nudged, setNudged] = useState(0)
  /** The painting for this hour: one timer, re-armed for the next change (Spec 13, Part 3). */
  const [time, setTime] = useState<CoveTime>(() => coveTime(new Date()))
  /** What was going on when Otty dozed off: anything new since (a hover, a state, a badge) wakes it. */
  const [sleptAt, setSleptAt] = useState<string | null>(null)
  const moment = `${state}|${mood}|${badge}|${held}|${feeding}|${nudged}`
  const asleep = sleptAt === moment
  const pool: PoolState = mood === 'paused' ? 'paused' : mood === 'waiting' ? 'waiting' : mood === 'working' || state === 'thinking' ? 'working' : feeding ? 'feeding' : held ? 'carried' : asleep ? 'asleep' : 'resting'
  // The idle dip's timer reads these, so they're kept current here, not captured when it was armed.
  const quiet = useRef(false)
  useEffect(() => {
    quiet.current = asleep || mood === 'paused' || held || feeding
  })
  const phase = `${state}|${mood}`
  const lastPhase = useRef(phase)
  useEffect(() => {
    if (lastPhase.current === phase) return
    lastPhase.current = phase
    setRipples((n) => n + 1)
  }, [phase])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let dipTimer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      timer = setTimeout(bob, IDLE_MIN_MS + Math.random() * IDLE_SPAN_MS)
    }
    const bob = () => {
      const calm = !quiet.current && !document.documentElement.dataset.asleep && !window.matchMedia?.(REDUCED).matches
      if (!calm) return arm()
      setDip(true)
      setRipples((n) => n + 1)
      dipTimer = setTimeout(() => {
        setDip(false)
        arm()
      }, DIP_MS)
    }
    arm()
    return () => {
      clearTimeout(timer)
      clearTimeout(dipTimer)
    }
  }, [])

  useEffect(() => window.otty.onBubbleState(setState), [])
  useEffect(() => window.otty.onBubbleBadge(setBadge), [])
  useEffect(() => window.otty.onBubbleMood(setMood), [])
  // A timer reset by anything that happens, never a poll.
  useEffect(() => {
    if (state !== 'idle' || mood || held || feeding) return
    const t = setTimeout(() => setSleptAt(moment), SLEEP_MS)
    return () => clearTimeout(t)
  }, [moment, state, mood, held, feeding])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = () => {
      timer = setTimeout(() => {
        setTime(coveTime(new Date()))
        arm()
      }, untilNextCove(new Date()))
    }
    arm()
    return () => clearTimeout(timer)
  }, [])
  useEffect(() => {
    if (!enters) return
    const t = setTimeout(() => setBobbing(false), BOB_MS)
    return () => clearTimeout(t)
  }, [enters])

  const frame = pool === 'waiting' ? floatPebble : pool === 'asleep' ? floatDoze : float
  const frames =
    pool === 'working' ? (
      <>
        <img className="pool__frame" src={float} alt="" draggable={false} />
        <img className="pool__frame pool__frame--paddle" src={floatPaddle} alt="" draggable={false} />
      </>
    ) : (
      <img className="pool__frame" src={frame} alt="" draggable={false} />
    )
  const title = TITLES[mood ?? (badge ? 'badge' : 'idle')]

  return (
    <div
      className={`bubble pool pool--${pool}${bobbing ? ' pool--bob' : ''}${dip ? ' pool--dip' : ''}`}
      role="button"
      aria-label={title}
      tabIndex={-1}
      title={title}
      data-time={time}
      onPointerEnter={() => {
        setNudged((n) => n + 1)
        setBobbing(true)
        setEnters((n) => n + 1)
        ripple()
      }}
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
        ripple()
        if (text) void window.otty.feedOttyText(text)
        else void window.otty.dropFiles(files).then((pending) => (pending.length ? window.otty.feedOtty(pending.map((f) => f.id)) : undefined))
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        pressedAt.current = { x: e.screenX, y: e.screenY }
        window.otty.bubbleDrag('start')
      }}
      onPointerMove={(e) => {
        const at = pressedAt.current
        if (at && !held && Math.hypot(e.screenX - at.x, e.screenY - at.y) > CARRY_PX) setHeld(true)
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return
        pressedAt.current = null
        if (held) ripple()
        setHeld(false)
        window.otty.bubbleDrag('end')
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        window.otty.bubbleMenu()
      }}
    >
      <RefractFilter />
      <div className="pool__water">
        <img src={WATER[time]} alt="" draggable={false} />
        {/* The submerged part, then the ripple on the surface: both inside the pool's clip (D-83). */}
        <div className="pool__otty pool__otty--under">
          <InWater part="under" water={WATER[time]} maskSrc={frame} frames={frames} />
        </div>
        <Ripple trigger={ripples} className="pool__ring" />
      </div>
      {mood === 'working' && <span className="bubble__working" />}
      {mood === 'waiting' && <span className="bubble__working bubble__working--waiting" />}
      <div className="pool__otty">
        <InWater part="above" water={WATER[time]} maskSrc={frame} frames={frames} />
      </div>
      {mood === 'paused' && (
        <span className="bubble__paused">
          <Icon name="pause" solid />
        </span>
      )}
      {badge && <span className="bubble__badge" />}
      {pool === 'asleep' && (
        <span className="pool__zs" aria-hidden="true">
          <span>z</span>
          <span>z</span>
          <span>z</span>
        </span>
      )}
    </div>
  )
}
