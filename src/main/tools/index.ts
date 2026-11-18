import { getStored } from '../settings'
import { ToolPause } from '../pause'
import { begin } from '../ledger'
import { needsOnce, SAFETY, type ToolName } from '../toolSafety'
import { calculateTool, forgetTool, makeChartTool, rememberTool, scheduleJobTool, showStepsTool, startJobTool } from './chat'
import { copyTool, openUrlTool, reminderTool } from './mac'
import { readPageTool, searchWebTool, webSetup } from './web'
import type { Args, Setup, Tool, ToolContext, ToolDef, ToolLabel, ToolOutcome } from './types'

export type { MacHands, Setup, Tool, ToolContext, ToolDef, ToolLabel, ToolOutcome } from './types'

/**
 * Every tool, in the order the model is offered them. Keyed by `toolSafety.ts`'s names, so a tool can't exist without
 * its safety row, nor a row without its tool. The order is part of every request, so a new tool goes at the end of
 * its group, and an existing one never moves: DeepSeek's cache needs the tool list to repeat byte for byte.
 */
export const TOOLS = {
  search_web: searchWebTool,
  read_page: readPageTool,
  open_url: openUrlTool,
  copy_to_clipboard: copyTool,
  create_reminder: reminderTool,
  calculate: calculateTool,
  show_steps: showStepsTool,
  make_chart: makeChartTool,
  remember: rememberTool,
  forget: forgetTool,
  start_job: startJobTool,
  schedule_job: scheduleJobTool
} as const satisfies Record<ToolName, Tool>

const toolNamed = (name: string): Tool | undefined => (Object.hasOwn(TOOLS, name) ? TOOLS[name as ToolName] : undefined)

/** What decides which tools are offered right now. Read per request, so a settings change applies at once. */
function currentSetup(): Setup {
  return { web: webSetup(), learn: Boolean(getStored().learn) }
}

/** The tools offered to the model: the allowed ones this setup offers. */
export function toolDefs(allowed: ReadonlySet<string>, setup: Setup = currentSetup()): ToolDef[] {
  return Object.entries(TOOLS).flatMap(([name, tool]) => {
    const def = allowed.has(name) ? tool.offer(setup) : null
    return def ? [def] : []
  })
}

export function toolLabel(name: string, args: Args): ToolLabel {
  return toolNamed(name)?.label(args) ?? { icon: 'tools', label: name }
}

export async function runTool(name: string, args: Args, ctx: ToolContext, callId = ''): Promise<ToolOutcome> {
  if (!ctx.allowed.has(name)) return { result: `The tool ${name} isn't available here.`, status: 'error' }
  const tool = toolNamed(name)
  if (!tool) return { result: `Unknown tool ${name}`, status: 'error' }
  // A resumed job reruns its unanswered call, which may already have run before a restart.
  if (ctx.runId && needsOnce(name) && !(await ctx.claims?.claim(ctx.runId, callId))) return { result: 'This was already done once, so it wasn’t done again.', status: 'denied' }
  // D-46: a change is written down before it runs, and marked once it's done.
  if (SAFETY[name as ToolName].changes === 'nothing') return runOne(tool, args, ctx)
  const done = begin({ tool: name, ...ctx.cause, summary: tool.label(args).label, undo: tool.undo ?? 'none' })
  const out = await runOne(tool, args, ctx)
  done({ status: out.status === 'error' ? 'failed' : out.status, summary: out.result, ...(out.undo ? { ref: out.undo.ref, undoLabel: out.undo.label } : {}) })
  return out
}

async function runOne(tool: Tool, args: Args, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    return await tool.run(args, ctx)
  } catch (err) {
    if (err instanceof ToolPause) throw err
    return { result: `Tool failed: ${(err as Error).message}`, status: 'error' }
  }
}
