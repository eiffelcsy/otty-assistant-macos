import { LazyMotion, MotionConfig, domMax } from 'motion/react'
import type { ReactNode } from 'react'

// Motion's half of DESIGN.md's "Motion: water, not springs". CSS keeps what CSS does best and pays nothing for it
// (hover and press transitions, the stepped otter, the scroll-driven cove, everything `data-asleep` must pause); Motion
// does what CSS can't: exits, things gliding to their new place (layout), and motion that follows the pointer. Nothing
// here may run on its own while idle (NFR-3), so no `repeat`.

/** The `--t-*` tokens of styles.css, in seconds (`rules/renderer.test.ts` keeps them equal). */
export const T = { tap: 0.12, quick: 0.28, settle: 0.48, travel: 0.72, drift: 1.4, camera: 0.9 }
/** `--glide` and `--ebb`. (`--buoy` moments are CSS so far; add it here when Motion needs it.) */
export const glide = [0.16, 1, 0.3, 1] as const
export const ebb = [0.45, 0, 0.85, 0.4] as const
/** `--swell`: the camera's tilt (Spec 08, Part 9). */
export const swell = [0.42, 0, 0.12, 1] as const

/** *surface*: rise and clear, settle. *ebb* out: sink 6 px and fade, in about two-thirds of the time. */
export const surface = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6, transition: { duration: T.settle * 0.66, ease: ebb } }
}

/**
 * Every view's root. `domMax` because shared highlights glide between places (layout); `strict` keeps everyone on the
 * lazy `m.*` components. Reduced motion keeps the fades and drops the movement, as the CSS does.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: T.settle, ease: glide }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
