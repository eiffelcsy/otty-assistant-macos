import type { Step, StepAction, StepApp, StepCard } from '../../shared/types'

// What the model sent, as a card. Nothing it sends is trusted to have the right shape.

const MAX_STEPS = 12
const MAX_TEXT = 300
const MAX_PASTE = 4_000

function action(raw: unknown): StepAction | undefined {
  const a = (raw ?? {}) as Record<string, unknown>
  const text = typeof a.text === 'string' ? a.text.slice(0, MAX_PASTE) : ''
  switch (a.kind) {
    case 'paste':
      return text ? { kind: 'paste', text, mode: a.mode === 'insert' ? 'insert' : 'replace' } : undefined
    case 'copy':
      return text ? { kind: 'copy', text } : undefined
    case 'open':
      return typeof a.target === 'string' && a.target ? { kind: 'open', target: a.target.slice(0, 500) } : undefined
    case 'menu': {
      const path = Array.isArray(a.path) ? a.path.map(String).filter(Boolean).slice(0, 6) : []
      return path.length >= 2 ? { kind: 'menu', path } : undefined
    }
    case 'keys':
      return typeof a.combo === 'string' && a.combo ? { kind: 'keys', combo: a.combo.slice(0, 40) } : undefined
    default:
      return undefined
  }
}

/** Null when there's nothing to show. An action Otty can't read just leaves a step to do by hand. */
export function stepCard(args: Record<string, unknown>, app: StepApp | null): StepCard | null {
  const steps: Step[] = (Array.isArray(args.steps) ? args.steps : []).slice(0, MAX_STEPS).flatMap((raw): Step[] => {
    const s = (raw ?? {}) as Record<string, unknown>
    const text = String(s.text ?? '').trim().slice(0, MAX_TEXT)
    const act = action(s.action)
    return text ? [{ text, ...(act ? { action: act } : {}) }] : []
  })
  if (!steps.length) return null
  return { title: String(args.title ?? '').trim().slice(0, 80) || 'Steps', steps, ...(app ? { app } : {}) }
}
