import { domainToUnicode } from 'node:url'
import type { ConfirmCard, Receipt } from '../shared/types'
import { describeWhen } from '../shared/when'

// Confirm cards and their receipts (D-60). Main splits what a tool will do into the card's parts, so the host shown is
// the host the tool then reaches, and decides what makes a card unusual. The model never chooses either.

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** One line of a path: the start and the end, which is where a lookalike would differ. */
function middle(s: string, max = 44): string {
  if (s.length <= max) return s
  const half = Math.floor((max - 1) / 2)
  return `${s.slice(0, half)}…${s.slice(s.length - half)}`
}

/** Read this page? or Open this link? `URL` turns another alphabet into `xn--`, and drops any user name before `@`. */
export function pageCard(kind: 'read' | 'open', url: string): ConfirmCard {
  const title = kind === 'read' ? 'Read this page?' : 'Open this link?'
  const yes = kind === 'read' ? 'Read it' : 'Open it'
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { kind, title, yes, host: cut(url, 80) }
  }
  const foreign = u.hostname.split('.').some((label) => label.startsWith('xn--'))
  const rest = u.pathname === '/' && !u.search ? '' : middle(u.pathname + u.search)
  return {
    kind,
    title,
    yes,
    host: u.host,
    ...(rest ? { rest } : {}),
    ...(foreign ? { readable: domainToUnicode(u.hostname), unusual: 'alphabet' as const } : u.protocol === 'http:' ? { unusual: 'http' as const } : {})
  }
}

/** Only shown when private data and outside words have met (D-41), so it's always unusual. */
export function searchCard(query: string, service: string): ConfirmCard {
  return { kind: 'search', title: 'Search the web for this?', yes: 'Search', query: cut(query, 500), service, unusual: 'private' }
}

export function reminderCard(item: string, when: Date | null): ConfirmCard {
  const at = when ? describeWhen(+when) : ''
  return { kind: 'reminder', title: 'Add this reminder?', yes: 'Add it', item: cut(item, 200), ...(at ? { when: at[0].toUpperCase() + at.slice(1) } : {}), list: 'In Reminders' }
}

export function jobCard(title: string, item: string, detail: string, later: boolean, overCap: boolean): ConfirmCard {
  return { kind: 'job', title, yes: later ? 'Schedule it' : 'Start it', item, detail, ...(overCap ? { unusual: 'cap' as const } : {}) }
}

const DONE: Record<ConfirmCard['kind'], string> = { read: 'Read', open: 'Opened', search: 'Searched for', reminder: 'Added', job: 'Started', use: 'Used' }

/** A tool of a connection of the user's own, or a built-in that sends words out (D-54). `reads`: a read, not a change. */
export function connectionCard(service: string, item: string, args: string, reads = false): ConfirmCard {
  return {
    kind: 'use',
    title: reads ? `Send this to ${service}?` : `Let ${service} do this?`,
    yes: reads ? 'Send' : 'Go ahead',
    service,
    item: cut(item, 200),
    query: cut(args, 300)
  }
}

/** The line a card leaves behind. `why` is set when the card ended without the user's Skip. */
export function receiptFor(card: ConfirmCard, allowed: boolean, why?: string): Receipt {
  const what = card.kind === 'use' ? `${card.service}: ${card.item}` : card.host ?? (card.query !== undefined ? `“${cut(card.query, 60)}”` : `“${card.item ?? ''}”`)
  const verb = !allowed ? 'Skipped' : card.kind === 'job' && card.yes === 'Schedule it' ? 'Scheduled' : DONE[card.kind]
  return { allowed, verb, what, ...(why && !allowed ? { why } : {}) }
}
