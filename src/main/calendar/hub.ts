import { database } from '../store'
import { MemoryEventStore, SqliteEventStore, type EventStore } from './store'

// D-73: the one event store the app uses. Always in `otty.db` when it opens, whatever "Remember my chats" says
// (a calendar isn't chat history), and kept in memory only if the database fails.

let saved: SqliteEventStore | null = null
const unsaved = new MemoryEventStore()

export function eventStore(): EventStore {
  try {
    return (saved ??= new SqliteEventStore(database()))
  } catch (err) {
    console.error('Could not open the calendar', err)
    return unsaved
  }
}
