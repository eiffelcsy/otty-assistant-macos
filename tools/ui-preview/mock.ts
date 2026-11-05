import type {
  AnswerLanguage,
  AttachResult,
  Capture,
  ChatEvent,
  ChatMessage,
  FileAttachment,
  OttyApi,
  PanelOpenPayload,
  PublicSettings
} from '../../src/shared/types'
import { searchThreads } from '../../src/main/store/search'
import type { Thread } from '../../src/main/store/types'

// ?view=panel|quick  ?scene=chat|empty|compose|tray|settings|history|find  ?home=none

const q = new URLSearchParams(location.search)
const scene = q.get('scene') ?? 'chat'

const settings: PublicSettings = {
  hasApiKey: true,
  needsKey: true,
  apiFormat: 'auto',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  onboarded: scene !== 'onboarding',
  shareAppContext: true,
  rememberChats: true,
  keepChats: '1y',
  homeLanguage: q.get('home') === 'none' ? null : 'zh-HK'
}

const app = { name: 'Safari', title: 'Pricing — Acme Cloud', url: 'https://acme.cloud/pricing' }
const highlighted = { kind: 'text' as const, text: 'Requests beyond your plan are subject to rate limiting and may return HTTP 429.' }
const terminal = { name: 'Terminal', title: 'deploy — zsh' }
const snipUrl =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90"><rect width="360" height="90" fill="#1f1c1d"/><text x="12" y="30" font-family="monospace" font-size="13" fill="#e6e3dc">$ acme deploy</text><text x="12" y="56" font-family="monospace" font-size="13" fill="#e08a7a">Error: 429 Too Many Requests</text></svg>'
  )
const snip = { kind: 'image' as const, dataUrl: snipUrl, width: 360, height: 90 }

const sample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Explain this simply', captures: [{ id: 'c1', context: highlighted, app }], app: null, language: 'en' },
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
  { id: 'u2', role: 'user', text: '點樣 upgrade 我嘅 plan？', captures: [], app: null, language: 'zh-HK' },
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

// The paperclip "picks" these: a PDF, a picture and one Otty turns away.
const thumb =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#8c9b6a"/><circle cx="40" cy="20" r="8" fill="#f3dcc2"/></svg>')
const mockFiles: Record<string, AttachResult> = {
  f1: { ok: true, file: { id: 'f1', name: 'Tenancy agreement 2026.pdf', kind: 'pdf', pages: 12 } },
  f2: { ok: true, file: { id: 'f2', name: 'IMG_0042.HEIC', kind: 'image', thumb } },
  f3: { ok: false, message: 'Otty can’t read this kind of file yet. Try a PDF, a Word document, a picture or a text file.' }
}
const names: Record<string, string> = { f1: 'Tenancy agreement 2026.pdf', f2: 'IMG_0042.HEIC', f3: 'Budget.numbers' }

function fakeAnswer(text: string, captures: Capture[], language: AnswerLanguage = 'en', fileIds: string[] = []) {
  const id = String(Math.random())
  const files = fileIds.flatMap((f) => {
    const r = mockFiles[f]
    if (!r?.ok) return []
    const { thumb: _thumb, ...file } = r.file
    return [f === 'f1' ? { ...file, note: 'Otty read the first 40 of 120 pages.' } : r.file] as FileAttachment[]
  })
  emit({ type: 'user', id: id + 'u', text, captures, app: null, language, ...(files.length ? { files } : {}) })
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
const trayed = { panel: false, quick: false }
const api: OttyApi = {
  getSettings: async () => settings,
  saveSettings: async (u) => Object.assign(settings, u),
  testConnection: async () => ({ ok: true, message: 'Connected to deepseek-flash! Otty is ready to help.' }),
  getPermissions: async () => ({ platform: 'darwin', accessibility: true, screen: false }),
  openPermissionSettings: noop,
  sendMessage: async (text, captures, opts) => fakeAnswer(text, captures, opts?.language, opts?.files),
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
  pickFiles: async () => Object.entries(names).map(([id, name]) => ({ id, name })),
  dropFiles: async () => [],
  readFile: (id) => new Promise((r) => setTimeout(() => r(mockFiles[id]), id === 'f1' ? 1200 : 400)),
  discardFile: noop,
  captureSelection: async () => ({ context: highlighted, app }),
  captureScreenshot: async () => ({ context: snip, app: terminal }),
  closePanel: noop,
  openExternal: noop,
  copyText: noop,
  closeQuick: noop,
  expandQuick: noop,
  quickResize: () => {},
  quickState: () => {},
  bubbleMenu: () => {},
  bubbleDrag: () => {},
  onChatEvent: (cb) => {
    chatCb = cb
    if (scene === 'chat' || scene === 'compose' || scene === 'find') setTimeout(() => cb({ type: 'load', messages: sample }), 50)
    return () => {}
  },
  onPanelOpen: (cb) => {
    openCb = cb
    if (scene === 'compose' || scene === 'empty-compose' || scene === 'tray') setTimeout(() => cb({ context: highlighted, app }), 80)
    // Once only: StrictMode subscribes twice, and a second snip would land in the tray.
    if (scene === 'tray' && !trayed.panel) setTimeout(() => cb({ context: snip, app: terminal, add: true }), 160)
    trayed.panel = true
    if (scene === 'settings') setTimeout(() => cb({ context: null, notice: 'open-settings' }), 80)
    if (scene === 'find') setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true })), 200)
    if (scene === 'history') setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true })), 120)
    return () => {}
  },
  onQuickOpen: (cb) => {
    setTimeout(() => cb({ context: q.get('ctx') === 'word' ? { kind: 'text', text: 'idempotent' } : highlighted, app }), 50)
    if (scene === 'tray' && !trayed.quick) setTimeout(() => cb({ context: snip, app: terminal, add: true }), 150)
    trayed.quick = true
    return () => {}
  },
  onBubbleState: () => () => {},
  onBubbleBadge: () => () => {}
}

;(window as any).otty = api
;(window as any).__otty = { emit, open: (p: PanelOpenPayload) => openCb?.(p) }

// Load the real renderer only once the mock is in place.
void import('../../src/renderer/src/main.tsx')
