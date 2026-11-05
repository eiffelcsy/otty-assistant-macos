import { getApiKey, getStored } from '../settings'
import { FriendlyError } from './errors'
import { openAiProvider } from './openai'
import type { Provider } from './types'

export { FriendlyError, NoVisionError } from './errors'
export type { ChatRequest, Completion, ContentPart, Message, Provider, ProviderEvent, ToolCall } from './types'

const provider = openAiProvider(() => {
  const s = getStored()
  const key = getApiKey()
  if (!key) throw new FriendlyError('Otty needs a DeepSeek key first — open Settings (the gear button) to add one.')
  return { baseUrl: s.baseUrl, model: s.model, thinking: s.thinking, key }
})

/** The service the user has chosen. */
export function activeProvider(): Provider {
  return provider
}
