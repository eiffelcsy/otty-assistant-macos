import type {
  AnswerLanguage,
  AttachResult,
  CalendarItem,
  Capture,
  ChatEvent,
  ChatMessage,
  ConfirmCard,
  ConnectionOffer,
  ConnectionToolView,
  ConnectionView,
  ConnectionsState,
  ConnectRequest,
  ConnectResult,
  FileAttachment,
  Memory,
  OttyApi,
  PanelOpenPayload,
  PouchItem,
  PublicSettings,
  SentItem
} from '../../src/shared/types'
import { searchThreads } from '../../src/main/store/search'
import { draw } from '../../src/renderer/src/draw/render'
import type { BubbleMood, DrawingView } from '../../src/shared/types'
import type { Thread } from '../../src/main/store/types'
import { entryDetails, logbook, type LogSources } from '../../src/main/logbook'
import { home } from '../../src/main/home'
import type { Job } from '../../src/main/jobs/types'
import type { ActionRow } from '../../src/main/ledger'

// ?view=panel|quick|pickup|viewer  ?scene=chat|empty|compose|tray|settings|provider|page|proofread|memory|memories|math|code|drawing|chart|cap|steps|logbook|logbook-wait|logbook-next|logbook-sent|logbook-changed|logbook-noted|logbook-empty|logbook-running|logbook-paused|logbook-entry|logbook-search|logbook-none|typography|paused|frame-menu|frame-pushed|frame-rail|frame-medium|frame-wide|frame-min|home|home-quiet|home-first|home-running|home-paused|history|find|settings-you|settings-tiles|settings-keys|settings-privacy|settings-usage|settings-conn|settings-help|settings-feedback|settings-find|settings-retention|settings-broken|settings-recording|connections|connections-add|connections-mcp|connections-off|connect-card|calendar|calendar-list|calendar-empty|calendar-edit|calendar-note|calendar-loading|calendar-loading-list|pouch|pouch-list|pouch-empty|pouch-card|pouch-search|confirm-read|confirm-open|confirm-search|confirm-reminder|confirm-event|confirm-unusual|receipts|rewind|noted|thinking|stopped|failed-key|failed-long|near (pickup: reading|nowords|failed; viewer: picture|slides)  ?home=none  &w=&h= (D-64, the window's size)  &state=roomy (D-65)  &time=dawn|day|golden|night (D-74, the cove's painting)
//   ?view=bubble&scene=pool|pool-working|pool-waiting|pool-answer|pool-paused|pool-night (Spec 13, the pool)

const q = new URLSearchParams(location.search)
const scene = q.get('scene') ?? 'chat'
/** Clicks the first element matching `sel` once it has rendered (the Calendar draws after its first read). */
const clickWhenThere = (sel: string, tries = 40): void => {
  const el = document.querySelector<HTMLElement>(sel)
  if (el) el.click()
  else if (tries) setTimeout(() => clickWhenThere(sel, tries - 1), 50)
}

// D-74: `&time=dawn|day|golden|night` pins the cove's painting (and Home's greeting) by moving the clock to that hour.
const HOURS: Record<string, number> = { dawn: 6, day: 14, golden: 17, night: 21 }
// Spec 13: the pool's scenes are at day, and pool-night at night, unless `&time=` says otherwise.
const pinned = HOURS[q.get('time') ?? (scene === 'pool-night' ? 'night' : scene.startsWith('pool') ? 'day' : '')]
if (pinned !== undefined) {
  const Real = Date
  const at = new Real()
  at.setHours(pinned, 30, 0, 0)
  const offset = at.getTime() - Real.now()
  globalThis.Date = class extends Real {
    constructor(...args: [] | [string | number | Date]) {
      if (args.length) super(...args)
      else super(Real.now() + offset)
    }
    static now() {
      return Real.now() + offset
    }
  } as DateConstructor
}

// D-64: `&w=` and `&h=` size the window, so every band of the frame can be drawn (Spec 05).
const root = document.getElementById('root')
/** The frame scenes' own sizes: each band at a test width (Spec 05). */
const FRAME_SIZES: Record<string, [number, number]> = {
  'frame-rail': [680, 600],
  'frame-medium': [760, 600],
  'frame-wide': [1280, 720],
  'frame-min': [360, 420],
  calendar: [900, 720],
  'calendar-list': [420, 720],
  'calendar-loading': [900, 720],
  'calendar-loading-list': [420, 720],
  'calendar-empty': [900, 720],
  'calendar-edit': [900, 720],
  'calendar-note': [900, 720],
  pouch: [900, 720],
  'pouch-list': [420, 720],
  'pouch-empty': [900, 720],
  'pouch-card': [900, 720],
  'pouch-search': [900, 720]
}
const size: [number, number] | undefined = FRAME_SIZES[scene]
if (root && (q.get('w') || size)) root.style.width = `${Number(q.get('w') ?? size?.[0])}px`
if (root && (q.get('h') || size)) root.style.height = `${Number(q.get('h') ?? size?.[1])}px`

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
  hasApiKey: scene !== 'settings-broken',
  needsKey: true,
  savedKeys: ['deepseek'],
  keychain: true,
  readsPages: true,
  apiFormat: 'auto',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-flash',
  thinking: false,
  showBubble: true,
  askHotkey: 'Alt+Space',
  snapHotkey: 'Alt+Shift+Space',
  screenHotkey: 'Command+Alt+Shift+Space',
  takenHotkeys: q.get('taken') || scene === 'settings-keys' ? ['Command+Alt+Shift+Space'] : [],
  onboarded: scene !== 'onboarding',
  shareAppContext: true,
  rememberChats: true,
  keepChats: '1y',
  homeLanguage: q.get('home') === 'none' ? null : 'zh-HK',
  learn: true,
  workPaused: scene === 'paused',
  workPausedUntil: null,
  notifyDone: false,
  openAtLogin: false,
  canOpenAtLogin: true,
  // D-56: two tiles of the user's own, in Settings and under a highlight.
  myTiles:
    scene === 'settings-tiles' || scene === 'compose'
      ? [
          { id: 't1', name: 'Make flashcards', icon: 'layers', prompt: 'Turn this into five flashcards.', when: 'text' },
          { id: 't2', name: 'Reply politely', icon: 'envelope', prompt: 'Draft a short, polite reply to this.', when: 'any' }
        ]
      : [],
  monthlyCap: scene.startsWith('settings') || scene === 'cap' || scene === 'near' ? { unit: 'questions', limit: 300 } : null,
  capNoticed: null,
  homeUsed: q.get('home') !== 'unused',
  languageSwitch: null,
  homeWidgets: ['calendar', 'today', 'after', 'tiles']
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

