import { useEffect, useRef } from 'react'

// The liquid capsule (DESIGN.md, "Signature moments"): the message box as a drop. Each key press nudges one side of
// its outline a few pixels and the outline eases back over --t-settle, like still water. It never springs, it runs
// one requestAnimationFrame loop only while settling, and at rest it's invisible and costs nothing. Reduced motion
// keeps it still. On send, a small drop rises from the box (CSS, once).

/** The most a side moves, in px. */
export const MAX_NUDGE = 4
/** Time constant of the ease back: about --t-settle (480 ms) to look still again. */
const TAU = 100

/** A side's kick for the nth key press: alternating sides and directions, so typing reads as a ripple, not a shake. */
export function kick(n: number): { side: number; by: number } {
  return { side: n % 4, by: (n % 3 === 0 ? -1 : 1) * (2 + (n % 2)) }
}

/** Offsets after `dt` ms: each one eases towards 0, and anything under a twentieth of a pixel is 0. */
export function settle(offsets: number[], dt: number): number[] {
  const k = Math.exp(-dt / TAU)
  return offsets.map((x) => (Math.abs(x * k) < 0.05 ? 0 : x * k))
}

/** A rounded rectangle whose sides (top, right, bottom, left) bow out by `o`, as one SVG path. */
export function capsulePath(w: number, h: number, r: number, o: number[]): string {
  const [t, ri, b, l] = o
  return [
    `M${r},0`,
    `Q${w / 2},${-2 * t} ${w - r},0`,
    `Q${w},0 ${w},${r}`,
    `Q${w + 2 * ri},${h / 2} ${w},${h - r}`,
    `Q${w},${h} ${w - r},${h}`,
    `Q${w / 2},${h + 2 * b} ${r},${h}`,
    `Q0,${h} 0,${h - r}`,
    `Q${-2 * l},${h / 2} 0,${r}`,
    `Q0,0 ${r},0Z`
  ].join(' ')
}

export function Capsule({ nudges, sends }: { nudges: number; sends: number }) {
  const path = useRef<SVGPathElement>(null)
  const offsets = useRef([0, 0, 0, 0])
  const frame = useRef(0)

  useEffect(() => {
    const el = path.current
    const box = el?.ownerSVGElement?.parentElement
    if (!nudges || !el || !box || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const { side, by } = kick(nudges)
    offsets.current[side] = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, offsets.current[side] + by))
    const { width, height } = box.getBoundingClientRect()
    const r = Math.min(parseFloat(getComputedStyle(box).borderRadius) || 0, height / 2)
    let last = performance.now()
    const draw = (now: number) => {
      offsets.current = settle(offsets.current, now - last)
      last = now
      const most = Math.max(...offsets.current.map(Math.abs))
      el.setAttribute('d', capsulePath(width, height, r, offsets.current))
      el.style.opacity = String(Math.min(1, most / 2))
      frame.current = most ? requestAnimationFrame(draw) : 0
    }
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(draw)
  }, [nudges])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <>
      <svg className="capsule" aria-hidden="true">
        <path ref={path} className="capsule__line" />
      </svg>
      {sends > 0 && <span key={sends} className="capsule__drop" aria-hidden="true" />}
    </>
  )
}
