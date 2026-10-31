import { useEffect, useState } from 'react'
import type { BubbleState } from '../../../shared/types'
import { Otter } from '../components/Otter'

export function Bubble() {
  const [state, setState] = useState<BubbleState>('idle')

  useEffect(() => window.otty.onBubbleState(setState), [])

  return (
    <div
      className={`bubble bubble--${state}`}
      title="Click to ask Otty · Right-click for more"
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
      <Otter state={state} size={62} />
    </div>
  )
}