const FLOW = `flowchart LR
  A["Idea"] --> B["Bill drafted"]
  B --> C{"Vote passes?"}
  C -- "Yes" --> D["Signed into law"]
  C -- "No" --> E["Back to the drawing board"]`
const DECK = `# How otters stay together
A five-minute talk

---

# Why they hold hands
- So they don't drift apart while they sleep
- **Kelp** works as an anchor too
Note: Ask the class if they've seen this.

---

# 90%
of a sea otter's day is eating, grooming or resting

---

# The raft
~~~mermaid
flowchart LR
  M["Mothers"] --- P["Pups"]
  P --- R["Raft"]
~~~`
const CHART = `xychart-beta
  title "Total Sales by Month"
  x-axis ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]
  y-axis "Sales" 0 --> 17600
  bar [12400, 9800, 14100, 16000, 11250, 13900]`
const chartSample: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    text: 'Chart sales by month',
    captures: [],
    app: null,
    files: [{ id: 'f1', name: 'Budget.csv', kind: 'text' }],
    hidden: 1
  },
  {
    id: 'a1',
    role: 'assistant',
    tools: [{ callId: 't1', label: 'Worked out the chart', icon: 'chart-histogram', status: 'done' }],
    text: 'April was the best month at **16,000**, and February the quietest at **9,800**. Over the six months, sales came to **77,450**.',
    charts: [
      {
        title: 'Total Sales by Month',
        code: CHART,
        table: '| Month | Sales |\n| --- | ---: |\n| Jan 2026 | 12,400 |\n| Feb 2026 | 9,800 |\n| Mar 2026 | 14,100 |\n| Apr 2026 | 16,000 |\n| May 2026 | 11,250 |\n| Jun 2026 | 13,900 |'
      }
    ]
  }
]

const drawingSample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Draw how a bill becomes a law', captures: [], app: null },
  { id: 'a1', role: 'assistant', tools: [], text: 'Here’s the path, from an idea to a law:\n\n```mermaid\n' + FLOW + '\n```' },
  { id: 'u2', role: 'user', text: 'Make 4 slides about otters for my class', captures: [], app: null },
  { id: 'a2', role: 'assistant', tools: [], text: 'Four slides, one idea each:\n\n```slides\n' + DECK + '\n```' },
  { id: 'u3', role: 'user', text: 'Draw a house with the sun', captures: [], app: null },
  {
    id: 'a3',
    role: 'assistant',
    tools: [],
    text: 'A little house under the sun:\n\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><circle cx="160" cy="30" r="16" fill="#c7b58b"/><rect x="50" y="70" width="80" height="60" fill="#8c9b6a"/><path d="M40 72 L90 30 L140 72 Z" fill="#637c42"/><rect x="82" y="100" width="16" height="30" fill="#3a3132"/><script>alert(1)</script><image href="https://evil.example/t.png"/></svg>\n```'
  },
  { id: 'u4', role: 'user', text: 'And a timeline?', captures: [], app: null },
  { id: 'a4', role: 'assistant', tools: [], text: 'Here it is:\n\n```mermaid\nflowchart LR\n  A --> \n```' }
]

