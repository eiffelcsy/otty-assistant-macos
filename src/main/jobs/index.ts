import { activeProfile, activeProvider } from '../providers'
import { getStored } from '../settings'
import { chatStore, database } from '../store'
import { toolDefs } from '../tools'
import { JobRunner } from './runner'
import { MemoryJobStore, SqliteJobStore } from './stores'
import type { JobStore } from './types'

export { JobRunner } from './runner'

let saved: SqliteJobStore | null = null
const inMemory = new MemoryJobStore()

/** With "Remember my chats" off, nothing about a job is written to disk. */
function store(): JobStore {
  return getStored().rememberChats ? (saved ??= new SqliteJobStore(database())) : inMemory
}

export function createRunner(onChange: (news: boolean) => void): JobRunner {
  return new JobRunner({
    store,
    provider: activeProvider,
    tools: toolDefs,
    webOff: () => activeProfile().web === 'off',
    home: () => getStored().homeLanguage,
    saveThread: async (thread) => {
      if (getStored().rememberChats) await chatStore().write(thread)
    },
    onChange
  })
}
