import { useState, type CSSProperties, type ReactNode } from 'react'
import glintsArt from '../assets/cove/glints.webp'
import rippleArt from '../assets/cove/ripple.webp'
import waterlineArt from '../assets/cove/waterline.webp'

/** The refraction, defined once per window (D-83): the pool's and the cove's Otty under the water both use it. */
export function RefractFilter() {
  return (
    <svg className="in-water__filter" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="otty-refract">
        <feTurbulence type="fractalNoise" baseFrequency="0.03 0.2" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" />
      </filter>
    </svg>
  )
}

const waves = new Map<number, string>()
/** The wavy edge above the waterline: a static SVG wave, +-1.6% across the frame, built once per waterline. */
function waveMask(waterline: number): string {
  let uri = waves.get(waterline)
  if (!uri) {
    const w = waterline * 100
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="black" d="M0 0H100V${w}Q87.5 ${w - 3.2} 75 ${w}T50 ${w}T25 ${w}T0 ${w}Z"/></svg>`
    uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    waves.set(waterline, uri)
  }
  return uri
}

interface InWaterProps {
  /** The frame <img>(s), already sized to 100% width. */
  frames: ReactNode
  /** The water picture's URL, for the tint. */
  water: string
  /** The frame shown, as a URL: the tint is masked by it. */
  maskSrc: string
  /** The waterline as a share of the frame's height. */
  waterline?: number
  className?: string
  /** 'under' draws only what's submerged (under layer, tint, shadow); 'above' only the part above the waterline and its line. */
  part?: 'all' | 'under' | 'above'
}

/** Otty in the water (D-83): above the waterline, under it (refracted and faded), the tint, a contact shadow, the waterline. */
export function InWater({ frames, water, maskSrc, waterline = 0.66, className, part = 'all' }: InWaterProps) {
  const wave = waveMask(waterline)
  const frame = `url("${maskSrc}")`
  const showAbove = part !== 'under'
  const showUnder = part !== 'above'
  return (
    <div className={`in-water${className ? ` ${className}` : ''}`} style={{ '--waterline': `${waterline * 100}%` } as CSSProperties}>
      {showAbove && (
        <div className="in-water__above" style={{ maskImage: wave, maskSize: '100% 100%' }}>
          {frames}
        </div>
      )}
      {showUnder && (
        // Alone, the under layer is in flow, so this box keeps the same size as the full one.
        <div className={`in-water__under${part === 'under' ? ' in-water__under--flow' : ''}`} aria-hidden="true">
          {frames}
        </div>
      )}
      {showUnder && (
        <div
          className="in-water__tint"
          style={{
            backgroundImage: `url("${water}")`,
            maskImage: `${frame}, linear-gradient(transparent ${waterline * 100}%, black ${waterline * 100 + 3}%)`,
            maskSize: '100% 100%, 100% 100%',
            maskComposite: 'intersect'
          }}
        />
      )}
      {showUnder && <span className="in-water__shadow" />}
      {showAbove && <img className="in-water__line" src={waterlineArt} alt="" draggable={false} />}
    </div>
  )
}

/** One ripple from a painted picture, growing and fading in steps. A new trigger remounts it, so only one is ever shown. */
export function Ripple({ trigger, className }: { trigger: number; className?: string }) {
  const [done, setDone] = useState(0)
  if (!trigger || trigger === done) return null
  return (
    <img
      key={trigger}
      className={`in-water__ripple${className ? ` ${className}` : ''}`}
      src={rippleArt}
      alt=""
      draggable={false}
      onAnimationEnd={() => setDone(trigger)}
    />
  )
}

/** The glints on the water: faint at rest, twinkling once (in steps) whenever `twinkle` changes. */
export function Glints({ twinkle, className }: { twinkle: number; className?: string }) {
  return (
    <img
      key={twinkle}
      className={`in-water__glints${twinkle ? ' in-water__glints--twinkle' : ''}${className ? ` ${className}` : ''}`}
      src={glintsArt}
      alt=""
      draggable={false}
    />
  )
}
