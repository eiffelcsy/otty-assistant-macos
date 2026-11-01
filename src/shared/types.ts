// Types shared by main, preload and renderer. Type-only: no runtime code here.

export type ScreenContext =
  | { kind: 'text'; text: string }
  /** `dataUrl` is empty for snips in saved chats: pictures are never written to disk. */
  | { kind: 'image'; dataUrl: string; width: number; height: number }

/** The app the user was working in when they asked. `url` has its query and fragment stripped. */
export interface AppInfo {
  name: string
  title?: string
  url?: string
}

export interface PublicSettings {
  hasApiKey: boolean
  baseUrl: string
  model: string
  thinking: boolean
  showBubble: boolean
  askHotkey: string
  snapHotkey: string
  onboarded: boolean
  /** Send the frontmost app's name, window title and page address with each question. */
  shareAppContext: boolean
  /** Save chats (text only) to disk so they show under Recent chats. */
  rememberChats: boolean
}

export interface SettingsUpdate extends Partial<Omit<PublicSettings, 'hasApiKey'>> {
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
}

/** A finished message as the UI shows it. Saved chats store these, so reopening one needs no model call. */
export type ChatMessage =
  | { id: string; role: 'user'; text: string; context: ScreenContext | null; app: AppInfo | null }
  | { id: string; role: 'assistant'; text: string; tools: ToolChipInfo[]; error?: string }

export interface ChatSummary {
  id: string
  title: string
  app?: string
  updatedAt: number
}

/** Events streamed from main to the panel and quick view. Both windows render the conversation from these. */
export type ChatEvent =
  | { type: 'reset' }
  /** A saved chat was reopened: replace everything shown with these messages. */
  | { type: 'load'; messages: ChatMessage[] }
  | { type: 'user'; id: string; text: string; context: ScreenContext | null; app: AppInfo | null }
  | { type: 'start'; id: string }
  | { type: 'delta'; id: string; text: string }
  | ({ type: 'tool'; id: string } & ToolChipInfo)
  | { type: 'confirm'; id: string; confirmId: string; title: string; detail: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string }

/** Pushed to the panel when it is opened via hotkey/bubble with fresh context. */
export interface PanelOpenPayload {
  context: ScreenContext | null
  /** Set (possibly to null) whenever Otty looked at the frontmost app; absent when it didn't. */
  app?: AppInfo | null
  notice?: string
}

export interface OttyApi {
  getSettings(): Promise<PublicSettings>
  saveSettings(update: SettingsUpdate): Promise<PublicSettings>
  testConnection(): Promise<{ ok: boolean; message: string }>
  getPermissions(): Promise<Permissions>
  openPermissionSettings(kind: PermissionKind): Promise<void>

  /** `fresh` starts a new conversation first (used by the quick view); the old one stays in Recent chats. */
  sendMessage(text: string, context: ScreenContext | null, opts?: { app?: AppInfo | null; fresh?: boolean }): Promise<void>
  stop(): Promise<void>
  resetChat(): Promise<void>
  listChats(): Promise<ChatSummary[]>
  openChat(id: string): Promise<void>
  deleteChat(id: string): Promise<void>
  clearChats(): Promise<void>
  respondConfirm(confirmId: string, allow: boolean): Promise<void>
  explain(term: string, around: string): Promise<string>

  captureSelection(): Promise<PanelOpenPayload>
  captureScreenshot(): Promise<PanelOpenPayload>
  closePanel(): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>

  closeQuick(): Promise<void>
  /** Hide the quick view and continue the same conversation in the full panel. */
  expandQuick(): Promise<void>
  /** Quick view reports its content height so main can size (and first reveal) the window. */
  quickResize(height: number): void

  bubbleMenu(): void
  /** mousedown → 'start', mouseup → 'end'. Main treats an 'end' with no movement as a click. */
  bubbleDrag(phase: 'start' | 'end'): void

  onChatEvent(cb: (e: ChatEvent) => void): () => void
  onPanelOpen(cb: (p: PanelOpenPayload) => void): () => void
  onQuickOpen(cb: (p: PanelOpenPayload) => void): () => void
  onBubbleState(cb: (s: BubbleState) => void): () => void
  /** True while an answer is waiting that the user hasn't seen. */
  onBubbleBadge(cb: (on: boolean) => void): () => void
}
