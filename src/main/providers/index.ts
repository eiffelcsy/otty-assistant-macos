import { getApiKey, getStored, isDev } from '../settings'
import { anthropicProvider } from './anthropic'
import { FriendlyError } from './errors'
import { openAiProvider } from './openai'
import { profileFor, type Profile } from './profiles'
import { count } from '../usage'
import { hostOf, record, type SentTag } from '../sent'
import { serviceAt, serviceById } from '../../shared/services'
import type { Provider, Usage } from './types'

export { FriendlyError, NoVisionError } from './errors'
export type { Profile } from './profiles'
export type { SentTag } from '../sent'
export type { ChatRequest, ContentPart, Message, Provider, ProviderEvent } from './types'

function config() {
  const s = getStored()
  const profile = profileFor(s.baseUrl, s.apiFormat)
  const key = getApiKey() ?? ''
  if (profile.needsKey && !key) throw new FriendlyError(`Otty needs ${profile.keyLabel} first — open Settings (the gear button) to add one.`)
  // The saved key belongs to a service online, so it's never handed to something running on this Mac.
  return { baseUrl: s.baseUrl, model: s.model, thinking: s.thinking, key: profile.id === 'local' ? '' : key, profile, measure: isDev() }
}

/** Every request is counted for the usage meter, whoever made it: answers, jobs, titles and explain cards. */
function tally(usage: Usage | undefined): void {
  count('requests')
  if (!usage) return
  count('input', usage.input)
  count('output', usage.output)
  if (usage.cached) count('cached', usage.cached)
}

/** Noted as it's sent, whether or not it works: it has left either way. Nothing is noted when there's no key to send. */
function noteSent(tag: SentTag): void {
  const s = getStored()
  const profile = profileFor(s.baseUrl, s.apiFormat)
  if (profile.needsKey && !getApiKey()) return
  const service = serviceById(serviceAt(s.baseUrl))
  const host = hostOf(s.baseUrl)
  const local = profile.id === 'local'
  const name = local ? 'the model on this Mac' : service.id === 'custom' ? host : service.label
  record({ kind: tag.kind, service: name, host, local, what: tag.what ?? '', ...(tag.chatId ? { chatId: tag.chatId } : {}), ...(tag.group ? { group: tag.group } : {}) })
}

/** Every request is counted for the usage meter and noted in what left the Mac, whoever made it. */
function metered(p: Provider, tag: SentTag): Provider {
  return {
    async *stream(req, signal) {
      noteSent(tag)
      for await (const event of p.stream(req, signal)) {
        if (event.type === 'done') tally(event.usage)
        yield event
      }
    },
    async complete(req) {
      noteSent(tag)
      const out = await p.complete(req)
      tally(out.usage)
      return out
    }
  }
}

const openAi = openAiProvider(config)
const anthropic = anthropicProvider(config)

export function activeProfile(): Profile {
  const s = getStored()
  return profileFor(s.baseUrl, s.apiFormat)
}

/** The service the user has chosen. `sent` says why, for "What left your Mac": no request goes without one. */
export function activeProvider(sent: SentTag): Provider {
  return metered(activeProfile().format === 'anthropic' ? anthropic : openAi, sent)
}
