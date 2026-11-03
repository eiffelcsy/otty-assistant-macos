import { existsSync, readFileSync, rmSync } from 'fs'
import type { SqliteChatStore } from './sqliteStore'
import type { Thread } from './types'
import { upgradeThread } from './upgrade'

/**
 * Moves chats saved by Otty 0.3 and earlier (`chats.json`) into the database, in one transaction, then deletes
 * the file so its text doesn't outlive "Forget all chats" or the retention setting. If anything goes wrong the
 * file is left alone and the import runs again next launch. Synchronous, so nothing can read before it's done.
 */
export function importJsonFile(store: SqliteChatStore, file: string): number {
  if (!existsSync(file)) return 0
  let threads: Thread[]
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    threads = Array.isArray(parsed) ? parsed.map(upgradeThread) : []
  } catch (err) {
    console.error('Could not read chats.json; leaving it for next time', err)
    return 0
  }
  const n = store.importThreads(threads)
  rmSync(file, { force: true })
  return n
}
