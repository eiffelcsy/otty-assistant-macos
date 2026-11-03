import { app } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { getStored } from '../settings'
import { closeDatabase, openDatabase } from './db'
import { importJsonFile } from './importJson'
import { retentionCutoff } from './retention'
import { SqliteChatStore } from './sqliteStore'
import type { ChatStore } from './types'

export type { ChatStore, Thread, WriteFrom } from './types'

let db: DatabaseSync | null = null
let store: SqliteChatStore | null = null

/**
 * Opens `otty.db` and imports any `chats.json` before returning, all synchronously, so the first read already
 * sees every chat. Main calls it at startup, so the panel never waits for it.
 */
function open(): SqliteChatStore {
  if (store) return store
  const dir = app.getPath('userData')
  try {
    db = openDatabase(join(dir, 'otty.db'))
  } catch (err) {
    // A damaged file, or one from a newer Otty: keep working, with chats kept for this session only.
    console.error('Could not open otty.db; chats will not be saved this session', err)
    db = openDatabase(':memory:')
  }
  store = new SqliteChatStore(db)
  try {
    importJsonFile(store, join(dir, 'chats.json'))
  } catch (err) {
    console.error('Could not import chats.json; will try again next launch', err)
  }
  return store
}

/** The chat store. */
export function chatStore(): ChatStore {
  return open()
}

/** The local database, shared by saved chats and (later) memories and intent feedback. */
export function database(): DatabaseSync {
  open()
  return db!
}

/** Forgets chats older than the "Keep chats" setting. Cheap when there's nothing to forget (an indexed range). */
export async function pruneOldChats(): Promise<number> {
  const cutoff = retentionCutoff(getStored().keepChats)
  return cutoff === null ? 0 : open().prune(cutoff)
}

export function closeStore(): void {
  if (db) closeDatabase(db)
  db = null
  store = null
}
