import { useEffect, useRef, useState } from 'react'
import { m, useMotionValue, useReducedMotion, useSpring, type MotionValue } from 'motion/react'
import dawnShore from '../assets/cove/cove-dawn-shore.webp'
import dawnWater from '../assets/cove/cove-dawn-water.webp'
import dayShore from '../assets/cove/cove-day-shore.webp'
import dayWater from '../assets/cove/cove-day-water.webp'
import goldenShore from '../assets/cove/cove-golden-shore.webp'
import goldenWater from '../assets/cove/cove-golden-water.webp'
import nightShore from '../assets/cove/cove-night-shore.webp'
import nightWater from '../assets/cove/cove-night-water.webp'
import cloud from '../assets/cove/cloud-wide.webp'
import lilypad from '../assets/cove/lilypad-flower.webp'
import reeds from '../assets/cove/reeds-low.webp'
import float from '../assets/otty/float.webp'
import { coveTime, untilNextCove, type CoveTime } from '../lib/cove'
import { T, glide } from '../lib/motion'

const PAINTINGS: Record<CoveTime, [shore: string, water: string]> = {
  dawn: [dawnShore, dawnWater],
  day: [dayShore, dayWater],
  golden: [goldenShore, goldenWater],
  night: [nightShore, nightWater]
}

const DARK = '(prefers-color-scheme: dark)'
const isDark = () => window.matchMedia?.(DARK).matches ?? false

/** The painting for now, and the one it's fading in over (null once settled). One timer, for the next hour that changes it. */
function useCoveTime(): { time: CoveTime; before: CoveTime | null; settle: () => void } {
  const [scene, setScene] = useState(() => ({ time: coveTime(new Date(), isDark()), before: null as CoveTime | null }))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const dark = window.matchMedia?.(DARK)
    const update = () => {
      clearTimeout(timer)
      const time = coveTime(new Date(), isDark())
      setScene((s) => (s.time === time ? s : { time, before: s.time }))
      timer = setTimeout(update, untilNextCove(new Date()))
    }
    update()
    dark?.addEventListener('change', update)
    return () => {
      clearTimeout(timer)
      dark?.removeEventListener('change', update)
    }
  }, [])
  return { ...scene, settle: () => setScene((s) => ({ ...s, before: null })) }
}

/** The cove settles into place once per window, the first time one is seen: after that, going Home is instant. */
let arrived = false

/** A heavily damped follow, so the layers drift after the pointer like something floating, and never bounce. */
const DRIFT = { stiffness: 60, damping: 22, mass: 1 }

interface Ripple {
  id: number
  x: number
  y: number
}

/**
 * Depth and touch, for a pointer only (nothing runs until it moves). The cove sits behind the screen's scroller, so it
 * listens on its parent (the frame's main column), where every pointer event over the screen arrives: the layers lean
 * away from the pointer by their depth (`--px`, `--py`, from -1 to 1), and a press on open water, or on Otty, spreads
 * two rings. A press on a card, the header or the message box isn't the water.
 */
function useTouch(cove: React.RefObject<HTMLDivElement | null>, on: boolean) {
  const reduced = useReducedMotion()
  const px = useSpring(useMotionValue(0), DRIFT)
  const py = useSpring(useMotionValue(0), DRIFT)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const next = useRef(0)
  const live = on && !reduced
  useEffect(() => {
    const el = cove.current
    const area = el?.parentElement
    if (!live || !el || !area) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      px.set(((e.clientX - r.left) / r.width) * 2 - 1)
      py.set(((e.clientY - r.top) / r.height) * 2 - 1)
    }
    const leave = () => (px.set(0), py.set(0))
    const down = (e: PointerEvent) => {
      const target = e.target as Element
      const otty = target.closest('.cove-otty')
      if (!otty && !target.closest('.cove-hero') && !target.classList.contains('cove-scroll')) return
      const r = el.getBoundingClientRect()
      const o = otty?.getBoundingClientRect()
      // Otty's waterline, or wherever the water was touched; the sky doesn't ripple.
      const at = o ? { x: o.left + o.width / 2, y: o.top + o.height * 0.7 } : { x: e.clientX, y: e.clientY }
      if (!o && at.y - r.top < parseFloat(getComputedStyle(el).getPropertyValue('--horizon'))) return
      const id = next.current++
      setRipples((rs) => [...rs.slice(-3), { id, x: at.x - r.left, y: at.y - r.top }])
    }
    area.addEventListener('pointermove', move)
    area.addEventListener('pointerleave', leave)
    area.addEventListener('pointerdown', down)
    return () => {
      area.removeEventListener('pointermove', move)
      area.removeEventListener('pointerleave', leave)
      area.removeEventListener('pointerdown', down)
    }
  }, [cove, live, px, py])
  return {
    style: (live ? { '--px': px, '--py': py } : {}) as Record<string, MotionValue<number>>,
    ripples,
    done: (id: number) => setRipples((rs) => rs.filter((r) => r.id !== id))
  }
}

