import type { AppInfo, Capture, ScreenContext } from './types'

// The capture tray's rules, shared by the panel, the quick view and main.

/** Pictures cost tokens and some models cap images per message. */
export const MAX_CAPTURES = 4

export type AddResult = { ok: true; captures: Capture[] } | { ok: false; reason: 'full' | 'duplicate' }

/** Adds a capture to the end of the tray. The same text twice is ignored; a full tray refuses. */
export function addCapture(captures: Capture[], context: ScreenContext, app: AppInfo | null, id: string): AddResult {
  if (context.kind === 'text' && captures.some((c) => c.context.kind === 'text' && c.context.text === context.text)) {
    return { ok: false, reason: 'duplicate' }
  }
  if (captures.length >= MAX_CAPTURES) return { ok: false, reason: 'full' }
  return { ok: true, captures: [...captures, { id, context, app }] }
}

/** The text of every highlighted capture, for language detection and titles. */
export function capturedText(captures: Capture[]): string {
  return captures.flatMap((c) => (c.context.kind === 'text' ? [c.context.text] : [])).join('\n')
}
