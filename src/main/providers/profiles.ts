import { isDeepSeek } from '../web'

/** What Otty needs to know about a service. Features read this; they never check which service it is. */
export interface Profile {
  id: 'deepseek' | 'openai' | 'local' | 'custom'
  label: string
  /** For "Otty needs … first". */
  keyLabel: string
  /** Without a key saved, Otty asks for one before calling. A local model never gets a key at all. */
  needsKey: boolean
  /** Where to add credit, for the "out of credit" message. */
  topUp?: string
  /** Size of the model's window, which sets how much of a file is sent. */
  contextTokens: number
  /** How to ask for more or less thinking. */
  reasoning: 'thinking-field' | 'none'
  tokenLimit: 'max_tokens' | 'max_completion_tokens'
  /** Where search and page reading go. `off` means nothing leaves the Mac. */
  web: 'deepseek' | 'lookup' | 'off'
}

const DEEPSEEK: Profile = {
  id: 'deepseek',
  label: 'DeepSeek',
  keyLabel: 'a DeepSeek key',
  needsKey: true,
  topUp: 'platform.deepseek.com',
  contextTokens: 128_000,
  reasoning: 'thinking-field',
  tokenLimit: 'max_tokens',
  web: 'deepseek'
}

const OPENAI: Profile = {
  id: 'openai',
  label: 'OpenAI',
  keyLabel: 'an OpenAI key',
  needsKey: true,
  topUp: 'platform.openai.com',
  contextTokens: 128_000,
  reasoning: 'none',
  tokenLimit: 'max_completion_tokens',
  web: 'lookup'
}

/** Ollama and LM Studio. Their windows are small by default, so stay well inside them. */
const LOCAL: Profile = {
  id: 'local',
  label: 'your local model',
  keyLabel: 'a key',
  needsKey: false,
  contextTokens: 8_192,
  reasoning: 'none',
  tokenLimit: 'max_tokens',
  web: 'off'
}

/** Any other OpenAI-style address. It may or may not want a key, so the service decides. */
const CUSTOM: Profile = {
  id: 'custom',
  label: 'your AI service',
  keyLabel: 'a key',
  needsKey: false,
  contextTokens: 32_000,
  reasoning: 'none',
  tokenLimit: 'max_tokens',
  web: 'lookup'
}

const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost')

export function profileFor(baseUrl: string): Profile {
  if (isDeepSeek(baseUrl)) return DEEPSEEK
  try {
    const { hostname } = new URL(baseUrl)
    if (hostname === 'api.openai.com') return OPENAI
    if (isLocal(hostname)) return LOCAL
  } catch {
    /* not an address yet */
  }
  return CUSTOM
}
