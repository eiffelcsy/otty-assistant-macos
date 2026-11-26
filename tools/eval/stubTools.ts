import { AsyncLocalStorage } from 'node:async_hooks'
import type { ToolContext, ToolOutcome } from '../../src/main/tools'
import { needsCard } from '../../src/main/toolSafety'
import { connectionCard, searchCard } from '../../src/main/cards'

// Tools that reach the network or change the Mac are replaced, so the eval can run anywhere and records what was
// asked instead. Everything else (calculate) is the real thing.

export interface Scene {
  search?: string
  page?: string
  /** What the calendar returns (D-54). */
  calendar?: string
  /** What Notion returns for a page (D-54). */
  notion?: string
}

/** Each case's own scene. Cases run four at a time, so one shared variable let a case read another's page. */
const scenes = new AsyncLocalStorage<Scene>()
export const inScene = <T>(s: Scene, fn: () => Promise<T>): Promise<T> => scenes.run(s, fn)

const ok = (result: string): ToolOutcome => ({ result, status: 'done' })

/** Wraps the real tools module: same exports, with `runTool` stubbed for the tools that have outside effects. */
export function wrap<T extends { runTool: (name: string, args: Record<string, unknown>, ctx: ToolContext, callId?: string) => Promise<ToolOutcome> }>(real: T): T {
  return {
    ...real,
    runTool: async (name: string, args: Record<string, unknown>, ctx: ToolContext, callId?: string) => {
      const scene = scenes.getStore() ?? {}
      switch (name) {
        case 'search_web':
          // The real gate (D-41), before the stubbed network, so the eval sees the card the app would show.
          if (needsCard(name, ctx.taint) && !(await ctx.confirm(searchCard(typeof args.query === 'string' ? args.query : '', 'DeepSeek')))) return { result: 'The user declined.', status: 'denied' }
          return ok(scene.search ?? 'No results found.')
        case 'read_page':
          return ok(scene.page ?? 'The page is empty.')
        // D-54: connection reads are scripted too. Notion's search gate is the real one, as for search_web.
        case 'calendar_events':
          return ok(scene.calendar ?? 'No events in that time.')
        case 'calendar_free':
          return ok('No free time.')
        case 'reminders_due':
          return ok('No open reminders.')
        case 'canvas_due':
          return ok('Nothing due.')
        case 'canvas_announcements':
          return ok('No announcements.')
        case 'notion_search':
          if (needsCard(name, ctx.taint) && !(await ctx.confirm(connectionCard('Notion', 'Search', typeof args.query === 'string' ? args.query : '', true)))) return { result: 'The user declined.', status: 'denied' }
          return ok('- Trip plan (id 0123456789abcdef0123456789abcdef, edited Mon 1 Dec)')
        case 'notion_page':
          return ok(scene.notion ?? '# Untitled')
        case 'open_url':
          return ok(`Opened ${String(args.url)}`)
        case 'create_reminder':
          return ok('Reminder added.')
        // D-73: the card is the real gate; the eval only records the call.
        case 'plan_event':
          return ok(`Added “${String(args.title)}” to the calendar.`)
        case 'copy_to_clipboard':
          return ok('Copied.')
        default:
          return real.runTool(name, args, ctx, callId)
      }
    }
  }
}
