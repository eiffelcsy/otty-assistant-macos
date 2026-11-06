import type { ServiceId } from './services'

// Types shared by main, preload and renderer. Type-only: no runtime code here.

export type ScreenContext =
  | { kind: 'text'; text: string }
  /** `dataUrl` is empty for snips in saved chats: pictures are never written to disk. */
  | { kind: 'image'; dataUrl: string; width: number; height: number; wholeScreen?: boolean }

/** One highlight or snip, and the app it came from. A question can carry up to `MAX_CAPTURES`. */
export interface Capture {
  id: string
  context: ScreenContext
  app: AppInfo | null
}

export type FileKind = 'pdf' | 'docx' | 'image' | 'text'

/** A file the user added, before main has read it. Paths stay in main; the renderer gets an id. */
export interface PendingFile {
  id: string
  name: string
}

/** A file attached to a question. Main keeps what's inside; the renderer only sees this. */
export interface FileAttachment {
  id: string
  name: string
  kind: FileKind
  /** PDFs only. */
  pages?: number
  /** Set once sent, when only part of it fitted: "Otty read the first 40 of 120 pages." */
  note?: string
  /** A small preview for pictures. Never saved. */
  thumb?: string
}

export type AttachResult = { ok: true; file: FileAttachment } | { ok: false; message: string }

/** The app the user was working in when they asked. `url` has its query and fragment stripped. */
export interface AppInfo {
  name: string
  title?: string
  url?: string
  /** The address lost a query that matters, so `url` may not be the page the user sees. */
  trimmed?: boolean
}

/** The language an answer is written in. Keyed by language (not "Chinese") so zh-TW can slot in later. */
export type AnswerLanguage = 'en' | 'zh-HK'

/** A home language the user can pick under "My other language". */
export type HomeLanguage = Exclude<AnswerLanguage, 'en'>

/** Quick actions are ids: main turns each one into its prompt (and, for some, its language). */
export type QuickAction =
  | 'explain'
  | 'summarize'
  | 'translate'
  | 'next-step'
  | 'what-is'
  | 'read-text'
  | 'read-page'
  | 'proofread'
  /** "Explain the working" on an instant answer. */
  | 'working'
  | 'explain-home'
  | 'define'
  /** For attached documents. */
  | 'key-points'
  /** "Answer again in the other language": pair it with `language`. */
  | 'again'
  /** For several captures (or captures plus files). */
  | 'compare'
  | 'summarize-all'
  | 'explain-each'

export interface SendOptions {
  /** The app the user was in, for a question without captures (each capture carries its own). */
  app?: AppInfo | null
  /** Start a new conversation first (used by the quick view); the old one stays in Recent chats. */
  fresh?: boolean
  /** The pill's choice for this message only. Absent = Auto. */
  language?: AnswerLanguage
  action?: QuickAction
  /** Ids of files read with `readFile`, sent with this message. */
  files?: string[]
}

/** How long saved chats are kept, counted from their last message. */
export type KeepChats = '30d' | '1y' | 'forever'

/** Which API shape the server speaks. `auto` goes by the address, and OpenAI's is the default for an unknown one. */
export type ApiFormat = 'auto' | 'openai' | 'anthropic'

export interface PublicSettings {
  hasApiKey: boolean
  /** False for a service that works with no key, such as a local model. */
  needsKey: boolean
  /** Services with a key saved. Never the keys themselves. */
  savedKeys: ServiceId[]
  /** False when nothing may leave the Mac. */
  readsPages: boolean
  apiFormat: ApiFormat
  baseUrl: string
  model: string
  thinking: boolean
  showBubble: boolean
  askHotkey: string
  snapHotkey: string
  screenHotkey: string
  /** Shortcuts another app already owns, so they do nothing. */
  takenHotkeys: string[]
  onboarded: boolean
  /** Send the frontmost app's name, window title and page address with each question. */
  shareAppContext: boolean
  /** Save chats (text only) to disk so they show under Recent chats. */
  rememberChats: boolean
  keepChats: KeepChats
  /** "My other language". null = none, and Otty behaves as English-only. */
  homeLanguage: HomeLanguage | null
  /** "Let Otty learn about me". Off, nothing is learned or sent, and the list is kept. */
  learn: boolean
}

