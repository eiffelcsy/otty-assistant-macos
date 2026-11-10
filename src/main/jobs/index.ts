import { activeProfile, activeProvider } from '../providers'
import { getStored } from '../settings'
import { chatStore, database } from '../store'
import { toolDefs } from '../tools'
import { JobRunner } from './runner'
import { LIMITS } from './limits'
import { compareWithQuestions, type UsageSummary } from '../usage'
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
    held: () => getStored().workPaused,
    saveThread: async (thread) => {
      if (getStored().rememberChats) await chatStore().write(thread)
    },
    onChange
  })
}

/** The job card's cost line: where a job stops, and what one has usually cost compared with a question. */
export async function jobCost(runner: JobRunner, summary: () => UsageSummary | null): Promise<string> {
  const limits = `It stops after ${LIMITS.lookups} searches or pages, or ${Math.round(LIMITS.workMs / 60_000)} minutes, whichever comes first.`
  const usage = summary()
  const ratio = usage ? compareWithQuestions(await runner.recentTokens(), usage) : null
  return ratio ? `${limits} Looks like this have used about as much as ${ratio} of your questions.` : limits
}
