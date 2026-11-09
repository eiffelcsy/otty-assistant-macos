import type {
  ActivityItem,
  AnswerLanguage,
  AttachResult,
  Capture,
  ChatEvent,
  ChatMessage,
  FileAttachment,
  Memory,
  OttyApi,
  PanelOpenPayload,
  PublicSettings
} from '../../src/shared/types'
import { searchThreads } from '../../src/main/store/search'
import type { Thread } from '../../src/main/store/types'

// ?view=panel|quick|pickup  ?scene=chat|empty|compose|tray|settings|provider|page|proofread|memory|memories|math|steps|activity|history|find (pickup: reading|nowords|failed)  ?home=none

const q = new URLSearchParams(location.search)
const scene = q.get('scene') ?? 'chat'

/** A small table and a paragraph, drawn as a picture, with the boxes the helper would report. */
const pickupSample = (() => {
  const [w, h] = [640, 300]
  const cells = [
    ['Item', 40, 50],
    ['價格', 260, 50],
    ['Note', 440, 50],
    ['Apples', 40, 100],
    ['3.50', 260, 100],
    ['fresh', 440, 100],
    ['Pears', 40, 150],
    ['12.00', 260, 150],
    ['繁體中文', 440, 150],
    ['Otters hold hands while they sleep.', 40, 240]
  ] as const
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="white"/>${cells
    .map(([t, x, y]) => `<text x="${x}" y="${y}" font-family="Helvetica, PingFang HK" font-size="22">${t}</text>`)
    .join('')}</svg>`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = '22px Helvetica, PingFang HK'
  return {
    picture: { dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width: w, height: h },
    lines: cells.map(([text, x, y]) => ({ text, box: { x: x / w, y: (y - 20) / h, w: measure.measureText(text).width / w, h: 27 / h } }))
  }
})()

const settings: PublicSettings = {
  hasApiKey: true,
  needsKey: true,
  savedKeys: ['deepseek'],
  readsPages: true,
  apiFormat: 'auto',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  screenHotkey: 'Command+Alt+Shift+Space',
  takenHotkeys: q.get('taken') ? ['Alt+Space'] : [],
  onboarded: scene !== 'onboarding',
  shareAppContext: true,
  rememberChats: true,
  keepChats: '1y',
  homeLanguage: q.get('home') === 'none' ? null : 'zh-HK',
  learn: true
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

const draft = 'I has two cat and they is very friendly. Yesterday we goes to the park.'
const proofreadSample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Check my writing', captures: [{ id: 'c1', context: { kind: 'text', text: draft }, app: null }], app: null },
  {
    id: 'a1',
    role: 'assistant',
    language: 'en',
    tools: [],
    text: '```fixed\nI have two cats and they are very friendly. Yesterday we went to the park.\n```\n\n- **has → have:** “I” takes “have”.\n- **cat → cats:** two of them, so it’s plural.\n- **is → are:** “they” takes “are”.\n- **goes → went:** “yesterday” needs the past tense.'
  }
]

const mathSample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: '17.5% of 2,340', captures: [], app: null },
  { id: 'a1', role: 'assistant', tools: [], text: '**409.5**', calc: { expression: '17.5% of 2,340', result: '409.5' } },
  { id: 'u2', role: 'user', text: 'Solve 3x + 7 = 25', captures: [], app: null },
  {
    id: 'a2',
    role: 'assistant',
    tools: [{ callId: 't1', label: 'Calculated (25 − 7) ÷ 3 = 6', icon: 'calculator', status: 'done', copy: '6' }],
    text: `1. Take 7 from both sides:

$$3x = 18$$

2. Divide both sides by 3, which is the same as $$x = \\frac{18}{3}$$ here.

**Answer: x = 6**

Check: $$3 \\times 6 + 7 = 25$$ ✓ That costs $5 and $10, which stay as plain text.

$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$`
  }
]

const memorySample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'I’m learning Spanish for a trip to Madrid. How do I say thank you?', captures: [], app: null },
  {
    id: 'a1',
    role: 'assistant',
    tools: [],
    text: 'It’s **gracias**. For “thank you very much”, say **muchas gracias**.',
    used: [{ memoryId: 3, text: 'Is learning Spanish' }],
    memories: [
      { memoryId: 1, text: 'Is learning Spanish', action: 'added' },
      { memoryId: 2, text: 'Mostly works in Excel and Safari', action: 'updated', before: 'Mostly works in Excel' }
    ]
  }
]

const stepsSample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'How do I export this as a PDF and add up column B?', captures: [], app: { name: 'Excel', title: 'Budget.xlsx' } },
  {
    id: 'a1',
    role: 'assistant',
    tools: [],
    text: 'Here’s how. Press a button and Otty does that step for you.',
    steps: {
      title: 'Add up and export',
      app: { name: 'Excel', bundleId: 'com.microsoft.Excel' },
      steps: [
        { text: 'Click the empty cell under column B', done: true },
        { text: 'Paste the formula', action: { kind: 'paste', text: '=SUM(B:B)', mode: 'replace' } },
        { text: 'Export the sheet', action: { kind: 'menu', path: ['File', 'Export To', 'PDF…'] } },
        { text: 'Take a screenshot of the result', action: { kind: 'keys', combo: '⌘⇧4' } },
        { text: 'Delete the old copy', risky: true, action: { kind: 'menu', path: ['File', 'Delete'] } },
        { text: 'Check the privacy settings', action: { kind: 'open', target: 'x-apple.systempreferences:com.apple.preference.security' }, manual: true, note: 'Otty couldn’t find that menu.' }
      ]
    }
  }
]

const activitySample: ActivityItem[] = [
  { id: 'j1', kind: 'job', title: 'Cheapest way from Hong Kong to Tokyo', state: 'done', pages: 12, chatId: '1', partial: true, unseen: true },
  { id: 'j2', kind: 'job', title: 'Compare three laptops', state: 'waiting', pages: 4, waitUrl: 'https://reviews.example/laptops?id=42', unseen: true },
  { id: 'j3', kind: 'job', title: 'Best rail passes', state: 'paused', pages: 7, note: 'This has been sitting a while. Keep going?', unseen: false },
  { id: 'j4', kind: 'job', title: 'Visa rules for Japan', state: 'working', pages: 3, unseen: false },
  { id: 'j5', kind: 'job', title: 'Hotels near Ueno', state: 'queued', pages: 0, unseen: false },
  { id: 'a1', kind: 'answer', title: 'Explain this simply “Requests beyond…”', state: 'working', pages: 0, chatId: '1', unseen: false }
]

let memories: Memory[] = [
  { id: 1, text: 'Is learning Spanish', kind: 'goal', origin: 'inferred', status: 'active', confidence: 0.8, sourceChatId: '1', createdAt: Date.now() - 3e8, updatedAt: Date.now() - 3e8 },
  { id: 2, text: 'Mostly works in Excel and Safari', kind: 'habit', origin: 'observed', status: 'active', confidence: 1, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 3, text: 'Manager is Sam', kind: 'person', origin: 'told', status: 'active', confidence: 1, sourceChatId: '2', createdAt: Date.now() - 9e8, updatedAt: Date.now() - 9e8 },
  { id: 4, text: 'Prefers short answers', kind: 'preference', origin: 'observed', status: 'paused', confidence: 1, createdAt: Date.now(), updatedAt: Date.now() },
  { id: 5, text: 'Works as a nurse', kind: 'about', origin: 'settings', status: 'active', confidence: 1, createdAt: Date.now(), updatedAt: Date.now() }
]

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
  runStep: async (answerId, index) => {
    const answer = stepsSample[1] as Extract<ChatMessage, { role: 'assistant' }>
    answer.steps!.steps[index].done = true
    emit({ type: 'steps', id: answerId, card: structuredClone(answer.steps!) })
  },
  tickStep: async (answerId, index, done) => {
    const answer = stepsSample[1] as Extract<ChatMessage, { role: 'assistant' }>
    answer.steps!.steps[index].done = done
    emit({ type: 'steps', id: answerId, card: structuredClone(answer.steps!) })
  },
  checkStep: noop,
  stuckOnStep: noop,
  listActivity: async () => (scene === 'activity' ? activitySample : []),
  stopActivity: noop,
  answerActivity: noop,
  resumeActivity: noop,
  retryActivity: noop,
  openActivity: noop,
  seenActivity: noop,
  onActivity: () => () => {},
  setChatLearn: async (on) => emit({ type: 'learn', on }),
  listMemories: async () => memories,
  addMemory: async (text) => {
    memories = [{ id: Date.now(), text, kind: 'about', origin: 'settings', status: 'active', confidence: 1, createdAt: Date.now(), updatedAt: Date.now() }, ...memories]
    return memories
  },
  updateMemory: async (id, change) => {
    memories = memories.map((m) => (m.id === id ? { ...m, ...change } : m))
    return memories
  },
  removeMemory: async (id) => {
    memories = memories.filter((m) => m.id !== id)
    return memories
  },
  clearMemories: async () => {
    memories = []
  },
  undoMemory: async (answerId, memoryId) => {
    const note = (memorySample[1] as Extract<ChatMessage, { role: 'assistant' }>).memories!.find((n) => n.memoryId === memoryId)!
    emit({ type: 'memory', id: answerId, note: { ...note, undone: true } })
  },
  openMemories: async () => openCb?.({ context: null, notice: 'open-memory' }),
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
  copyText: async (text) => {
    ;(window as any).__copied = text
  },
  pickUpText: noop,
  pickupPicture: async () => pickupSample.picture,
  pickupRead: async () => (scene === 'reading' ? new Promise(() => {}) : scene === 'nowords' ? [] : scene === 'failed' ? null : pickupSample.lines),
  closePickup: noop,
  closeQuick: noop,
  expandQuick: noop,
  quickResize: () => {},
  quickState: () => {},
  bubbleMenu: () => {},
  bubbleDrag: () => {},
  onChatEvent: (cb) => {
    chatCb = cb
    if (scene === 'proofread') setTimeout(() => cb({ type: 'load', messages: proofreadSample }), 50)
    if (scene === 'steps') setTimeout(() => cb({ type: 'load', messages: stepsSample }), 50)
    if (scene === 'math') setTimeout(() => cb({ type: 'load', messages: mathSample }), 50)
    if (scene === 'memory') setTimeout(() => cb({ type: 'load', messages: memorySample }), 50)
    if (scene === 'chat' || scene === 'compose' || scene === 'find') setTimeout(() => cb({ type: 'load', messages: sample }), 50)
    return () => {}
  },
  onPanelOpen: (cb) => {
    openCb = cb
    if (scene === 'page') setTimeout(() => cb({ context: null, app }), 80)
    if (scene === 'compose' || scene === 'empty-compose' || scene === 'tray') setTimeout(() => cb({ context: highlighted, app }), 80)
    // Once only: StrictMode subscribes twice, and a second snip would land in the tray.
    if (scene === 'tray' && !trayed.panel) setTimeout(() => cb({ context: snip, app: terminal, add: true }), 160)
    trayed.panel = true
    if (scene === 'settings' || scene === 'provider') setTimeout(() => cb({ context: null, notice: 'open-settings' }), 80)
    if (scene === 'memories') setTimeout(() => cb({ context: null, notice: 'open-memory' }), 80)
    if (scene === 'find') setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true })), 200)
    if (scene === 'history') setTimeout(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true })), 120)
    return () => {}
  },
  onQuickOpen: (cb) => {
    const context = scene === 'page' ? null : q.get('ctx') === 'word' ? ({ kind: 'text', text: 'idempotent' } as const) : highlighted
    setTimeout(() => cb({ context, app }), 50)
    if (scene === 'tray' && !trayed.quick) setTimeout(() => cb({ context: snip, app: terminal, add: true }), 150)
    trayed.quick = true
    return () => {}
  },
  onBubbleState: () => () => {},
  onBubbleWorking: () => () => {},
  onBubbleBadge: () => () => {},
  onWindowVisible: () => () => {}
}

;(window as any).otty = api
;(window as any).__otty = { emit, open: (p: PanelOpenPayload) => openCb?.(p) }

// Load the real renderer only once the mock is in place.
void import('../../src/renderer/src/main.tsx')