const codeSample: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    text: 'Find problems',
    captures: [],
    app: null,
    files: [
      { id: 'c1', name: 'average.py', kind: 'code', lang: 'Python', lines: 13 },
      { id: 'c2', name: 'rivers.ipynb', kind: 'notebook', lang: 'Python', cells: 18, hidden: 1 }
    ]
  },
  {
    id: 'a1',
    role: 'assistant',
    tools: [],
    text: `One real problem, on **line 10**: \`row["count"]\` is text when it comes from a CSV file, so adding it to a number fails with a [TypeError](#explain).

Turn it into a number first:

\`\`\`python
for row in rows:
    total += int(row["count"])
\`\`\`

In the notebook, **cell 4** fails because \`'cuont'\` is misspelt. It should be \`'count'\`:

\`\`\`
df['count'].mean()
\`\`\`

> 💡 **Good to know:** Otty hid one thing in the notebook that looked like a key, so it never left your Mac.`
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

/** D-60: a card waiting under an answer, one per kind, and one unusual. */
const cards: Record<string, ConfirmCard> = {
  'confirm-read': { kind: 'read', title: 'Read this page?', yes: 'Read it', host: 'jreast.co.jp', rest: '/en/timetable/tokyo-sendai?day=sat' },
  'confirm-open': { kind: 'open', title: 'Open this link?', yes: 'Open it', host: 'acme.cloud', rest: '/pricing#limits' },
  'confirm-search': { kind: 'search', title: 'Search the web for this?', yes: 'Search', query: 'Mei Ling Tan flat 4B Tai Hang Road rent increase notice', service: 'DeepSeek', unusual: 'private' },
  'confirm-reminder': { kind: 'reminder', title: 'Add this reminder?', yes: 'Add it', item: 'Essay deadline', when: 'Thu 20 Nov at 6:00 PM', list: 'In Reminders' },
  'confirm-unusual': { kind: 'read', title: 'Read this page?', yes: 'Read it', host: 'xn--pple-43d.com', readable: 'аpple.com', rest: '/account/verify', unusual: 'alphabet' },
  'confirm-event': { kind: 'event', title: 'Add this to your calendar?', yes: 'Add it', item: 'Essay', when: 'Thu 4 Dec, 14:00–16:00' }
}
/** D-77: the Pouch's sample stones. Two shelves, some loose ones, and one whose chat is gone. */
const POUCH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140"><circle cx="160" cy="30" r="16" fill="#c7b58b"/><rect x="50" y="70" width="80" height="60" fill="#8c9b6a"/><path d="M40 72 L90 30 L140 72 Z" fill="#637c42"/></svg>'
const POUCH_SAMPLE: PouchItem[] = [
  { answerId: 'p1', index: 0, kind: 'chart', title: 'Rainfall by month', drawing: 'mermaid', code: 'pie title Rainfall\n  "Jan" : 30\n  "Feb" : 45\n  "Mar" : 25', shelf: 'Budget', chatId: 'c1', chatTitle: 'Trip budget', chatAt: Date.now() - 2 * 86_400_000, kept: Date.now() - 2 * 86_400_000 },
  { answerId: 'p2', index: 0, kind: 'chart', title: 'Spending by week', drawing: 'mermaid', code: 'xychart-beta\n  title "Spending"\n  x-axis [Wk1, Wk2, Wk3]\n  bar [120, 95, 140]', shelf: 'Budget', chatId: 'c1', chatTitle: 'Trip budget', chatAt: Date.now() - 2 * 86_400_000, kept: Date.now() - 86_400_000 },
  { answerId: 'p3', index: 0, kind: 'deck', title: 'How otters stay together', drawing: 'slides', code: DECK, shelf: 'Class', chatId: 'c2', chatTitle: 'Otters for class', chatAt: Date.now() - 5 * 86_400_000, kept: Date.now() - 5 * 86_400_000 },
  { answerId: 'p4', index: 0, kind: 'diagram', title: 'From idea to law', drawing: 'mermaid', code: FLOW, chatId: 'c3', chatTitle: 'Civics homework', chatAt: Date.now() - 9 * 86_400_000, kept: Date.now() - 3 * 86_400_000 },
  { answerId: 'p5', index: 0, kind: 'picture', title: 'A little house', drawing: 'svg', code: POUCH_SVG, chatAt: Date.now() - 20 * 86_400_000, kept: Date.now() - 4 * 86_400_000 }
]
let pouchStore: PouchItem[] = structuredClone(POUCH_SAMPLE)
let lastDropped: PouchItem | null = null
const pouchView = (): PouchItem[] => structuredClone(pouchStore)

/** D-73: the Calendar screen's sample week, on this week's Monday, so the now line and today show whichever day it is. */
const CAL_MONDAY = (() => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
})()
const calAt = (day: number, h: number, m = 0): number => new Date(CAL_MONDAY.getFullYear(), CAL_MONDAY.getMonth(), CAL_MONDAY.getDate() + day, h, m).getTime()
const calDay = (day: number): number => calAt(day, 0)
const calTimed = (id: string, title: string, day: number, h: number, m: number, endH: number, endM: number, over: Partial<CalendarItem> = {}): CalendarItem => ({
  id,
  title,
  start: calAt(day, h, m),
  end: calAt(day, endH, endM),
  allDay: false,
  source: 'Otty',
  readOnly: false,
  ...over
})
const CAL_SAMPLE: CalendarItem[] = [
  calTimed('e1', 'Dentist', 0, 13, 0, 14, 0, { madeBy: 'you' }),
  calTimed('e2', 'Essay draft', 1, 14, 0, 16, 30, { madeBy: 'otty', notes: 'Introduction and two sources' }),
  calTimed('e3', 'Groceries', 3, 15, 0, 16, 0, { madeBy: 'you' }),
  calTimed('e4', 'Reading group', 3, 15, 30, 17, 0, { madeBy: 'otty' }),
  { id: 'e5', title: 'Standup', start: calAt(0, 9), end: calAt(0, 9, 30), allDay: false, source: 'Apple Calendar', calendar: 'Work', readOnly: true },
  { id: 'e6', title: 'Swim practice', start: calAt(2, 18), end: calAt(2, 19, 30), allDay: false, source: 'Apple Calendar', calendar: 'Home', readOnly: true },
  { id: 'e7', title: 'Otty trip', start: calDay(4), end: calDay(5), allDay: true, source: 'Otty', madeBy: 'you', readOnly: false }
]
const GOOGLE_NOTE = 'Google Calendar’s sign-in ran out. Sign in again in Settings › Connections.'
let calStore: CalendarItem[] = structuredClone(CAL_SAMPLE)
/** Spec 03's answer typography: a long question that clips, headings, a list, a wide table, code and a tip. */
const typographySample: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    text: Array.from({ length: 16 }, (_, i) => `Line ${i + 1} of a long question about otter habitats, pasted from my notes.`).join('\n'),
    captures: [],
    app: null
  },
  {
    id: 'a1',
    role: 'assistant',
    language: 'en',
    tools: [],
    text: `# Where otters live

Sea otters live along the **North Pacific** coast; river otters live inland.

## By species

1. Sea otter: kelp forests
2. Eurasian otter: rivers and lakes

| Species | Weight (kg) | Range (km²) | Where | Status |
| --- | --- | --- | --- | --- |
| Sea otter | 30 | 1,200 | North Pacific coast, from Japan to California | Endangered |
| Eurasian otter | 7.5 | 40 | Rivers and lakes across Europe and Asia | Near threatened |

\`\`\`python
habitats = {"sea": "kelp", "river": "banks"}
print(habitats["sea"])
\`\`\`

> 💡 Otters hold hands while they sleep so they don’t drift apart.`
  }
]

const askingSample: ChatMessage[] = [{ id: 'u1', role: 'user', text: 'When is the last train from Tokyo to Sendai on Saturday?', captures: [], app: null }]
function playCard(cb: (e: ChatEvent) => void, card: ConfirmCard) {
  cb({ type: 'load', messages: askingSample })
  cb({ type: 'start', id: 'a1', language: 'en' })
  cb({ type: 'tool', id: 'a1', callId: 't1', label: 'Searching the web', icon: 'search', status: 'done' })
  cb({ type: 'delta', id: 'a1', text: 'The timetable is on JR East’s site, so I’d like to read it.' })
  cb({ type: 'confirm', id: 'a1', confirmId: 'k1', card })
}

