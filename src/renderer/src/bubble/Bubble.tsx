import { useEffect, useRef, useState } from 'react'
import type { BubbleMood, BubbleState } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { InWater, Ripple, RefractFilter } from '../components/InWater'
import float from '../assets/otty/float.webp'
import floatDoze from '../assets/otty/float-doze.webp'
import floatMouth from '../assets/otty/float-mouth.webp'
import floatMunch from '../assets/otty/float-munch.webp'
import floatPaddle from '../assets/otty/float-paddle.webp'
import floatPaddle2 from '../assets/otty/float-paddle-2.webp'
import floatPebble from '../assets/otty/float-pebble.webp'
import floatStartled from '../assets/otty/float-startled.webp'
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
/** How long the bite shows after a drop (D-37). */
export const MUNCH_MS = 900
/** The idle dip: every 40 to 70 s, for 1.6 s (D-83, decision 3). */
const IDLE_MIN_MS = 40_000
const IDLE_SPAN_MS = 30_000
const DIP_MS = 1600
/** Woken by a hover: the snot bubble pops and Otty looks startled for this long. */
export const WAKE_MS = 900
const REDUCED = '(prefers-reduced-motion: reduce)'

const PADDLE: [string, string][] = [
  [float, 'rest'],
  [floatPaddle, 'kick'],
  [floatPaddle2, 'kick-back']
]

const WATER: Record<CoveTime, string> = { dawn: dawnWater, day: dayWater, golden: goldenWater, night: nightWater }

const TITLES: Record<NonNullable<BubbleMood> | 'badge' | 'idle', string> = {
  idle: 'Click to ask Otty · Right-click for more',
  badge: 'Otty has an answer for you · Click to see it',
  working: 'Otty is looking into something for you · Click to ask Otty',
  waiting: 'Otty needs your OK on something · Click, then open the Logbook',
  paused: 'Otty is paused · Right-click to let it carry on'
}

/** What the pool shows, in order: the first that's true is the one (Spec 13, Part 2). */
type PoolState = 'paused' | 'waiting' | 'munching' | 'feeding' | 'working' | 'carried' | 'startled' | 'asleep' | 'resting'

export function Bubble() {
  const [state, setState] = useState<BubbleState>('idle')
  const [badge, setBadge] = useState(false)
  const [mood, setMood] = useState<BubbleMood>(null)
  /** Files or text are being dragged over the otter (D-37). */
  const [feeding, setFeeding] = useState(false)
  /** The bite after a drop, for MUNCH_MS. */
  const [munching, setMunching] = useState(false)
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
  /** Woken from a doze by a hover: the pop and the startled look, for WAKE_MS. */
  const [wakes, setWakes] = useState(0)
  const [startled, setStartled] = useState(false)
  /** The painting for this hour: one timer, re-armed for the next change (Spec 13, Part 3). */
  const [time, setTime] = useState<CoveTime>(() => coveTime(new Date()))
  /** What was going on when Otty dozed off: anything new since (a hover, a state, a badge) wakes it. */
  const [sleptAt, setSleptAt] = useState<string | null>(null)
  const moment = `${state}|${mood}|${badge}|${held}|${feeding}|${nudged}`
  const asleep = sleptAt === moment
  // Feeding answers the user's own drag, so it shows over working (and a drop's bite over everything but pause and needs-you).
  const pool: PoolState = mood === 'paused' ? 'paused' : mood === 'waiting' ? 'waiting' : munching ? 'munching' : feeding ? 'feeding' : mood === 'working' || state === 'thinking' ? 'working' : held ? 'carried' : startled ? 'startled' : asleep ? 'asleep' : 'resting'
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
    if (!munching) return
    const t = setTimeout(() => setMunching(false), MUNCH_MS)
    return () => clearTimeout(t)
  }, [munching])
  useEffect(() => {
    if (!wakes) return
    const t = setTimeout(() => setStartled(false), WAKE_MS)
    return () => clearTimeout(t)
  }, [wakes])
  useEffect(() => {
    if (!enters) return
    const t = setTimeout(() => setBobbing(false), BOB_MS)
    return () => clearTimeout(t)
  }, [enters])

  const frame = pool === 'waiting' ? floatPebble : pool === 'asleep' ? floatDoze : pool === 'startled' ? floatStartled : pool === 'feeding' ? floatMouth : pool === 'munching' ? floatMunch : float
  // Working is a four-beat kick (rest, paddle, rest, paddle the other way), each beat a whole Otty (frame, tint and all),
  // so one pose's feet and tail never sit over another's.
  const otty = (part: 'under' | 'above') =>
    pool === 'working' ? (
      <>
        {PADDLE.map(([src, beat]) => (
          <div key={beat} className={`pool__swap pool__swap--${beat}`}>
            <InWater part={part} water={WATER[time]} maskSrc={src} frames={<img className="pool__frame" src={src} alt="" draggable={false} />} />
          </div>
        ))}
      </>
    ) : (
      <InWater
        part={part}
        water={WATER[time]}
        maskSrc={frame}
        frames={
          <>
            <img className="pool__frame" src={frame} alt="" draggable={false} />
            {/* Asleep: a snot bubble from the nostril, riding the breath with Otty. Woken: it pops. */}
            {part === 'above' && pool === 'asleep' && <span className="pool__snot" aria-hidden="true" />}
            {part === 'above' && pool === 'startled' && <span key={wakes} className="pool__snot pool__snot--pop" aria-hidden="true" />}
          </>
        }
      />
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
        if (asleep) {
          setStartled(true)
          setWakes((n) => n + 1)
        }
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
      // Leaving the pool, not just passing from the water onto Otty inside it.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFeeding(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setFeeding(false)
        const files = [...e.dataTransfer.files]
        const text = files.length ? '' : e.dataTransfer.getData('text/plain').trim()
        if (!files.length && !text) return
        setMunching(true)
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
          {otty('under')}
        </div>
        <Ripple trigger={ripples} className="pool__ring" />
      </div>
      {mood === 'working' && <span className="bubble__working" />}
      {mood === 'waiting' && <span className="bubble__working bubble__working--waiting" />}
      <div className="pool__otty">
        {otty('above')}
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