export interface SettingsUpdate extends Partial<Omit<PublicSettings, 'hasApiKey' | 'needsKey' | 'savedKeys' | 'readsPages' | 'takenHotkeys'>> {
  /** Plaintext key from the settings form; main encrypts it. Empty string clears it. */
  apiKey?: string
}

export interface Permissions {
  platform: string
  accessibility: boolean
  screen: boolean
}

export type PermissionKind = 'accessibility' | 'screen'

export type BubbleState = 'idle' | 'thinking' | 'happy'

export interface ToolChipInfo {
  callId: string
  label: string
  /** UIcon name (rounded set). Optional so chats saved before icons existed still load. */
  icon?: string
  status: 'running' | 'done' | 'denied' | 'error'
  /** What tapping the chip copies. */
  copy?: string
}

/** A finished message as the UI shows it. Saved chats store these, so reopening one needs no model call. */
export type ChatMessage =
  | {
      id: string
      role: 'user'
      text: string
      /** In the order they were added. Pictures are emptied in saved chats. */
      captures: Capture[]
      /** The app the user was in, when there are no captures. */
      app: AppInfo | null
      language?: AnswerLanguage
      files?: FileAttachment[]
      /** When it was sent (ms since epoch). Absent in chats saved before 0.4. */
      at?: number
    }
  | {
      id: string
      role: 'assistant'
      text: string
      tools: ToolChipInfo[]
      error?: string
      language?: AnswerLanguage
      /** When the answer started (ms since epoch). Absent in chats saved before 0.4. */
      at?: number
      memories?: MemoryNote[]
      /** An instant answer: worked out on the Mac, with no model call. */
      calc?: { expression: string; result: string }
    }

export type MemoryKind = 'about' | 'preference' | 'habit' | 'person' | 'goal'

/** How Otty learned it: said to remember, worked out from a chat, counted on the Mac, or typed in Settings. */
export type MemoryOrigin = 'told' | 'inferred' | 'observed' | 'settings'

/** Something Otty knows about the user. `text` is one plain sentence, written to be shown back to them. */
export interface Memory {
  id: number
  text: string
  kind: MemoryKind
  origin: MemoryOrigin
  /** Paused memories are kept but never sent. */
  status: 'active' | 'paused'
  confidence: number
  sourceChatId?: string
  createdAt: number
  updatedAt: number
  expiresAt?: number
}

/** The "Noted" line under an answer. It stays in the saved chat, so where a memory came from is never a mystery. */
export interface MemoryNote {
  memoryId: number
  text: string
  action: 'added' | 'updated' | 'forgotten'
  /** What Undo puts back: the old words, or the kind of a forgotten memory. */
  before?: string
  kind?: MemoryKind
  undone?: boolean
}

export interface ChatSummary {
  id: string
  title: string
  app?: string
  updatedAt: number
}

/** A chat found by a search. Backends return plain text; the renderer marks `ranges` itself. */
export interface ChatSearchHit {
  chatId: string
  title: string
  app?: string
  updatedAt: number
  /** The best-matching message, to scroll to. Absent when only the title matched. */
  messageId?: string
  /** About 120 characters around the match. `ranges` are [start, end) offsets into `text`. */
  snippet: { text: string; ranges: [number, number][] }
}

/** Events streamed from main to the panel and quick view. Both windows render the conversation from these. */
export type ChatEvent =
  | { type: 'reset' }
  /** A saved chat was reopened: replace everything shown with these messages. */
  | { type: 'load'; messages: ChatMessage[]; focusMessageId?: string; learn?: false }
  | ({ type: 'user' } & Omit<Extract<ChatMessage, { role: 'user' }>, 'role'>)
  | { type: 'start'; id: string; language?: AnswerLanguage }
  | { type: 'delta'; id: string; text: string }
  /** An instant answer, in place of any deltas. */
  | { type: 'calc'; id: string; expression: string; result: string }
  | ({ type: 'tool'; id: string } & ToolChipInfo)
  | { type: 'confirm'; id: string; confirmId: string; title: string; detail: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string }
  /** Otty saved, changed or forgot a memory, or Undo was pressed on one (`note.undone`). */
  | { type: 'memory'; id: string; note: MemoryNote }
  /** "Don't learn from this chat" changed. */
  | { type: 'learn'; on: boolean }

/** Pushed to the panel when it is opened via hotkey/bubble with fresh context. */
export interface PanelOpenPayload {
  context: ScreenContext | null
  /** Set (possibly to null) whenever Otty looked at the frontmost app; absent when it didn't. */
  app?: AppInfo | null
  notice?: string
  /** Add this capture to the tray instead of starting a new one: the window was already open. */
  add?: boolean
}

