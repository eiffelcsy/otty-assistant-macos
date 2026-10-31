// Types shared by main, preload and renderer. Type-only: no runtime code here.

export type ScreenContext =
  | { kind: 'text'; text: string; source?: string }
  | { kind: 'image'; dataUrl: string; width: number; height: number }

export interface PublicSettings {
  hasApiKey: boolean
  baseUrl: string
  model: string
  thinking: boolean
  showBubble: boolean
  askHotkey: string
  snapHotkey: string
  onboarded: boolean
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

/** Events streamed from main to the panel while answering. */
export type ChatEvent =
  | { type: 'start'; id: string }
  | { type: 'delta'; id: string; text: string }
  | { type: 'tool'; id: string; callId: string; label: string; status: 'running' | 'done' | 'denied' | 'error' }
  | { type: 'confirm'; id: string; confirmId: string; title: string; detail: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string }

/** Pushed to the panel when it is opened via hotkey/bubble with fresh context. */
export interface PanelOpenPayload {
  context: ScreenContext | null
  notice?: string
}

export interface OttyApi {
  getSettings(): Promise<PublicSettings>
  saveSettings(update: SettingsUpdate): Promise<PublicSettings>
  testConnection(): Promise<{ ok: boolean; message: string }>
  getPermissions(): Promise<Permissions>
  openPermissionSettings(kind: PermissionKind): Promise<void>

  sendMessage(text: string, context: ScreenContext | null): Promise<void>
  stop(): Promise<void>
  resetChat(): Promise<void>
  respondConfirm(confirmId: string, allow: boolean): Promise<void>
  explain(term: string, around: string): Promise<string>

  captureSelection(): Promise<PanelOpenPayload>
  captureScreenshot(): Promise<PanelOpenPayload>
  closePanel(): Promise<void>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>

  bubbleMenu(): void
  /** mousedown → 'start', mouseup → 'end'. Main treats an 'end' with no movement as a click. */
  bubbleDrag(phase: 'start' | 'end'): void

  onChatEvent(cb: (e: ChatEvent) => void): () => void
  onPanelOpen(cb: (p: PanelOpenPayload) => void): () => void
  onBubbleState(cb: (s: BubbleState) => void): () => void
}
