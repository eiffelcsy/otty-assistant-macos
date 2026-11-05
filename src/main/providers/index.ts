import { getApiKey, getStored } from '../settings'
import { FriendlyError } from './errors'
import { openAiProvider } from './openai'
import { profileFor, type Profile } from './profiles'
import type { Provider } from './types'

export { FriendlyError, NoVisionError } from './errors'
export type { Profile } from './profiles'
export type { ChatRequest, Completion, ContentPart, Message, Provider, ProviderEvent, ToolCall } from './types'

const provider = openAiProvider(() => {
  const s = getStored()
  const profile = profileFor(s.baseUrl)
  const key = getApiKey() ?? ''
  if (profile.needsKey && !key) throw new FriendlyError(`Otty needs ${profile.keyLabel} first — open Settings (the gear button) to add one.`)
  // The saved key belongs to a service online, so it's never handed to something running on this Mac.
  return { baseUrl: s.baseUrl, model: s.model, thinking: s.thinking, key: profile.id === 'local' ? '' : key, profile }
})

export function activeProfile(): Profile {
  return profileFor(getStored().baseUrl)
}

/** The service the user has chosen. */
export function activeProvider(): Provider {
  return provider
}
