import { getApiKey, getStored } from '../settings'
import { anthropicProvider } from './anthropic'
import { FriendlyError } from './errors'
import { openAiProvider } from './openai'
import { profileFor, type Profile } from './profiles'
import { count } from '../usage'
import type { Provider, Usage } from './types'

export { ConnectionError, FriendlyError, NoVisionError } from './errors'
export type { Profile } from './profiles'
export type { ChatRequest, Completion, ContentPart, Message, Provider, ProviderEvent, ProviderReplay, ToolCall, Usage } from './types'

function config() {
  const s = getStored()
  const profile = profileFor(s.baseUrl, s.apiFormat)
  const key = getApiKey() ?? ''
  if (profile.needsKey && !key) throw new FriendlyError(`Otty needs ${profile.keyLabel} first — open Settings (the gear button) to add one.`)
  // The saved key belongs to a service online, so it's never handed to something running on this Mac.
  return { baseUrl: s.baseUrl, model: s.model, thinking: s.thinking, key: profile.id === 'local' ? '' : key, profile }
}

/** Every request is counted for the usage meter, whoever made it: answers, jobs, titles and explain cards. */
function tally(usage: Usage | undefined): void {
  count('requests')
  if (!usage) return
  count('input', usage.input)
  count('output', usage.output)
  if (usage.cached) count('cached', usage.cached)
}

function metered(p: Provider): Provider {
  return {
    async *stream(req, signal) {
      for await (const event of p.stream(req, signal)) {
        if (event.type === 'done') tally(event.usage)
        yield event
      }
    },
    async complete(req) {
      const out = await p.complete(req)
      tally(out.usage)
      return out
    }
  }
}

const openAi = metered(openAiProvider(config))
const anthropic = metered(anthropicProvider(config))

export function activeProfile(): Profile {
  const s = getStored()
  return profileFor(s.baseUrl, s.apiFormat)
}

/** The service the user has chosen. */
export function activeProvider(): Provider {
  return activeProfile().format === 'anthropic' ? anthropic : openAi
}
