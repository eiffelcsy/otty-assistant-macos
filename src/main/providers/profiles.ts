import type { ApiFormat } from '../../shared/types'
import { isDeepSeek } from '../web'

/** What Otty needs to know about a service. Features read this; they never check which service it is. */
export interface Profile {
  id: 'deepseek' | 'claude' | 'openai' | 'local' | 'custom'
  /** The API format it speaks, unless the user chose another in Settings. */
  format: 'openai' | 'anthropic'
  label: string
  /** The model to start with. */
  model?: string
  /** For "Otty needs … first". */
  keyLabel: string
  /** Without a key saved, Otty asks for one before calling. A local model never gets a key at all. */
  needsKey: boolean
  /** Where to add credit, for the "out of credit" message. */
  topUp?: string
  /** Size of the model's window, which sets how much of a file is sent. */
  contextTokens: number
  /** How to ask for more or less thinking. */
  reasoning: 'thinking-field' | 'effort' | 'none'
  tokenLimit: 'max_tokens' | 'max_completion_tokens'
  /** Where search and page reading go. `off` means nothing leaves the Mac. */
  web: 'deepseek' | 'lookup' | 'off'
}

const DEEPSEEK: Profile = {
  id: 'deepseek',
  format: 'openai',
  label: 'DeepSeek',
  keyLabel: 'a DeepSeek key',
  needsKey: true,
  topUp: 'platform.deepseek.com',
  contextTokens: 128_000,
  reasoning: 'thinking-field',
  tokenLimit: 'max_tokens',
  web: 'deepseek'
}

/** Claude's window is far bigger, but a bigger file budget would cost more on every question. */
const CLAUDE: Profile = {
  id: 'claude',
  format: 'anthropic',
  label: 'Claude',
  model: 'claude-sonnet-5-5',
  keyLabel: 'a Claude key',
  needsKey: true,
  topUp: 'platform.claude.com',
  contextTokens: 128_000,
  reasoning: 'effort',
  tokenLimit: 'max_tokens',
  web: 'lookup'
}

const OPENAI: Profile = {
  id: 'openai',
  format: 'openai',
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
  format: 'openai',
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
  format: 'openai',
  label: 'your AI service',
  keyLabel: 'a key',
  needsKey: false,
  contextTokens: 32_000,
  reasoning: 'none',
  tokenLimit: 'max_tokens',
  web: 'lookup'
}

const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost')

function serviceAt(baseUrl: string): Profile {
  if (isDeepSeek(baseUrl)) return DEEPSEEK
  try {
    const { hostname } = new URL(baseUrl)
    if (hostname === 'api.anthropic.com') return CLAUDE
    if (hostname === 'api.openai.com') return OPENAI
    if (isLocal(hostname)) return LOCAL
  } catch {
    /* not an address yet */
  }
  return CUSTOM
}

/** What's known about an address. `format` is the user's choice; `auto` goes by the address. */
export function profileFor(baseUrl: string, format: ApiFormat = 'auto'): Profile {
  const profile = serviceAt(baseUrl)
  return format === 'auto' ? profile : { ...profile, format }
}
