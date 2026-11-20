import { looksLikeCode } from './code'
import { parseTable } from './table'
import type { AppInfo, Capture, FileAttachment } from './types'

// My own tiles (D-56): a saved question with a name and an icon, shown for some kinds of capture. A tile is only ever
// a question, sent as if typed, so it can do nothing a typed question can't.

export const TILE_WHEN = ['any', 'text', 'code', 'picture', 'table', 'file', 'page'] as const
export type TileWhen = (typeof TILE_WHEN)[number]

export const WHEN_LABELS: Record<TileWhen, string> = {
  any: 'Anything',
  text: 'Highlighted text',
  code: 'Code',
  picture: 'A picture',
  table: 'A table',
  file: 'A file',
  page: 'A web page'
}

export const TILE_ICONS = ['sparkles', 'star', 'heart', 'bulb', 'graduation-cap', 'comment-alt', 'list-check', 'book-open-cover', 'language', 'pencil', 'envelope', 'smile', 'magic-wand', 'brain', 'calendar', 'briefcase', 'layers', 'paw'] as const

export const TILE_LIMITS = { tiles: 12, name: 30, prompt: 1000 } as const

export interface MyTile {
  id: string
  name: string
  icon: string
  prompt: string
  when: TileWhen
}

/** A tile main may keep: every field there and in bounds. */
export function validTile(x: unknown): x is MyTile {
  if (typeof x !== 'object' || x === null) return false
  const t = x as Record<string, unknown>
  const words = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
  return (
    words(t.id, 64) &&
    words(t.name, TILE_LIMITS.name) &&
    words(t.prompt, TILE_LIMITS.prompt) &&
    (TILE_ICONS as readonly unknown[]).includes(t.icon) &&
    (TILE_WHEN as readonly unknown[]).includes(t.when)
  )
}

export const validTiles = (x: unknown): x is MyTile[] => Array.isArray(x) && x.length <= TILE_LIMITS.tiles && x.every(validTile) && new Set(x.map((t) => t.id)).size === x.length

/** What's in the tray, in a tile's terms. Several things together count as "any" only. */
export function trayKinds(captures: Capture[], files: FileAttachment[], app?: AppInfo | null): Set<TileWhen> {
  const kinds = new Set<TileWhen>()
  if (captures.length + files.length > 1) return new Set(['any'])
  const c = captures[0]?.context
  if (c?.kind === 'image') kinds.add('picture')
  if (c?.kind === 'text') {
    if (looksLikeCode(c.text, captures[0].app?.name)) kinds.add('code')
    else if (parseTable(c.text, 'tile')) kinds.add('table')
    else kinds.add('text')
  }
  for (const f of files) kinds.add(f.kind === 'image' ? 'picture' : f.kind === 'code' || f.kind === 'notebook' ? 'code' : 'file')
  if (!captures.length && !files.length && app?.url && !app.trimmed) kinds.add('page')
  if (captures.length || files.length) kinds.add('any')
  return kinds
}

/** The user's tiles for this tray, in their order. */
export const tilesFor = (tiles: MyTile[], captures: Capture[], files: FileAttachment[], app?: AppInfo | null): MyTile[] => {
  const kinds = trayKinds(captures, files, app)
  return tiles.filter((t) => kinds.has(t.when))
}

/** The model's ```tile draft, made safe to show in the editor: anything off falls back, and the user saves it or not. */
export function draftTile(json: string): MyTile | null {
  let x: Record<string, unknown>
  try {
    x = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof x !== 'object' || x === null) return null
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const tile: MyTile = {
    id: crypto.randomUUID(),
    name: str(x.name, TILE_LIMITS.name),
    icon: (TILE_ICONS as readonly unknown[]).includes(x.icon) ? (x.icon as string) : 'sparkles',
    prompt: str(x.prompt, TILE_LIMITS.prompt),
    when: (TILE_WHEN as readonly unknown[]).includes(x.when) ? (x.when as TileWhen) : 'any'
  }
  return tile.prompt ? tile : null
}
