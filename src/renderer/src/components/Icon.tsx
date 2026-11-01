import '@flaticon/flaticon-uicons/css/regular/rounded.css'
import '@flaticon/flaticon-uicons/css/solid/rounded.css'

/** A Flaticon UIcon from the rounded set. `name` is the part after `fi-rr-` (e.g. "settings"). */
export function Icon({ name, solid = false, className = '' }: { name: string; solid?: boolean; className?: string }) {
  return <i className={`icon fi fi-${solid ? 'sr' : 'rr'}-${name} ${className}`} aria-hidden="true" />
}
