import type { AppInfo, Capture, ChatMessage, ScreenContext } from '../../shared/types'
import type { Thread } from './types'

// Saved chats outlive the code that wrote them. Every backend reads threads through `upgradeThread`,
// so callers only ever see today's shapes.

/** A user message as saved before the capture tray (0.3.x): one optional `context`, its app on the message. */
type LegacyUser = Omit<Extract<ChatMessage, { role: 'user' }>, 'captures'> & {
  captures?: Capture[]
  context?: ScreenContext | null
}

function upgradeMessage(m: ChatMessage | LegacyUser): ChatMessage {
  if (m.role !== 'user' || Array.isArray(m.captures)) return m as ChatMessage
  const { context, ...rest } = m as LegacyUser
  if (!context) return { ...rest, captures: [] }
  const app: AppInfo | null = rest.app ?? null
  return { ...rest, app: null, captures: [{ id: `${m.id}-c0`, context, app }] }
}

export function upgradeThread(t: Thread): Thread {
  return { ...t, messages: t.messages.map(upgradeMessage) }
}
