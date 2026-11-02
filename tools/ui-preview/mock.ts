import type { AnswerLanguage, ChatEvent, ChatMessage, OttyApi, PanelOpenPayload, PublicSettings } from '../../src/shared/types'
import { searchThreads } from '../../src/main/store/search'
import type { Thread } from '../../src/main/store/types'

// ?view=panel|quick  ?scene=chat|empty|compose|settings|history  ?home=none

const q = new URLSearchParams(location.search)
const scene = q.get('scene') ?? 'chat'

const settings: PublicSettings = {
  hasApiKey: true,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  onboarded: scene !== 'onboarding',
  shareAppContext: true,
  rememberChats: true,
  homeLanguage: q.get('home') === 'none' ? null : 'zh-HK'
}

const app = { name: 'Safari', title: 'Pricing — Acme Cloud', url: 'https://acme.cloud/pricing' }
const highlighted = { kind: 'text' as const, text: 'Requests beyond your plan are subject to rate limiting and may return HTTP 429.' }

const sample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Explain this simply', context: highlighted, app, language: 'en' },
  {
    id: 'a1',
    role: 'assistant',
    language: 'en',
    tools: [{ callId: 't1', label: 'Searched “HTTP 429”', icon: 'search', status: 'done' }],
    text: `This means the website will **slow you down** if you ask it for too much, too fast.

1. Your plan allows a certain number of requests each minute.
2. Go over that, and you hit [rate limiting](#explain): the site pauses you for a bit.
3. While paused, it answers with [HTTP 429](#explain), which just means "too many requests, try again soon".

> 💡 **Good to know:** waiting a minute and trying again usually fixes it.`
  },
  { id: 'u2', role: 'user', text: '點樣 upgrade 我嘅 plan？', context: null, app: null, language: 'zh-HK' },
  {
    id: 'a2',
    role: 'assistant',
    language: 'zh-HK',
    tools: [],
    text: `你可以在網站上直接升級：

1. 按右上角的「Account」（帳戶）。
2. 選「Billing」（帳單）→「Change plan」（更改計劃）。
3. 揀一個較大的[計劃](#explain)，然後按「Confirm」（確認）。`
  }
]

// Saved chats for Recent chats; search runs the real in-memory search over them.
const thread = (id: string, title: string, app: string, age: number, messages: ChatMessage[]): Thread => ({
  id,
  title,
  app,
  createdAt: 0,
  updatedAt: Date.now() - age,
  messages,
  history: []
})
const saved = [
  thread('1', 'Explain this simply “Requests beyond your plan…”', 'Safari', 6e5, sample.slice(0, 2)),
  thread('2', '點樣 upgrade 我嘅 plan？', 'Safari', 864e5, sample.slice(2))
]

let chatCb: ((e: ChatEvent) => void) | null = null
let openCb: ((p: PanelOpenPayload) => void) | null = null
const emit = (e: ChatEvent) => chatCb?.(e)

function fakeAnswer(text: string, language: AnswerLanguage = 'en') {
  const id = String(Math.random())
  emit({ type: 'user', id: id + 'u', text, context: null, app: null, language })
  setTimeout(() => emit({ type: 'start', id, language }), 300)
  const words = (
    language === 'zh-HK'
      ? '當然！ 這是 一個 簡短 的 答案， 讓你 看看 串流 的 效果。'
      : 'Sure! Here is a short, friendly answer so you can see how streaming looks in the panel.'
  ).split(' ')
  words.forEach((w, i) => setTimeout(() => emit({ type: 'delta', id, text: (i ? ' ' : '') + w }), 600 + i * 60))
  setTimeout(() => emit({ type: 'done', id }), 700 + words.length * 60)
}

const noop = async () => {}
const api: OttyApi = {
  getSettings: async () => settings,
  saveSettings: async (u) => Object.assign(settings, u),
  testConnection: async () => ({ ok: true, message: 'Connected to deepseek-flash! Otty is ready to help.' }),
  getPermissions: async () => ({ platform: 'darwin', accessibility: true, screen: false }),
  openPermissionSettings: noop,
  sendMessage: async (text, _ctx, opts) => fakeAnswer(text, opts?.language),
  stop: noop,
  resetChat: async () => emit({ type: 'reset' }),
  listChats: async () => saved.map(({ id, title, app, updatedAt }) => ({ id, title, app, updatedAt })),
  openChat: async (id, focusMessageId) => {
    const t = saved.find((c) => c.id === id)
    if (t) emit({ type: 'load', messages: t.messages, focusMessageId })
  },
  searchChats: async (q) => searchThreads(saved, q),
  deleteChat: noop,
  clearChats: noop,
  respondConfirm: noop,
  explain: async (term, _around, language) =>
    new Promise((r) =>
      setTimeout(
        () =>
          r(
            language === 'zh-HK'
              ? `「${term}」就好像餐廳限制每位客人每分鐘只可以點幾多道菜。`
              : `中文：限速\n\n"${term}" is like a café that only takes so many orders a minute. Order too fast and they ask you to wait a moment.`
          ),
        500
      )
    ),
  captureSelection: async () => ({ context: highlighted, app }),
  captureScreenshot: async () => ({ context: null }),
  closePanel: noop,
  openExternal: noop,
  copyText: noop,
  closeQuick: noop,
  expandQuick: noop,
  quickResize: () => {},
  bubbleMenu: () => {},
  bubbleDrag: () => {},
  onChatEvent: (cb) => {
    chatCb = cb
    if (scene === 'chat' || scene === 'compose') setTimeout(() => cb({ type: 'load', messages: sample }), 50)
    return () => {}
  },
  onPanelOpen: (cb) => {
    openCb = cb
    if (scene === 'compose' || scene === 'empty-compose') setTimeout(() => cb({ context: highlighted, app }), 80)
    if (scene === 'settings') setTimeout(() => cb({ context: null, notice: 'open-settings' }), 80)
    if (scene === 'history') setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true })), 120)
    return () => {}
  },
  onQuickOpen: (cb) => {
    setTimeout(() => cb({ context: q.get('ctx') === 'word' ? { kind: 'text', text: 'idempotent' } : highlighted, app }), 50)
    return () => {}
  },
  onBubbleState: () => () => {},
  onBubbleBadge: () => () => {}
}

;(window as any).otty = api
;(window as any).__otty = { emit, open: (p: PanelOpenPayload) => openCb?.(p) }

// Load the real renderer only once the mock is in place.
void import('../../src/renderer/src/main.tsx')
