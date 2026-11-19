import { AsyncLocalStorage } from 'node:async_hooks'
import type { ToolContext, ToolOutcome } from '../../src/main/tools'
import { needsCard } from '../../src/main/toolSafety'
import { searchCard } from '../../src/main/cards'

// Tools that reach the network or change the Mac are replaced, so the eval can run anywhere and records what was
// asked instead. Everything else (calculate) is the real thing.

export interface Scene {
  search?: string
  page?: string
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
        case 'open_url':
          return ok(`Opened ${String(args.url)}`)
        case 'create_reminder':
          return ok('Reminder added.')
        case 'copy_to_clipboard':
          return ok('Copied.')
        default:
          return real.runTool(name, args, ctx, callId)
      }
    }
  }
}
