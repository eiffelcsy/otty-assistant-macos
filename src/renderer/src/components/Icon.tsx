import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import '@flaticon/flaticon-uicons/css/solid/rounded.css'
import { GLYPHS } from './glyphs'

/**
 * A Flaticon UIcon from the rounded set, `name` being the part after `fi-rr-` (e.g. "settings"), or one of Otty's own
 * glyphs by its name (`glyphs.tsx`, D-85). Own glyphs are outlines only, so `solid` fills them.
 */
export function Icon({ name, solid = false, className = '' }: { name: string; solid?: boolean; className?: string }) {
  const own = GLYPHS[name]
  if (own)
    return (
      <svg
        className={`icon icon--own${solid ? ' icon--solid' : ''} ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {own}
      </svg>
    )
  return <i className={`icon fi fi-${solid ? 'sr' : 'rr'}-${name} ${className}`} aria-hidden="true" />
}
