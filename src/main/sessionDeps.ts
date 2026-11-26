import { actions } from './ledger'
import { keepHidden } from './hiddenLines'
import { macHands } from './macHands'
import { activeProfile, activeProvider } from './providers'
import { memoryStore } from './memory'
import { getStored } from './settings'
import { chatStore, pruneOldChats } from './store'
import { eventStore } from './calendar/hub'
import type { SessionDeps } from './llm'

// D-45: what a chat session reaches outside itself, wired to the app's real settings, stores and model service.
// `ChatSession` only ever goes through these, so a test or another kind of run can hand it its own.
export const liveDeps: SessionDeps = {
  settings: getStored,
  chats: chatStore,
  pruneChats: pruneOldChats,
  memory: memoryStore,
  profile: activeProfile,
  provider: activeProvider,
  ledger: actions,
  keepHidden,
  mac: macHands,
  eventStore
}
