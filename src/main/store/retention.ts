import type { KeepChats } from '../../shared/types'

const DAY = 86_400_000

/** Chats last updated before this are forgotten. Null keeps everything. */
export function retentionCutoff(keep: KeepChats, now = Date.now()): number | null {
  if (keep === 'forever') return null
  return now - (keep === '30d' ? 30 : 365) * DAY
}