/** Two rings, the second a beat behind and smaller, spreading flat across the water. */
function Rings({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  return (
    <span className="cove__ripple" style={{ left: x, top: y }}>
      {[0, 1].map((i) => (
        <m.span
          key={i}
          className="cove__ring"
          initial={{ scale: 0.2, opacity: 0.9 }}
          animate={{ scale: i ? 1.1 : 1.6, opacity: 0 }}
          transition={{ duration: T.drift, ease: glide, delay: i * 0.18 }}
          onAnimationComplete={i ? onDone : undefined}
        />
      ))}
    </span>
  )
}

/**
 * The living cove (D-72), full bleed (D-74, Spec 07): the painted sky and shore, the water, a few foreground pieces,
 * and the water's own colour under them, from assets/cove (made by tools/otty-art/prepare.py). It's the backdrop of the
 * frame's main column, placed by `--horizon` (one value per band); the screen's own scroller, header and message box sit
 * over it on glass, and Otty floats in the screen's hero (`CoveOtty`). `wash` keeps only the band behind the header, for
 * a chat with content. Nothing moves on its own: the first cove settles in once, then only a scroll or the pointer.
 */
export function Cove({ mode }: { mode: 'full' | 'wash' }) {
  const { time, before, settle } = useCoveTime()
  const ref = useRef<HTMLDivElement>(null)
  const touch = useTouch(ref, mode === 'full')
  // Until one has settled in where it was seen, every cove arrives; a hidden one waits, since CSS doesn't run there.
  const [arriving, setArriving] = useState(() => !arrived)
  return (
    <m.div
      ref={ref}
      className={`cove cove--${mode}`}
      data-time={time}
      data-arriving={arriving || undefined}
      style={touch.style}
      aria-hidden="true"
      onAnimationEnd={(e) => e.animationName === 'cove-arrive-front' && ((arrived = true), setArriving(false))}
    >
      {[before, time].map(
        (t) =>
          t && (
            <div key={t} className={`cove__scene${t === time && before ? ' cove__scene--in' : ''}`} onAnimationEnd={settle}>
              <div className="cove__far">
                <img className="cove__shore" src={PAINTINGS[t][0]} alt="" draggable={false} />
                <img className="cove__cloud" src={cloud} alt="" draggable={false} />
              </div>
              <div className="cove__near">
                <img className="cove__water" src={PAINTINGS[t][1]} alt="" draggable={false} />
              </div>
            </div>
          )
      )}
      <div className="cove__ripples">
        {touch.ripples.map((r) => (
          <Rings key={r.id} x={r.x} y={r.y} onDone={() => touch.done(r.id)} />
        ))}
      </div>
      <div className="cove__front">
        <img className="cove__reeds" src={reeds} alt="" draggable={false} />
        <img className="cove__lilypad" src={lilypad} alt="" draggable={false} />
      </div>
      <div className="cove__scrim" />
    </m.div>
  )
}

/**
 * Otty on its back in the water, in a screen's hero over the cove: placed by its waterline, faded below it, with its
 * reflection, bobbing in steps. A button named Otty; a press squishes it (and the cove ripples from its waterline).
 */
export function CoveOtty() {
  const [squish, setSquish] = useState(0)
  const [arriving] = useState(() => !arrived)
  return (
    <button className="cove-otty" aria-label="Otty" data-arriving={arriving || undefined} onClick={() => setSquish((n) => n + 1)}>
      <span key={squish} className={`cove-otty__squish${squish ? ' cove-otty__squish--on' : ''}`}>
        <span className="cove-otty__body">
          <img className="cove-otty__refl" src={float} alt="" draggable={false} />
          <img className="cove-otty__img" src={float} alt="" draggable={false} />
        </span>
      </span>
    </button>
  )
}
