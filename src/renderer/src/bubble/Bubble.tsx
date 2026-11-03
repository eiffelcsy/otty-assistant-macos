import { useEffect, useState } from 'react'
import type { BubbleState } from '../../../shared/types'
import { Otter } from '../components/Otter'

export function Bubble() {
  const [state, setState] = useState<BubbleState>('idle')
  const [badge, setBadge] = useState(false)

  useEffect(() => window.otty.onBubbleState(setState), [])
  useEffect(() => window.otty.onBubbleBadge(setBadge), [])

  return (
    <div
      className={`bubble bubble--${state}`}
      title={badge ? 'Otty has an answer for you · Click to see it' : 'Click to ask Otty · Right-click for more'}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        window.otty.bubbleDrag('start')
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return
        window.otty.bubbleDrag('end')
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        window.otty.bubbleMenu()
      }}
    >
      <span className="bubble__avatar">
        <Otter state={state} size={70} />
      </span>
      {badge && <span className="bubble__badge" />}
    </div>
  )
}
