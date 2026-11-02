import { app } from 'electron'
import { join } from 'path'
import { JsonChatStore } from './jsonStore'
import type { ChatStore } from './types'

export type { ChatStore, Thread } from './types'

let store: ChatStore | null = null

/** The chat store in use. Created on first use, once `userData` is known. */
export function chatStore(): ChatStore {
  return (store ??= new JsonChatStore(join(app.getPath('userData'), 'chats.json')))
}
