import type { BubbleState } from '../../../shared/types'

/** Otty's face. Pure SVG + CSS animations (see .otter-* in styles.css). */
export function Otter({ state = 'idle', size = 64 }: { state?: BubbleState; size?: number }) {
  const happy = state === 'happy'
  return (
    <svg className={`otter otter--${state}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      {/* thinking bubbles */}
      <g className="otter-bubbles" fill="var(--water-light)">
        <circle cx="98" cy="20" r="4" />
        <circle cx="108" cy="8" r="2.6" />
        <circle cx="90" cy="9" r="2" />
      </g>

      <g className="otter-head">
        {/* ears: small and low on the sides, like a real otter */}
        <ellipse cx="17" cy="50" rx="8" ry="7" fill="var(--otter-fur)" />
        <ellipse cx="17" cy="50" rx="4" ry="3.5" fill="var(--otter-ear)" />
        <ellipse cx="103" cy="50" rx="8" ry="7" fill="var(--otter-fur)" />
        <ellipse cx="103" cy="50" rx="4" ry="3.5" fill="var(--otter-ear)" />

        {/* head (wide + flat) + face patch */}
        <ellipse cx="60" cy="66" rx="46" ry="37" fill="var(--otter-fur)" />
        <ellipse cx="60" cy="74" rx="33" ry="25" fill="var(--otter-cream)" />
        <path d="M27 66 Q44 50 60 58 Q76 50 93 66 Q90 44 60 42 Q30 44 27 66Z" fill="var(--otter-fur)" />

        {/* eyes */}
        {happy ? (
          <g stroke="var(--otter-ink)" strokeWidth="3.4" strokeLinecap="round" fill="none">
            <path d="M38 62 Q44 55 50 62" />
            <path d="M70 62 Q76 55 82 62" />
          </g>
        ) : (
          <g className="otter-eyes">
            <circle cx="44" cy="61" r="5.6" fill="var(--otter-ink)" />
            <circle cx="76" cy="61" r="5.6" fill="var(--otter-ink)" />
            <circle cx="45.9" cy="59" r="1.9" fill="#fff" />
            <circle cx="77.9" cy="59" r="1.9" fill="#fff" />
          </g>
        )}

        {/* blush */}
        <ellipse cx="33" cy="75" rx="6.5" ry="3.6" fill="#F59C9C" opacity="0.55" />
        <ellipse cx="87" cy="75" rx="6.5" ry="3.6" fill="#F59C9C" opacity="0.55" />

        {/* muzzle */}
        <ellipse cx="52" cy="79" rx="10.5" ry="8" fill="#FFF9F0" />
        <ellipse cx="68" cy="79" rx="10.5" ry="8" fill="#FFF9F0" />

        {/* whiskers */}
        <g stroke="var(--otter-whisker)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M43 78 L30 76" />
          <path d="M43 82 L31 84" />
          <path d="M77 78 L90 76" />
          <path d="M77 82 L89 84" />
        </g>

        {/* nose + mouth */}
        <path d="M54 70 Q60 67 66 70 Q66 75 60 76.5 Q54 75 54 70Z" fill="var(--otter-ink)" />
        {happy ? (
          <path d="M53 80 Q60 90 67 80 Q60 83 53 80Z" fill="#E86F6F" stroke="var(--otter-ink)" strokeWidth="1.6" strokeLinejoin="round" />
        ) : (
          <path
            d="M60 76.5 V79 M54.5 80 Q57.5 83.5 60 79.5 Q62.5 83.5 65.5 80"
            stroke="var(--otter-ink)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  )
}
