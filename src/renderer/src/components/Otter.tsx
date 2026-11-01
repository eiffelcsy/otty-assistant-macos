import { useId } from 'react'
import type { BubbleState } from '../../../shared/types'

/** Otty: a chibi otter hugging a little fish. Pure SVG + CSS animations (see .otter-* in styles.css). */
/** Bell-shaped cartoon-otter head: rounded dome, puffy cheeks, broad chin. */
const HEAD = 'M60 25 C84 25 97 37 99 52 C101 62 107 71 104 83 C100 95 81 100 60 100 C39 100 20 95 16 83 C13 71 19 62 21 52 C23 37 36 25 60 25Z'

export function Otter({ state = 'idle', size = 64 }: { state?: BubbleState; size?: number }) {
  const happy = state === 'happy'
  const clip = useId()
  const line = { stroke: 'var(--otter-line)', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

  return (
    <svg className={`otter otter--${state}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={HEAD} />
        </clipPath>
      </defs>

      {/* thinking bubbles */}
      <g className="otter-bubbles" fill="var(--otter-bubble)">
        <circle cx="104" cy="22" r="4.2" />
        <circle cx="112" cy="10" r="2.8" />
        <circle cx="98" cy="8" r="2" />
      </g>

      <g className="otter-body">
        <g className="otter-head">
          {/* small round ears, low on the sides like a real otter */}
          <circle cx="25" cy="38" r="9" fill="var(--otter-fur)" {...line} />
          <circle cx="25.5" cy="39" r="4.5" fill="var(--otter-ear)" />
          <circle cx="95" cy="38" r="9" fill="var(--otter-fur)" {...line} />
          <circle cx="94.5" cy="39" r="4.5" fill="var(--otter-ear)" />

          {/* big round head with a scalloped cream face */}
          <path d={HEAD} fill="var(--otter-fur)" />
          <g clipPath={`url(#${clip})`}>
            <path d="M10 75 Q28 62 43 70 Q60 60 77 70 Q92 62 110 75 L110 104 L10 104Z" fill="var(--otter-cream)" />
            <ellipse cx="42" cy="36" rx="15" ry="6" fill="#fff" opacity="0.16" transform="rotate(-14 42 36)" />
            {/* puffy whisker pads */}
            <ellipse cx="52" cy="76" rx="9" ry="6.5" fill="var(--otter-pad)" />
            <ellipse cx="68" cy="76" rx="9" ry="6.5" fill="var(--otter-pad)" />
            <g fill="var(--otter-line)" opacity="0.35">
              <circle cx="48" cy="75" r="0.9" />
              <circle cx="51" cy="78" r="0.9" />
              <circle cx="47" cy="79" r="0.9" />
              <circle cx="72" cy="75" r="0.9" />
              <circle cx="69" cy="78" r="0.9" />
              <circle cx="73" cy="79" r="0.9" />
            </g>
          </g>
          <path d={HEAD} fill="none" {...line} />

          {/* sparkly eyes */}
          {happy ? (
            <g stroke="var(--otter-eye)" strokeWidth="3.6" strokeLinecap="round" fill="none">
              <path d="M35 62 Q42 53 49 62" />
              <path d="M71 62 Q78 53 85 62" />
            </g>
          ) : (
            <g className="otter-eyes">
              <circle cx="42" cy="59" r="8.5" fill="var(--otter-eye)" />
              <circle cx="78" cy="59" r="8.5" fill="var(--otter-eye)" />
              <circle cx="44.6" cy="55.8" r="3.2" fill="#fff" />
              <circle cx="80.6" cy="55.8" r="3.2" fill="#fff" />
              <circle cx="39.4" cy="62.4" r="1.5" fill="#fff" opacity="0.85" />
              <circle cx="75.4" cy="62.4" r="1.5" fill="#fff" opacity="0.85" />
            </g>
          )}

          {/* blush */}
          <ellipse cx="28" cy="73" rx="7.5" ry="4.2" fill="var(--otter-blush)" opacity="0.65" />
          <ellipse cx="92" cy="73" rx="7.5" ry="4.2" fill="var(--otter-blush)" opacity="0.65" />

          {/* whiskers */}
          <g stroke="var(--otter-line)" strokeWidth="1.3" strokeLinecap="round" opacity="0.45">
            <path d="M42 75 L24 71" />
            <path d="M42 79 L25 81" />
            <path d="M78 75 L96 71" />
            <path d="M78 79 L95 81" />
          </g>

          {/* button nose + mouth */}
          <path d="M53.5 67.5 Q60 64.5 66.5 67.5 Q66.5 72.5 60 74.5 Q53.5 72.5 53.5 67.5Z" fill="var(--otter-line)" />
          <ellipse cx="58" cy="67.4" rx="2.2" ry="1.1" fill="#fff" opacity="0.5" />
          {happy ? (
            <path
              d="M51.5 77.5 Q60 75.5 68.5 77.5 Q66.5 86 60 86.5 Q53.5 86 51.5 77.5Z"
              fill="var(--otter-tongue)"
              stroke="var(--otter-line)"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          ) : (
            <path d="M60 74.5 V77.5 M50.5 77 Q55.2 83 60 77.5 Q64.8 83 69.5 77" stroke="var(--otter-line)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          )}
        </g>

        {/* the fish Otty is hugging */}
        <g className="otter-fish">
          <path d="M73 104 L83 97.5 Q80.5 104 83 110.5Z" fill="var(--otter-fish)" {...line} strokeWidth={2.4} />
          <ellipse cx="58" cy="104" rx="17" ry="7" fill="var(--otter-fish)" {...line} strokeWidth={2.4} />
          <path d="M70 99.5 Q72.5 104 70 108.5" stroke="var(--otter-fish-stripe)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="46" cy="102.5" r="1.6" fill="var(--otter-line)" />
        </g>

        {/* tiny paws */}
        <g className="otter-paws" fill="var(--otter-fur)" {...line} strokeWidth={2.6}>
          <ellipse cx="56" cy="98.5" rx="6" ry="5.4" />
          <ellipse cx="68" cy="98.5" rx="6" ry="5.4" />
        </g>
      </g>
    </svg>
  )
}
