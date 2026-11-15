import type { ToolOutcome } from '../../src/main/tools'

// Tools that reach the network or change the Mac are replaced, so the eval can run anywhere and records what was
// asked instead. Everything else (calculate) is the real thing.

export interface Scene {
  search?: string
  page?: string
}

let scene: Scene = {}
export const setScene = (s: Scene) => {
  scene = s
}

const ok = (result: string): ToolOutcome => ({ result, status: 'done' })

/** Wraps the real tools module: same exports, with `runTool` stubbed for the tools that have outside effects. */
export function wrap<T extends { runTool: (name: string, args: Record<string, unknown>, ctx: never) => Promise<ToolOutcome> }>(real: T): T {
  return {
    ...real,
    runTool: async (name: string, args: Record<string, unknown>, ctx: never) => {
      switch (name) {
        case 'search_web':
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
          return real.runTool(name, args, ctx)
      }
    }
  }
}