/** What the quick view tells main, so main knows whether a hotkey should add to it and whether a blur hides it. */
export interface QuickState {
  /** Captures shown, no question asked yet. */
  collecting: boolean
  /** "＋ Add more" was pressed: stay open while the user clicks into other apps. */
  pinned: boolean
}

/** A line of text found in a picture. `box` runs from 0 to 1 across the picture, from its top left. */
export interface OcrLine {
  text: string
  box: { x: number; y: number; w: number; h: number }
}

/** The picture in the Pick up text window, and the size to show it at. */
export interface PickupPicture {
  dataUrl: string
  width: number
  height: number
}

export interface OttyApi {
  getSettings(): Promise<PublicSettings>
  saveSettings(update: SettingsUpdate): Promise<PublicSettings>
  testConnection(): Promise<{ ok: boolean; message: string }>
  getPermissions(): Promise<Permissions>
  openPermissionSettings(kind: PermissionKind): Promise<void>

  sendMessage(text: string, captures: Capture[], opts?: SendOptions): Promise<void>
  stop(): Promise<void>
  resetChat(): Promise<void>
  listChats(): Promise<ChatSummary[]>
  /** Reopens a chat; `focusMessageId` scrolls to (and briefly highlights) that message. */
  openChat(id: string, focusMessageId?: string): Promise<void>
  searchChats(q: string): Promise<ChatSearchHit[]>
  deleteChat(id: string): Promise<void>
  clearChats(): Promise<void>
  respondConfirm(confirmId: string, allow: boolean): Promise<void>
  /** "Don't learn from this chat", for the open chat. */
  setChatLearn(on: boolean): Promise<void>
  listMemories(): Promise<Memory[]>
  addMemory(text: string): Promise<Memory[]>
  updateMemory(id: number, change: { text?: string; status?: Memory['status'] }): Promise<Memory[]>
  removeMemory(id: number): Promise<Memory[]>
  clearMemories(): Promise<void>
  /** Undo on the Noted line under an answer. */
  undoMemory(answerId: string, memoryId: number): Promise<void>
  /** Edit on the Noted line: Settings, at the list of what Otty knows. */
  openMemories(): Promise<void>
  /** Resolves to the explanation; with a home language it starts with a `中文：…` line. */
  explain(term: string, around: string, language?: AnswerLanguage): Promise<string>

  /** The native open dialog. */
  pickFiles(): Promise<PendingFile[]>
  /** Files dropped or pasted onto a window. */
  dropFiles(files: File[]): Promise<PendingFile[]>
  /** Reads a picked or dropped file. Resolves with a friendly message when it can't. */
  readFile(id: string): Promise<AttachResult>
  /** Forgets a file that won't be sent. */
  discardFile(id: string): Promise<void>

  captureSelection(): Promise<PanelOpenPayload>
  captureScreenshot(): Promise<PanelOpenPayload>
  closePanel(): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>

  /** Opens the Pick up text window for a picture. */
  pickUpText(dataUrl: string): Promise<void>
  pickupPicture(): Promise<PickupPicture | null>
  /** The words in the picture. Null if reading it failed. */
  pickupRead(): Promise<OcrLine[] | null>
  closePickup(): Promise<void>

  closeQuick(): Promise<void>
  /** Hide the quick view and continue the same conversation in the full panel. */
  expandQuick(): Promise<void>
  /** Quick view reports its content height so main can size (and first reveal) the window. */
  quickResize(height: number): void
  quickState(s: QuickState): void

  bubbleMenu(): void
  /** mousedown → 'start', mouseup → 'end'. Main treats an 'end' with no movement as a click. */
  bubbleDrag(phase: 'start' | 'end'): void

  onChatEvent(cb: (e: ChatEvent) => void): () => void
  onPanelOpen(cb: (p: PanelOpenPayload) => void): () => void
  onQuickOpen(cb: (p: PanelOpenPayload) => void): () => void
  onBubbleState(cb: (s: BubbleState) => void): () => void
  /** True while an answer is waiting that the user hasn't seen. */
  onBubbleBadge(cb: (on: boolean) => void): () => void
  /** Whether this window is on screen. */
  onWindowVisible(cb: (visible: boolean) => void): () => void
}
