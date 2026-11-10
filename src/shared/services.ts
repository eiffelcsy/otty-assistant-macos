// The services Otty offers. A preset only fills in the address and model; the user can change either.

export type ServiceId = 'deepseek' | 'claude' | 'openai' | 'local' | 'custom'

export interface Service {
  id: ServiceId
  label: string
  blurb: string
  baseUrl: string
  /** Empty when the user has to say which model. */
  model: string
  /** False when there's no key to ask for, or it's up to the server. */
  needsKey: boolean
  keyUrl?: string
  /** Where the service shows what Otty's requests cost. */
  usageUrl?: string
  keyHint: string
  /** Where a question goes. */
  privacy: string
  /** Where a web lookup goes. */
  webPrivacy: string
}

const PAGES = 'When it reads a page, your Mac opens it directly, so the site sees your internet address. It can’t see pages you’re signed in to.'
const LOOKUPS = `When Otty looks something up, the search words go to Wikipedia and DuckDuckGo. ${PAGES}`

export const SERVICES: Service[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    blurb: 'Quick and low-cost, with real web search.',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    usageUrl: 'https://platform.deepseek.com/usage',
    keyHint: 'sk-…',
    privacy: 'Your questions go to DeepSeek.',
    webPrivacy: 'When Otty searches the web or reads a page for you, the search words or the page address go to DeepSeek, which fetches the page itself. It can’t see pages you’re signed in to.'
  },
  {
    id: 'claude',
    label: 'Claude',
    blurb: 'Careful, thoughtful answers from Anthropic.',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5-5',
    needsKey: true,
    keyUrl: 'https://platform.claude.com/settings/keys',
    usageUrl: 'https://platform.claude.com/usage',
    keyHint: 'sk-ant-…',
    privacy: 'Your questions go to Anthropic.',
    webPrivacy: `When Otty searches the web, the search words go to Anthropic, and each search is billed to your Claude account. ${PAGES}`
  },
  {
    id: 'openai',
    label: 'OpenAI',
    blurb: 'The company behind ChatGPT.',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    usageUrl: 'https://platform.openai.com/usage',
    keyHint: 'sk-…',
    privacy: 'Your questions go to OpenAI.',
    webPrivacy: LOOKUPS
  },
  {
    id: 'local',
    label: 'On this Mac (experimental)',
    blurb: 'Private, with Ollama or LM Studio. Not fully tested yet.',
    baseUrl: 'http://localhost:11434/v1',
    model: '',
    needsKey: false,
    keyHint: '',
    privacy: 'Everything stays on this Mac.',
    webPrivacy: 'Otty can’t search the web or read pages with a model on this Mac, so nothing leaves it.'
  },
  {
    id: 'custom',
    label: 'Another service',
    blurb: 'Any OpenAI-style or Anthropic-style address.',
    baseUrl: '',
    model: '',
    needsKey: false,
    keyHint: 'Only if the service needs one',
    privacy: 'Your questions go to the address below.',
    webPrivacy: LOOKUPS
  }
]

const isLocal = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host) || host.endsWith('.localhost')

/** Which service an address belongs to. */
export function serviceAt(baseUrl: string): ServiceId {
  try {
    const { hostname } = new URL(baseUrl)
    if (hostname === 'api.deepseek.com') return 'deepseek'
    if (hostname === 'api.anthropic.com') return 'claude'
    if (hostname === 'api.openai.com') return 'openai'
    if (isLocal(hostname)) return 'local'
  } catch {
    /* not an address yet */
  }
  return 'custom'
}

export const serviceById = (id: ServiceId): Service => SERVICES.find((s) => s.id === id)!
