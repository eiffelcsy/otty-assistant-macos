import { getApiKey, getStored } from '../settings'
import { anthropicProvider } from './anthropic'
import { FriendlyError } from './errors'
import { openAiProvider } from './openai'
import { profileFor, type Profile } from './profiles'
import type { Provider } from './types'

export { ConnectionError, FriendlyError, NoVisionError } from './errors'
export type { Profile } from './profiles'
export type { ChatRequest, Completion, ContentPart, Message, Provider, ProviderEvent, ProviderReplay, ToolCall } from './types'

function config() {
  const s = getStored()
  const profile = profileFor(s.baseUrl, s.apiFormat)
  const key = getApiKey() ?? ''
  if (profile.needsKey && !key) throw new FriendlyError(`Otty needs ${profile.keyLabel} first — open Settings (the gear button) to add one.`)
  // The saved key belongs to a service online, so it's never handed to something running on this Mac.
  return { baseUrl: s.baseUrl, model: s.model, thinking: s.thinking, key: profile.id === 'local' ? '' : key, profile }
}

const openAi = openAiProvider(config)
const anthropic = anthropicProvider(config)

export function activeProfile(): Profile {
  const s = getStored()
  return profileFor(s.baseUrl, s.apiFormat)
}

/** The service the user has chosen. */
export function activeProvider(): Provider {
  return activeProfile().format === 'anthropic' ? anthropic : openAi
}
