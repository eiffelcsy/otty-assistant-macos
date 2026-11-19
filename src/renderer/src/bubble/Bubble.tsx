import { useEffect, useState } from 'react'
import type { BubbleMood, BubbleState } from '../../../shared/types'
import { Icon } from '../components/Icon'
import { Otter } from '../components/Otter'

const TITLES: Record<NonNullable<BubbleMood> | 'badge' | 'idle', string> = {
  idle: 'Click to ask Otty · Right-click for more',
  badge: 'Otty has an answer for you · Click to see it',
  working: 'Otty is looking into something for you · Click to ask Otty',
  waiting: 'Otty needs your OK on something · Click, then open the Logbook',
  paused: 'Otty is paused · Right-click to let it carry on'
}

export function Bubble() {
  const [state, setState] = useState<BubbleState>('idle')
  const [badge, setBadge] = useState(false)
  const [mood, setMood] = useState<BubbleMood>(null)
  /** Files are being dragged over the otter (D-37). */
  const [feeding, setFeeding] = useState(false)

  useEffect(() => window.otty.onBubbleState(setState), [])
  useEffect(() => window.otty.onBubbleBadge(setBadge), [])
  useEffect(() => window.otty.onBubbleMood(setMood), [])

  return (
    <div
      className={`bubble bubble--${state}${feeding ? ' bubble--feeding' : ''}`}
      title={TITLES[mood ?? (badge ? 'badge' : 'idle')]}
      // D-37: feed Otty files. Only files: dragged text has no app to say where it came from.
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setFeeding(true)
      }}
      onDragLeave={() => setFeeding(false)}
      onDrop={(e) => {
        e.preventDefault()
        setFeeding(false)
        const files = [...e.dataTransfer.files]
        if (files.length) void window.otty.dropFiles(files).then((pending) => (pending.length ? window.otty.feedOtty(pending.map((f) => f.id)) : undefined))
      }}
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
      {mood === 'working' && <span className="bubble__working" />}
      {mood === 'waiting' && <span className="bubble__working bubble__working--waiting" />}
      {mood === 'paused' && (
        <span className="bubble__paused">
          <Icon name="pause" solid />
        </span>
      )}
      {badge && <span className="bubble__badge" />}
    </div>
  )
}
