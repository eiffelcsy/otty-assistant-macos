import { useEffect, useState } from 'react'
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

/**
 * The living cove (D-72): the painted sky and shore, the water, a few foreground pieces and Otty floating, from
 * assets/cove (made by tools/otty-art/prepare.py). Nothing moves on its own; a scroll moves the layers (see .cove).
 * `children` float on the water, so a screen can make the otter a button.
 */
export function Cove({ className = '', children }: { className?: string; children?: React.ReactNode }) {
  const { time, before, settle } = useCoveTime()
  return (
    <div className={`cove ${className}`} data-time={time}>
      {[before, time].map(
        (t) =>
          t && (
            <div key={t} className={`cove__scene${t === time && before ? ' cove__scene--in' : ''}`} onAnimationEnd={settle} aria-hidden="true">
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
      <div className="cove__front" aria-hidden="true">
        <img className="cove__reeds" src={reeds} alt="" draggable={false} />
        <img className="cove__lilypad" src={lilypad} alt="" draggable={false} />
      </div>
      <div className="cove__float">{children ?? <FloatingOtty />}</div>
    </div>
  )
}

/** Otty on its back, bobbing in steps like the idle portrait. */
export function FloatingOtty() {
  return <img className="cove__otty" src={float} alt="" draggable={false} />
}
