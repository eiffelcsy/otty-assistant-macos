// What each tool does, in one place (D-26). Whatever decides what a tool may do reads this table, so there is no
// second list to forget to update. No electron here: it is read by tests, jobs and the chat alike.

export interface Safety {
  /** What it looks at. `private` is the user's own data; `public` is the open web. */
  reads: 'none' | 'public' | 'private'
  /** True when its result is someone else's words, which can never choose what Otty does. */
  outside: boolean
  /** True when something the model wrote can leave the Mac through it: a search, an address, a brief. */
  leaves: boolean
  /** What it changes. `undoable` means Otty can put it back; `lasting` means it can't. */
  changes: 'nothing' | 'undoable' | 'lasting'
}

const row = (reads: Safety['reads'], outside: boolean, leaves: boolean, changes: Safety['changes']): Safety => ({ reads, outside, leaves, changes })

export const SAFETY = {
  search_web: row('public', true, true, 'nothing'),
  read_page: row('public', true, true, 'nothing'),
  // The page opens in their browser, and the address itself can carry words out.
  open_url: row('none', false, true, 'undoable'),
  // Whatever was on the clipboard before is gone.
  copy_to_clipboard: row('none', false, false, 'lasting'),
  create_reminder: row('none', false, false, 'lasting'),
  calculate: row('none', false, false, 'nothing'),
  // Saved, shown with an Undo.
  remember: row('none', false, false, 'undoable'),
  forget: row('none', false, false, 'undoable'),
  // A card. What its buttons do is checked when they are pressed (`act/`).
  show_steps: row('none', false, false, 'nothing'),
  // The brief goes out with the job, and the user can cancel it.
  start_job: row('none', false, true, 'undoable'),
  // The same, later: the brief goes out when it runs, and Cancel in Activity takes it back until then.
  schedule_job: row('none', false, true, 'undoable')
} as const satisfies Record<string, Safety>

export type ToolName = keyof typeof SAFETY

const names = Object.keys(SAFETY) as ToolName[]
const pick = (test: (s: Safety) => boolean): ReadonlySet<string> => new Set(names.filter((n) => test(SAFETY[n])))

/** Tools whose results are someone else's words. */
export const OUTSIDE_TOOLS = pick((s) => s.outside)

/** What a background job may use: it reads only the public web and changes nothing. */
export const JOB_TOOLS = pick((s) => s.reads === 'public' && s.changes === 'nothing')

/**
 * The Rule of Two: work that holds private data, reads outside words and has a way out all at once can be talked
 * into sending the first through the third. It may have any two. Throws on a mix that has all three, or a tool with no label.
 * `holdsPrivate` is for work that carries the user's data in its context, which a chat turn does and a job doesn't.
 */
export function ruleOfTwo(allowed: Iterable<string>, holdsPrivate = false): void {
  let priv = holdsPrivate
  let outside = false
  let leaves = false
  for (const name of allowed) {
    const s = (SAFETY as Record<string, Safety>)[name]
    if (!s) throw new Error(`The tool ${name} has no safety label.`)
    priv ||= s.reads === 'private'
    outside ||= s.outside
    leaves ||= s.leaves
  }
  if (priv && outside && leaves) throw new Error('This mix of tools holds private data, reads outside words and can send things out. It can have two of those, not all three.')
}

/** Work that can change things must never repeat a change. A call is claimed once, by who asked and which call it was. */
export function claimOnce(claimed: Set<string>, runId: string, callId: string): boolean {
  const key = `${runId}:${callId}`
  if (claimed.has(key)) return false
  claimed.add(key)
  return true
}

/** Tools that change something, and so need `claimOnce` before they may run in a job that can be resumed. */
export const needsOnce = (name: string): boolean => (SAFETY as Record<string, Safety>)[name]?.changes !== 'nothing'
