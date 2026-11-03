import type { BubbleState } from '../../../shared/types'
import idle from '../assets/otty/idle.webp'
import idleBlink from '../assets/otty/idle-blink.webp'

/**
 * Otty, from the painted frames in assets/otty (made by tools/otty-art/prepare.py).
 * The eyes-closed frame sits on top: CSS flashes it for blinks, and holds it as Otty's happy face.
 * Thinking bubbles are drawn here so they can rise around any frame. See .otter-* in styles.css.
 */
export function Otter({ state = 'idle', size = 64 }: { state?: BubbleState; size?: number }) {
  return (
    <span className={`otter otter--${state}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="otter-body">
        <img className="otter-frame" src={idle} alt="" draggable={false} />
        <img className="otter-frame otter-frame--blink" src={idleBlink} alt="" draggable={false} />
      </span>
      <svg className="otter-bubbles" viewBox="0 0 120 120">
        <circle cx="104" cy="22" r="5" />
        <circle cx="113" cy="9" r="3.4" />
        <circle cx="97" cy="7" r="2.4" />
      </svg>
    </span>
  )
}