// D-54: Settings › Connections and the chat's connection card, in memory.
const PRIVACY = 'What Otty reads goes to DeepSeek with your question, and shows in What left your Mac.'
const BUILT: Record<'apple' | 'google' | 'canvas' | 'notion', { label: string; reads: string }> = {
  apple: { label: 'Apple Calendar', reads: 'Reads your calendars and reminders on this Mac' },
  google: { label: 'Google Calendar', reads: 'Reads your Google calendars' },
  canvas: { label: 'Canvas', reads: 'Reads what’s due and announcements at canvas.nus.edu.sg' },
  notion: { label: 'Notion', reads: 'Reads pages you’ve shared with Otty' }
}
const LINEAR_TOOLS: ConnectionToolView[] = [
  { name: 'create_issue', title: 'Create issue', description: 'Opens a new issue in a team you can see.', on: true, readOnly: false, changed: false },
  { name: 'list_issues', title: '', description: 'Lists the issues assigned to you, newest first.', on: true, readOnly: true, changed: false },
  { name: 'delete_issue', title: '', description: 'Deletes an issue for good.', on: false, readOnly: false, changed: true }
]
const CANVAS_VIEW: ConnectionView = { id: 'canvas', kind: 'canvas', label: 'Canvas', host: 'canvas.nus.edu.sg', status: 'on', reads: BUILT.canvas.reads, privacy: PRIVACY, tools: [] }
const LINEAR_VIEW: ConnectionView = {
  id: 'linear',
  kind: 'mcp',
  label: 'Linear',
  host: 'mcp.linear.app',
  status: 'changed',
  reads: `${LINEAR_TOOLS.filter((t) => t.on && !t.changed).length} of ${LINEAR_TOOLS.length} tools on · mcp.linear.app`,
  privacy: PRIVACY,
  tools: LINEAR_TOOLS
}
const offer = (kind: 'apple' | 'google' | 'canvas' | 'notion', available = true): ConnectionOffer => ({ kind, available, ...(available ? {} : { why: 'Off while Otty uses a model on this Mac.' }) })
function initialLinks(): ConnectionsState {
  if (scene === 'connections-off') return { connected: [], offers: [offer('apple'), offer('google', false), offer('canvas', false), offer('notion', false)], online: false }
  return { connected: [CANVAS_VIEW, LINEAR_VIEW], offers: [offer('apple'), offer('google'), offer('notion')], online: true }
}
let links: ConnectionsState = initialLinks()

const receiptsSample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Check the last train to Sendai on Saturday and remind me to book on Thursday', captures: [], app: null },
  {
    id: 'a1',
    role: 'assistant',
    language: 'en',
    tools: [{ callId: 't1', label: 'Searching the web', icon: 'search', status: 'done' }],
    text: 'The last Hayabusa leaves Tokyo at **21:44** and reaches Sendai at 23:16. I’ve added the reminder for Thursday.',
    receipts: [
      { allowed: true, verb: 'Read', what: 'jreast.co.jp' },
      { allowed: false, verb: 'Skipped', what: 'eki-net.com' },
      { allowed: true, verb: 'Added', what: '“Book the Sendai train”', undo: { kind: 'reminder', ref: 'r1', label: 'Remove the reminder “Book the Sendai train”' } }
    ]
  },
  { id: 'u2', role: 'user', text: 'Also open the seat map', captures: [], app: null },
  { id: 'a2', role: 'assistant', language: 'en', tools: [], text: 'Sure, what would you like instead?', receipts: [{ allowed: false, verb: 'Skipped', what: 'jreast.co.jp', why: 'you asked something else' }] }
]

