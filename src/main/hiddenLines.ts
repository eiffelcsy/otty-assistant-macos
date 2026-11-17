// Show what was hidden (D-40): the lines where Otty hid something that looked like a key, with each value cut to a
// hint. Kept in memory only, by message or file id, never in otty.db or anything sent: after a restart they're gone,
// and the sheet says so.

const MAX = 200
const kept = new Map<string, string[]>()

export function keepHidden(id: string, lines: string[] | undefined): void {
  if (!lines?.length) return
  kept.set(id, lines)
  while (kept.size > MAX) kept.delete(kept.keys().next().value!)
}

/** The lines for a message or file, or null when Otty no longer has them. */
export const hiddenLines = (id: string): string[] | null => kept.get(id) ?? null

export function forgetHidden(): void {
  kept.clear()
}
