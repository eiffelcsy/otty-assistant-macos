import type { BubbleState } from '../../../shared/types'
import catchFrame from '../assets/otty/catch.webp'
import cheer from '../assets/otty/cheer.webp'
import idle from '../assets/otty/idle.webp'
import idleBlink from '../assets/otty/idle-blink.webp'
import mouthOpen from '../assets/otty/mouth-open.webp'
import munch from '../assets/otty/munch.webp'
import sleepy from '../assets/otty/sleepy.webp'
import thinking from '../assets/otty/thinking.webp'
import tilt from '../assets/otty/tilt.webp'

/** Main's states, plus the faces only the floating otter makes for itself (D-37, D-38). */
export type OtterFace = BubbleState | 'sleepy' | 'hungry' | 'munch' | 'caught'

const FRAMES: Record<OtterFace, string> = {
  idle,
  thinking,
  happy: cheer,
  oops: tilt,
  sleepy,
  hungry: mouthOpen,
  munch,
  caught: catchFrame
}

/**
 * Otty, from the painted frames in assets/otty (made by tools/otty-art/prepare.py): one frame per face, swapped, never
 * tweened. Only the idle face blinks. Thinking bubbles are drawn here so they can rise around any frame. See .otter-*.
 */
export function Otter({ state = 'idle', size = 64 }: { state?: OtterFace; size?: number }) {
  return (
    <span className={`otter otter--${state}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="otter-body">
        <img className="otter-frame" src={FRAMES[state]} alt="" draggable={false} />
        {state === 'idle' && <img className="otter-frame otter-frame--blink" src={idleBlink} alt="" draggable={false} />}
      </span>
      <svg className="otter-bubbles" viewBox="0 0 120 120">
        <circle cx="104" cy="22" r="5" />
        <circle cx="113" cy="9" r="3.4" />
        <circle cx="97" cy="7" r="2.4" />
      </svg>
    </span>
  )
}