const connectSample: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'Add Linear so you can see my issues', captures: [], app: null },
  {
    id: 'a1',
    role: 'assistant',
    language: 'en',
    tools: [],
    text: 'Here is the connection for Linear. Check the address, then press Check and add.\n\n```connection\n{"service":"mcp","name":"Linear","url":"https://mcp.linear.app/mcp","auth":"oauth"}\n```'
  }
]
const notedSample: ChatMessage[] = [
  memorySample[0],
  {
    ...(memorySample[1] as Extract<ChatMessage, { role: 'assistant' }>),
    memories: [
      { memoryId: 1, text: 'Is learning Japanese for a trip to Sendai in the spring, mostly to read menus and train signs', action: 'added' },
      { memoryId: 2, text: 'Mostly works in Excel and Safari', action: 'updated', before: 'Mostly works in Excel' },
      { memoryId: 4, text: 'Has a cat called Mochi', action: 'added', undone: true }
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

const ago = (m: number) => Date.now() - m * 60_000
const job = (id: string, title: string, over: Partial<Job>): Job => ({ id, title, brief: '', status: 'done', seedUrls: [], denied: [], language: 'en', rounds: 3, lookups: 6, workedMs: 0, partial: false, createdAt: ago(240), updatedAt: ago(120), sourceThread: '1', ...over })
const jobSample: Job[] = [
  job('j1', 'Cheapest way from Hong Kong to Tokyo', { lookups: 12, partial: true, resultThread: '1', updatedAt: ago(95) }),
  job('j2', 'Compare three laptops', { status: 'waiting', lookups: 4, waitUrl: 'https://reviews.example/laptops?id=42', updatedAt: ago(6) }),
  job('j3', 'Best rail passes', { status: 'paused', lookups: 7, error: 'This has been sitting a while. Keep going?', updatedAt: ago(1500) }),
  job('j5', 'Hotels near Ueno', { status: 'queued', lookups: 0, updatedAt: ago(1) }),
  job('j6', 'Tokyo rail pass price', { status: 'scheduled', lookups: 0, dueAt: Date.now() + 14 * 3.6e6, createdAt: ago(300) }),
  job('j8', 'Rail pass price', { status: 'scheduled', lookups: 0, dueAt: Date.now() + 3 * 864e5, repeat: { every: 'week', day: 1 }, createdAt: ago(2900) }),
  job('j9', 'Ferry times to Lantau', { status: 'failed', lookups: 2, error: 'Otty lost its connection. Try again to carry on from the last saved step.', updatedAt: ago(40) }),
  job('j7', 'Flight prices to Osaka', { ranLate: true, dueAt: ago(240), resultThread: '1', updatedAt: ago(4000) })
]
const running = job('j4', 'Visa rules for Japan', { status: 'working', lookups: 2, note: 'only official government sites' })

const changeSample: ActionRow[] = [
  { id: 4, at: ago(3), tool: 'create_reminder', summary: 'Reminder added: Call mum — 17 Nov 2026, 5:00 PM', status: 'done', undo: 'reminder', ref: 'R1', chatId: '1' },
  { id: 3, at: ago(20), tool: 'remember', summary: 'Noted: Is learning Spanish', status: 'done', undo: 'memory', ref: '1', undoneAt: ago(10), chatId: '2' },
  { id: 5, at: ago(25), tool: 'remember', summary: 'Noted: Prefers trains to planes', status: 'done', undo: 'memory', ref: '6', chatId: '2' },
  { id: 2, at: ago(55), tool: 'step:click', summary: 'Step: Click Table › Freeze Header Rows', status: 'done', undo: 'none', chatId: '1' },
  { id: 1, at: ago(90), tool: 'open_url', summary: 'Opened https://en.wikipedia.org/wiki/Otter', status: 'denied', undo: 'none', chatId: '3' }
]

const sentSample: SentItem[] = [
  { id: 9, at: ago(2), kind: 'question', service: 'DeepSeek', host: 'api.deepseek.com', local: false, chatId: '1', what: 'Budget.csv · 1 key hidden', count: 2 },
  { id: 8, at: ago(2), kind: 'search', service: 'DeepSeek', host: 'api.deepseek.com', local: false, chatId: '1', what: 'rail pass prices 2026', count: 1 },
  { id: 7, at: ago(3), kind: 'page', service: 'jrailpass.com', host: 'jrailpass.com', local: false, chatId: '1', what: 'https://jrailpass.com/prices', count: 1 },
  { id: 6, at: ago(4), kind: 'title', service: 'DeepSeek', host: 'api.deepseek.com', local: false, chatId: '1', what: '', count: 1 },
  { id: 5, at: ago(30), kind: 'explain', service: 'DeepSeek', host: 'api.deepseek.com', local: false, what: 'rate limiting', count: 1 },
  { id: 4, at: ago(90), kind: 'job', service: 'DeepSeek', host: 'api.deepseek.com', local: false, chatId: '2', group: 'j1', what: 'Cheapest way from Hong Kong to Tokyo', count: 9 },
  { id: 3, at: ago(200), kind: 'search', service: 'Wikipedia and DuckDuckGo', host: 'wikipedia.org', local: false, chatId: '2', what: 'sea otter', count: 1 },
  { id: 2, at: ago(1500), kind: 'question', service: 'the model on this Mac', host: 'localhost:11434', local: true, chatId: '3', what: '1 highlight', count: 1 },
  { id: 1, at: ago(3000), kind: 'check', service: 'DeepSeek', host: 'api.deepseek.com', local: false, what: 'a test message', count: 1 }
]

/** What main would read for the Logbook (D-63); the real `logbook()` words it, so the preview shows main's own words. */
function logSources(): LogSources {
  const empty = scene === 'logbook-empty' || scene === 'home-quiet' || scene === 'home-first'
  const live = scene === 'logbook-running' || scene === 'logbook-paused' || scene === 'home-running' || scene === 'home-paused'
  return {
    now: Date.now(),
    jobs: empty ? [] : live ? [...jobSample, running, { ...running, id: 'j10', title: 'Ryokan near Kyoto station', lookups: 5, note: undefined }] : jobSample,
    held: scene === 'logbook-paused' || scene === 'home-paused',
    pausedUntil: scene === 'logbook-paused' || scene === 'home-paused' ? Date.now() + 3 * 3.6e6 : null,
    overCap: false,
    sent: empty ? [] : sentSample,
    changes: empty ? [] : changeSample,
    chats: new Map(saved.map((t) => [t.id, t.title])),
    cards: empty ? [] : [{ threadId: '1', heading: 'Add this to Reminders?' }]
  }
}

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

/** Every window part that listens, as the real preload has it: the chat and the health line both do (D-67 found one lost). */
const chatCbs = new Set<(e: ChatEvent) => void>()
const pressed = new Set<string>()
let openCb: ((p: PanelOpenPayload) => void) | null = null
const emit = (e: ChatEvent) => chatCbs.forEach((cb) => cb(e))

// The paperclip "picks" these: a PDF, a picture and one Otty turns away.
const thumb =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#8c9b6a"/><circle cx="40" cy="20" r="8" fill="#f3dcc2"/></svg>')
const mockFiles: Record<string, AttachResult> = {
  f1: { ok: true, file: { id: 'f1', name: 'Tenancy agreement 2026.pdf', kind: 'pdf', pages: 12 } },
  f2: { ok: true, file: { id: 'f2', name: 'IMG_0042.HEIC', kind: 'image', thumb } },
  f3: { ok: false, message: 'Otty can’t read this kind of file yet. Try a PDF, a Word document, a picture, a text file or code.' },
  f4: { ok: true, file: { id: 'f4', name: 'average.py', kind: 'code', lang: 'Python', lines: 13 } },
  f5: { ok: true, file: { id: 'f5', name: '.env', kind: 'code', lang: 'Settings', lines: 4, hidden: 2 } }
}
const names: Record<string, string> = { f1: 'Tenancy agreement 2026.pdf', f2: 'IMG_0042.HEIC', f3: 'Budget.numbers', f4: 'average.py', f5: '.env' }

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
// Main tells every window when settings change (`tellSettings`); the mock does the same so Pause shows its new state.
const settingsSeen = new Set<(s: typeof settings) => void>()
const api: OttyApi = {
  getSettings: async () => settings,
  saveSettings: async (u) => {
    const now = { ...Object.assign(settings, u) }
    for (const cb of settingsSeen) cb(now)
    return now
  },
  setDraft: () => {},
  setSetting: async (key, value) => ({ ...Object.assign(settings, { [key]: value }) }),
  settingsCounts: async () => ({ chats: 142, olderThan: { '30d': 23, '1y': 4, forever: 0 }, notes: 18, pebbles: scene === 'pouch-empty' ? 0 : POUCH_SAMPLE.length }),
  testConnection: async () => ({ ok: true, message: 'Connected to deepseek-flash! Otty is ready to help.' }),
  getPermissions: async () => ({ platform: 'darwin', accessibility: true, screen: scene === 'near' || scene === 'cap' }),
  openPermissionSettings: noop,
  relaunch: noop,
  // D-79: the feedback text as it would be copied; the log's lines come after the diagnostics, only when ticked.
  feedbackPreview: async (note, withLog) => ({
    text: withLog ? `${note}\n\n— Diagnostics —\nOtty 0.5.0 · macOS 26.1 · arm64\n\n— Log, last 24 hours —\n2026-11-18T09:00:00.000Z info Otty 0.5.0 started` : note,
    email: null
  }),
  sendFeedback: async (note) => {
    ;(window as any).__copied = note
    return { mailed: false }
  },
  openLogFolder: noop,
  // D-80: a free shortcut for a taken one (the sample's taken key is Command+Alt+Shift+Space, so this is free).
  suggestHotkey: async () => 'Alt+Shift+A',
  getDiagnostics: async () =>
    'Otty 0.5.0 · macOS 26.1 · arm64\nInstalled app: yes · in Applications: yes\nService: DeepSeek · model deepseek-flash · web deepseek\nAccessibility: yes · Screen Recording: yes · paused: no\n\nLast 2 log lines:\n2026-11-18T09:00:00.000Z info Otty 0.5.0 started\n2026-11-18T09:12:04.120Z warn Refused chat:send: argument 2 doesn’t fit',
  connections: async () => structuredClone(links),
  connect: async (req: ConnectRequest): Promise<ConnectResult> => {
    if (req.kind === 'mcp') {
      const view: ConnectionView = {
        id: `own-${links.connected.length + 1}`,
        kind: 'mcp',
        label: req.name,
        host: new URL(req.url).host,
        status: 'on',
        reads: `0 of 1 tools on · ${new URL(req.url).host}`,
        privacy: PRIVACY,
        tools: [{ name: 'search_issues', title: '', description: 'Finds issues by words.', on: false, readOnly: true, changed: false }]
      }
      links = { ...links, connected: [...links.connected, view] }
      return { ok: true, message: 'Added. Turn on the tools you want Otty to use.', view }
    }
    const view: ConnectionView = { id: req.kind, kind: req.kind, label: BUILT[req.kind].label, host: req.kind === 'canvas' ? 'canvas.nus.edu.sg' : '', status: 'on', reads: BUILT[req.kind].reads, privacy: PRIVACY, tools: [] }
    links = { ...links, connected: [...links.connected, view], offers: links.offers.filter((o) => o.kind !== req.kind) }
    return { ok: true, message: `${view.label} is connected.`, view }
  },
  cancelConnect: async () => {},
  setConnectionTool: async (id, tool, on) => {
    links = { ...links, connected: links.connected.map((c) => (c.id !== id ? c : { ...c, tools: c.tools.map((t) => (t.name === tool ? { ...t, on, changed: false } : t)) })) }
    return { ok: true, message: '' }
  },
  recheckConnection: async () => ({ ok: true, message: 'Still connected.' }),
  signInAgain: async () => ({ ok: true, message: 'Signed in again.' }),
  removeConnection: async (id) => {
    const gone = links.connected.find((c) => c.id === id)
    const back = gone && gone.kind !== 'mcp' && !links.offers.some((o) => o.kind === gone.kind) ? [...links.offers, offer(gone.kind)] : links.offers
    links = { ...links, connected: links.connected.filter((c) => c.id !== id), offers: back }
    return structuredClone(links)
  },
  getUsage: async () => ({
    days: 30,
    questions: 142,
    tokens: 1_840_000,
    searches: 37,
    pages: 21,
    jobs: 4,
    month: { questions: scene === 'cap' ? 312 : scene === 'near' ? 250 : 96, tokens: 1_200_000 },
    service: 'DeepSeek',
    usageUrl: 'https://platform.deepseek.com/usage',
    ...(settings.monthlyCap ? { cap: { ...settings.monthlyCap, used: scene === 'cap' ? 312 : scene === 'near' ? 250 : 96, over: scene === 'cap' } } : {})
  }),
  sendMessage: async (text, captures, opts) => fakeAnswer(text, captures, opts?.language, opts?.files),
  stop: noop,
  resetChat: async () => emit({ type: 'reset' }),
  listChats: async () => saved.map(({ id, title, app, updatedAt }, i) => ({ id, title, app, updatedAt, ...(i === 1 && scene === 'history' ? { draft: 'and what about the weekend fares?' } : {}) })),
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
  listActivity: async () => [],
  stopActivity: noop,
  answerActivity: noop,
  resumeActivity: noop,
  retryActivity: noop,
  openActivity: noop,
  seenActivity: noop,
  logbook: async (v, search) => logbook(logSources(), v, search),
  logbookEntry: async (id) => entryDetails(logSources(), id),
  // D-73: the Calendar, in memory. `calendar-empty` has nothing in the week; `calendar-note` has a connection that couldn't be read;
  // `calendar-loading` (and `-list`) is still reading one, so the skeleton stays (D-89).
  calendarRange: async (from, to) => {
    if (scene.startsWith('calendar-loading')) return new Promise<never>(() => {})
    if (scene === 'calendar-empty') return { items: [] }
    const items = calStore.filter((i) => i.start < to && i.end > from).map((i) => structuredClone(i))
    return scene === 'calendar-note' ? { items, note: GOOGLE_NOTE } : { items }
  },
  saveEvent: async (f) => {
    const item: CalendarItem = { id: f.id ?? `n${calStore.length + 1}`, title: f.title, start: f.start, end: f.end, allDay: f.allDay, notes: f.notes, madeBy: 'you', source: 'Otty', readOnly: false }
    calStore = [...calStore.filter((i) => i.id !== item.id), item]
    return structuredClone(item)
  },
  removeEvent: async (id) => {
    calStore = calStore.filter((i) => i.id !== id)
    return true
  },
  // D-77: the Pouch, in memory. `pouch-empty` has nothing kept.
  pouch: async () => (scene === 'pouch-empty' ? [] : pouchView()),
  setShelf: async (answerId, index, shelf) => {
    pouchStore = pouchStore.map((i) => (i.answerId === answerId && i.index === index ? { ...i, shelf: shelf ?? undefined } : i))
    return pouchView()
  },
  putBack: async (answerId, index) => {
    lastDropped = pouchStore.find((i) => i.answerId === answerId && i.index === index) ?? null
    pouchStore = pouchStore.filter((i) => !(i.answerId === answerId && i.index === index))
    return true
  },
  undoPutBack: async () => {
    if (lastDropped) pouchStore = [...pouchStore, lastDropped]
    lastDropped = null
    return true
  },
  forgetPouch: async () => {
    pouchStore = []
  },
  // D-66: main's own Home words, from the same samples as the Logbook.
  home: async () => home({ ...logSources(), events: [], remembered: true, webOff: false, service: 'DeepSeek', asked: scene !== 'home-first' }),
  undoChange: async () => true,
  noteJob: async () => true,
  hiddenLines: async () => ['OPENAI_API_KEY=sk-…3456', 'DB_PASSWORD="…"'],
  undoReceipt: async (answerId, at) => {
    const r = (receiptsSample.find((m) => m.id === answerId) as Extract<ChatMessage, { role: 'assistant' }> | undefined)?.receipts?.[at]
    if (r) emit({ type: 'receipt', id: answerId, at, receipt: { ...r, undone: true } })
    return Boolean(r)
  },
  rewindPlan: async () => ({
    undo: [
      { id: 'memory:a1:1', label: 'Forget “Is learning Spanish”' },
      { id: 'reminder:r1', label: 'Remove the reminder “Call mum”' },
      { id: 'job:j1', label: 'Stop looking into “Cheapest way from Hong Kong to Tokyo”' }
    ],
    lasting: ['Opened acme.cloud/pricing']
  }),
  rewind: async (_id, _undo, mode) => (mode === 'edit' ? { text: 'Explain this simply', captures: [{ id: 'c1', context: highlighted, app }], files: [] } : null),
  onActivity: () => () => {},
  onLogbook: () => () => {},
  onSettings: (cb) => (settingsSeen.add(cb), () => void settingsSeen.delete(cb)),
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
  exportDrawing: async (_d, how) => (how === 'copy' ? 'copied' : 'saved'),
  showDrawing: async (v) => {
    ;(window as any).__shown = v
  },
  viewerContent: async (): Promise<DrawingView | null> => {
    const d = await draw(scene === 'picture' ? 'mermaid' : 'slides', scene === 'picture' ? FLOW : DECK)
    if (d.kind === 'picture') return { kind: 'picture', dataUrl: d.dataUrl, width: d.width, height: d.height }
    if (d.kind === 'slides') return { kind: 'slides', pages: d.pages, notes: d.deck.slides.map((s) => s.notes) }
    return null
  },
  closeViewer: noop,
  closeQuick: noop,
  expandQuick: noop,
  quickResize: () => {},
  quickState: () => {},
  bubbleMenu: () => {},
  bubbleDrag: () => {},
  feedOtty: async () => {},
  feedOttyText: async () => {},
  keepPebble: async () => true,
  keptPebbles: async () => [],
  onChatEvent: (cb) => {
    chatCbs.add(cb)
    if (scene === 'proofread') setTimeout(() => cb({ type: 'load', messages: proofreadSample }), 50)
    if (scene === 'connect-card') setTimeout(() => cb({ type: 'load', messages: connectSample } as unknown as ChatEvent), 50)
    if (scene === 'steps') setTimeout(() => cb({ type: 'load', messages: stepsSample }), 50)
    if (scene === 'math') setTimeout(() => cb({ type: 'load', messages: mathSample }), 50)
    if (scene === 'code') setTimeout(() => cb({ type: 'load', messages: codeSample }), 50)
    if (scene === 'drawing') setTimeout(() => cb({ type: 'load', messages: drawingSample }), 50)
    if (scene === 'chart' || scene === 'cap' || scene === 'near') setTimeout(() => cb({ type: 'load', messages: chartSample }), 50)
    if (scene === 'memory') setTimeout(() => cb({ type: 'load', messages: memorySample }), 50)
    if (scene === 'noted') setTimeout(() => cb({ type: 'load', messages: notedSample }), 50)
    if (scene === 'receipts') setTimeout(() => cb({ type: 'load', messages: receiptsSample }), 50)
    if (cards[scene]) setTimeout(() => playCard(cb, cards[scene]), 50)
    // D-73: `calendar-edit` opens the card on Otty's first event once the week has loaded.
    if (scene === 'calendar-edit') setTimeout(() => clickWhenThere('.cal-block:not(.cal-block--ext)'), 400)
    // D-77: `pouch-card` opens the first stone; `pouch-search` searches "rain" and puts one back, so the Put back line shows.
    if (scene === 'pouch-card') setTimeout(() => clickWhenThere('.stone'), 400)
    if (scene === 'pouch-search') {
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>('.pouch-find input')
        if (!input) return
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'rain')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }, 400)
      setTimeout(() => clickWhenThere('.stone'), 700)
      setTimeout(() => clickWhenThere('.pouch-card__put'), 1000)
    }
    // D-62: an answer on its way, stopped, or failed in a way its card can help with.
    if (scene === 'thinking')
      setTimeout(() => {
        cb({ type: 'load', messages: askingSample })
        cb({ type: 'user', id: 'u2', text: 'And on Sunday?', captures: [], app: null })
        cb({ type: 'start', id: 'a2', language: 'en' })
        cb({ type: 'tool', id: 'a2', callId: 't1', label: 'Looking up “Tokyo Sendai last train Sunday”', icon: 'search', status: 'running' })
      }, 50)
    const ended: Record<string, Partial<Extract<ChatMessage, { role: 'assistant' }>>> = {
      stopped: { text: 'The last Hayabusa on a Saturday leaves Tokyo at 21:44 and', stopped: true },
      'failed-key': { text: '', error: 'Otty’s key doesn’t look right. Please check it in Settings.', errorKind: 'key' },
      'failed-long': { text: '', error: 'This chat has grown too long. Please start a new one.', errorKind: 'too-long' }
    }
    if (ended[scene]) setTimeout(() => cb({ type: 'load', messages: [...askingSample, { id: 'a1', role: 'assistant', language: 'en', tools: [], text: '', ...ended[scene] }] }), 50)
    // The rewind card opens from Try again on the last answer.
    if (scene === 'rewind') {
      setTimeout(() => cb({ type: 'load', messages: memorySample }), 50)
      // Once the chat has finished gliding to its end, so where the card settles never depends on timing, then pinned
      // to the end, as a person would see it after pressing Try again on the latest answer.
      setTimeout(() => document.querySelector<HTMLButtonElement>('button[title^="Ask the same question"]')?.click(), 600)
      setTimeout(() => {
        const chat = document.querySelector('.chat')
        chat?.scrollTo({ top: chat.scrollHeight })
      }, 750)
    }
    if (scene === 'chat' || scene === 'compose' || scene === 'find' || scene === 'paused' || scene.startsWith('frame-')) setTimeout(() => cb({ type: 'load', messages: sample }), 50)
    if (scene === 'typography') setTimeout(() => cb({ type: 'load', messages: typographySample }), 50)
    return () => void chatCbs.delete(cb)
  },
  onPanelOpen: (cb) => {
    openCb = cb
    if (scene === 'page') setTimeout(() => cb({ context: null, app }), 80)
    if (scene === 'compose' || scene === 'empty-compose' || scene === 'tray') setTimeout(() => cb({ context: highlighted, app }), 80)
    // Once only: StrictMode subscribes twice, and a second snip would land in the tray.
    if (scene === 'tray' && !trayed.panel) setTimeout(() => cb({ context: snip, app: terminal, add: true }), 160)
    trayed.panel = true
    if (scene.startsWith('settings') || scene === 'provider' || scene.startsWith('connections')) setTimeout(() => cb({ context: null, notice: 'open-settings' }), 80)
    // D-61: `&section=you|keys|privacy|usage|conn|help` opens a section; the other settings scenes set one up.
    const titles: Record<string, string> = { you: 'You & Otty', tiles: 'My tiles', keys: 'Shortcuts', privacy: 'Privacy', usage: 'Usage & limit', links: 'Connections', conn: 'Connection', help: 'Help' }
    const setUp: Record<string, string> = { 'settings-feedback': 'help', 'settings-retention': 'privacy', 'settings-recording': 'keys', 'settings-broken': 'conn', provider: 'conn', connections: 'links', 'connections-add': 'links', 'connections-mcp': 'links', 'connections-off': 'links' }
    const section = setUp[scene] ?? (titles[scene.replace('settings-', '')] ? scene.replace('settings-', '') : null)
    // React runs this twice in development, so each press happens once.
    // `exact` matches a section by its whole title: "Connection" is also the start of "Connections" (D-54).
    // Retries every 50 ms; a section waits up to 4 s, since CI's Mac can take more than a second to draw Settings.
    const press = (sel: string, text?: string, tries = 20, exact = false): void => {
      if (pressed.has(sel + text)) return
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => !text || (exact ? e.querySelector('.set-row__title')?.textContent === text : e.textContent?.includes(text)))
      if (!el) return void (tries && setTimeout(() => press(sel, text, tries - 1, exact), 50))
      pressed.add(sel + text)
      el.click()
    }
    if (section) setTimeout(() => press('.set-row--section', titles[section], 80, true), 160)
    if (scene === 'provider') setTimeout(() => press('.set-row', 'Change service or key'), 240)
    if (scene === 'settings-recording') setTimeout(() => press('.keys-btn'), 240)
    // D-54: the own connection's form with "A key or token" chosen, or Linear's detail open.
    if (scene === 'connections-add') setTimeout(() => (press('.set-row', 'Your own connection'), setTimeout(() => (() => { const s = document.querySelector<HTMLSelectElement>('select[aria-label="How it signs in"]'); if (s) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(s, 'token'); s.dispatchEvent(new Event('change', { bubbles: true })) } })(), 80)), 240)
    if (scene === 'connections-mcp') setTimeout(() => press('.set-row', 'Linear'), 240)
    // D-79: the feedback sheet open, with the log ticked, so the preview shows.
    if (scene === 'settings-feedback') setTimeout(() => (press('.set-row', 'Send feedback'), setTimeout(() => document.querySelector<HTMLInputElement>('.set-conn input[type="checkbox"]')?.click(), 240)), 240)
    if (scene === 'settings-retention')
      setTimeout(() => {
        const keep = document.querySelector<HTMLSelectElement>('select[aria-label="Keep chats for"]')
        if (!keep) return
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(keep, '30d')
        keep.dispatchEvent(new Event('change', { bubbles: true }))
      }, 320)
    if (scene === 'settings-find')
      setTimeout(() => {
        const box = document.querySelector<HTMLInputElement>('input[aria-label="Find a setting"]')
        if (!box) return
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, 'shortcut')
        box.dispatchEvent(new Event('input', { bubbles: true }))
      }, 160)
    if (scene === 'memories') setTimeout(() => cb({ context: null, notice: 'open-memory' }), 80)
    // D-63: the Logbook, on a view (`logbook-wait`…), with an entry open, or searched.
    if (scene.startsWith('logbook')) {
      setTimeout(() => cb({ context: null, notice: 'open-activity' }), 80)
      const names: Record<string, string> = { wait: 'Needs you', next: 'Coming up', sent: 'What left my Mac', changed: 'What Otty changed', noted: 'What Otty noted' }
      const v = names[scene.replace('logbook-', '')]
      if (v) setTimeout(() => (press('.log-head__menu'), setTimeout(() => press('.log-head__item', v), 60)), 200)
      if (scene === 'logbook-entry') setTimeout(() => press('.log-entry__open', 'Compare three laptops'), 260)
      const word = scene === 'logbook-search' ? 'rail' : scene === 'logbook-none' ? 'passport' : ''
      if (word)
        setTimeout(() => {
          const box = document.querySelector<HTMLInputElement>('input[aria-label="Search the Logbook"]')
          if (!box) return
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, word)
          box.dispatchEvent(new Event('input', { bubbles: true }))
        }, 200)
    }
    if (scene === 'frame-menu') setTimeout(() => press('.screen-menu__btn'), 200)
    if (scene === 'frame-pushed') setTimeout(() => (press('.screen-menu__btn'), setTimeout(() => press('.screen-menu__item', 'Chats'), 60)), 200)
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
  // Spec 13, Part 5: the pool's scenes set its mood or badge once it has rendered.
  onBubbleMood: (cb: (mood: BubbleMood) => void) => {
    const mood: BubbleMood = scene === 'pool-working' ? 'working' : scene === 'pool-waiting' ? 'waiting' : scene === 'pool-paused' ? 'paused' : null
    if (mood) setTimeout(() => cb(mood), 50)
    return () => {}
  },
  onBubbleBadge: (cb: (on: boolean) => void) => {
    if (scene === 'pool-answer') setTimeout(() => cb(true), 50)
    return () => {}
  },
  onWindowVisible: () => () => {},
  // D-65: `&state=roomy` draws the roomy window's header and traffic-light row.
  onWindowGlide: () => () => {},
  windowGlideReady: () => {},
  onWindowState: (cb) => {
    if (q.get('state') === 'roomy') setTimeout(() => cb('roomy'), 0)
    return () => {}
  },
  onFrameCommand: (cb) => {
    if (scene.startsWith('home')) setTimeout(() => cb('home'), 120)
    if (scene.startsWith('calendar')) setTimeout(() => cb('calendar'), 120)
    if (scene.startsWith('pouch')) setTimeout(() => cb('pouch'), 120)
    return () => {}
  },
  setWindowState: noop
}

;(window as any).otty = api
;(window as any).__otty = { emit, open: (p: PanelOpenPayload) => openCb?.(p) }

// Load the real renderer only once the mock is in place.
void import('../../src/renderer/src/main.tsx')
