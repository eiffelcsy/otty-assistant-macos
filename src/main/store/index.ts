import { app } from 'electron'
import { existsSync, renameSync } from 'fs'
import type { DatabaseSync } from 'node:sqlite'
import { join } from 'path'
import { openDatabase } from './db'
import { JsonChatStore } from './jsonStore'
import { SqliteChatStore } from './sqliteStore'
import type { ChatStore } from './types'

export type { ChatStore, Thread } from './types'

let store: ChatStore | null = null
let db: DatabaseSync | null = null

/**
 * SQLite (D-3) is scaffolded but opt-in until it has been smoke-tested on a Mac: start Otty with
 * `OTTY_STORE=sqlite`. Flip the default here once it has.
 */
const useSqlite = () => process.env.OTTY_STORE === 'sqlite'

/** The local database, shared by saved chats and (later) memories and intent feedback. Opened on first use. */
export function database(): DatabaseSync {
  return (db ??= openDatabase(join(app.getPath('userData'), 'otty.db')))
}

/** The chat store in use. Created on first use, once `userData` is known. */
export function chatStore(): ChatStore {
  if (store) return store
  const jsonFile = join(app.getPath('userData'), 'chats.json')
  if (!useSqlite()) return (store = new JsonChatStore(jsonFile))
  const sqlite = new SqliteChatStore(database())
  store = sqlite
  if (existsSync(jsonFile)) void importJson(sqlite, jsonFile)
  return sqlite
}

/** Moves chats saved by the JSON store into SQLite once, then renames the file so it isn't imported again. */
async function importJson(sqlite: SqliteChatStore, file: string): Promise<void> {
  try {
    const json = new JsonChatStore(file)
    const summaries = await json.list()
    const threads = (await Promise.all(summaries.map((s) => json.get(s.id)))).flatMap((t) => (t ? [t] : []))
    await sqlite.importThreads(threads)
    renameSync(file, `${file}.imported`)
  } catch (err) {
    console.error('Could not import saved chats into otty.db', err)
  }
}
