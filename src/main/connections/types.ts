import type { ConnectionKind, McpAuth } from '../../shared/types'

// D-54: what a connection is, as main keeps it. Never imports electron (D-45): `core.ts` plugs in the Mac's parts.

/** One tool of a connection of the user's own, pinned when it was turned on (decision 7 in DEVLOG's D-54). */
export interface SavedTool {
  /** The server's name for it. */
  name: string
  title: string
  /** The server's words, cut to 1,000 characters. Outside text. */
  description: string
  /** The input schema as JSON Schema, exactly as listed. Only this pinned copy is ever offered to the model. */
  schema: Record<string, unknown>
  /** True only when the server says `readOnlyHint: true`. */
  readOnly: boolean
  on: boolean
  /** `pinOf(name, description, schema)` when it was last turned on, or listed while off. */
  pin: string
  /** The server's tool no longer matches `pin`: it was turned off by itself and waits to be looked at. */
  changed?: boolean
}

/** What a connection keeps, in `settings.json` under `connections`. The secret is locked by the Keychain. */
export interface SavedConnection {
  /** 'apple' | 'google' | 'canvas' | 'notion' for a built-in (one of each); 'mcp-' + 12 hex for one of the user's own. */
  id: string
  kind: ConnectionKind
  label: string
  /** Canvas: the school's origin. Your own: the MCP address. */
  url?: string
  auth: McpAuth
  /** `Keychain.lock(JSON.stringify(Secret))`. Absent for Apple and for an own connection with no sign-in. */
  secret?: string
  /** Your own only. */
  tools?: SavedTool[]
  /** A sign-in ran out and refreshing failed: Settings says "Needs you" and its tools aren't offered. */
  expired?: boolean
  added: number
}

/** What a secret holds once unlocked. Only `store.ts` locks and unlocks it. */
export interface Secret {
  /** A pasted token, or an OAuth access token. */
  token?: string
  refresh?: string
  /** Epoch ms when `token` stops working. */
  expiresAt?: number
  /** MCP OAuth: the client the server registered for Otty, the PKCE verifier mid-sign-in, and the SDK's tokens. */
  client?: Record<string, unknown>
  verifier?: string
  tokens?: Record<string, unknown>
}

/** One calendar event from any source, already cut to what the model may see (no attendees, no notes). */
export interface CalendarEvent {
  title: string
  /** Epoch ms. */
  start: number
  end: number
  allDay: boolean
  location?: string
  /** The calendar's name, and where it came from. */
  calendar: string
  source: 'Apple Calendar' | 'Google Calendar'
}

export interface Reminder {
  title: string
  /** Epoch ms, when it has a due date. */
  due?: number
  list: string
}

/** Something due on Canvas. */
export interface CanvasItem {
  title: string
  course: string
  /** Epoch ms. */
  due?: number
  kind: string
  url?: string
}

export interface CanvasAnnouncement {
  title: string
  course: string
  posted: number
  /** Plain text, HTML stripped, cut to 1,500 characters. */
  message: string
}

export interface NotionHit {
  id: string
  title: string
  edited: number
  url?: string
}

/**
 * A failure with words fit for the form or the model. `kind` lets the caller react: `auth` marks a sign-in as run out
 * (or a token as wrong), `network` is "can't reach", `denied` is macOS saying no, `bad` is an answer Otty can't use.
 */
export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'network' | 'denied' | 'bad' | 'cancelled' = 'bad'
  ) {
    super(message)
  }
}

/** The display name of each built-in. */
export const KIND_LABEL: Record<Exclude<ConnectionKind, 'mcp'>, string> = {
  apple: 'Apple Calendar and Reminders',
  google: 'Google Calendar',
  canvas: 'Canvas',
  notion: 'Notion'
}

/** Limits from D-54, in one place. */
export const LIMITS = {
  calendarDays: 14,
  events: 50,
  reminders: 50,
  canvasDays: 30,
  canvasItems: 30,
  announcements: 10,
  notionHits: 10,
  notionWords: 4000,
  mcpChars: 20_000,
  connectMs: 20_000,
  callMs: 30_000,
  signInMs: 5 * 60_000
} as const
