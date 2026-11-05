import type { ChatMessage } from '../../shared/types'
import type { Message } from '../providers'
import type { Thread } from './types'

// Pictures are never written to disk: snips, attached pictures and their thumbnails are emptied before saving.

const SNIP_GONE = '(The user shared a picture here: a screen snip or an image file. It was not kept, so it can no longer be seen.)'

/** A message as saved: snips emptied, file thumbnails dropped. */
export function stripMessage(m: ChatMessage): ChatMessage {
  if (m.role !== 'user') return m
  const files = m.files?.map(({ thumb: _thumb, ...f }) => f)
  const captures = m.captures.map((c) => (c.context.kind === 'image' ? { ...c, context: { ...c.context, dataUrl: '' } } : c))
  return { ...m, captures, ...(files ? { files } : {}) }
}

/** A model-history entry as saved: each picture replaced by a note saying it was there. */
export function stripHistory(m: Message): Message {
  if (m.role !== 'user' || !Array.isArray(m.content)) return m
  return { ...m, content: m.content.map((p) => (p.type === 'image_url' ? { type: 'text' as const, text: SNIP_GONE } : p)) }
}

/** A copy of the thread with every picture removed. */
export function withoutImages(t: Thread): Thread {
  return { ...t, messages: t.messages.map(stripMessage), history: t.history.map(stripHistory) }
}
