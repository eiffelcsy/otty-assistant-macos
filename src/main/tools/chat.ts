import { calculate } from '../math'
import { webOff } from './web'
import { text, type Tool, type ToolOutcome } from './types'

// Tools that work on the Mac with what the chat holds: sums, cards, charts, memories and jobs. Most reach the chat
// through `ToolContext`, so work that wasn't given a way (a job) simply can't use them.

const unavailable = (result: string): ToolOutcome => ({ result, status: 'error' })
const needsWeb = unavailable('Background work needs the web, which is off with this model.')

export const calculateTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Work out numbers exactly. Plan every number first and send all the steps in one call. Later steps can use names from earlier ones. Handles %, units ("38 degC to degF", "10 km to miles"), sqrt, round, abs, log, trig, min, max, mean, median, std and sum.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'In order, e.g. ["base = 2340 * 17.5%", "tax = base * 8%", "total = base + tax"]'
          }
        },
        required: ['steps']
      }
    }
  }),
  // Faster than a frame, so it appears already done.
  label: () => ({ icon: 'calculator', label: 'Calculated', show: 'after' }),
  async run(args) {
    const out = await calculate(args.steps)
    return { result: out.result, status: out.ok ? 'done' : 'error', ...(out.label ? { chip: { label: out.label, copy: out.value } } : {}) }
  }
}

export const showStepsTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'show_steps',
      description:
        'Show steps the user carries out on their Mac as a checklist, instead of a numbered list. Use it for 2 or more such steps. Give a step an action whenever one fits: the user presses a button and Otty does it for them.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What these steps get done' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'One short step' },
                action: {
                  type: 'object',
                  description:
                    '{kind:"paste",text,mode:"replace"|"insert"} pastes into the user’s app. {kind:"open",target} opens a web page, an app by name or a Settings pane (x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture). {kind:"menu",path:["File","Export To","PDF…"]} clicks a menu in their app. {kind:"keys",combo:"⌘⇧4"} presses a shortcut. {kind:"copy",text} copies.'
                }
              },
              required: ['text']
            }
          },
          replaces: { type: 'boolean', description: 'True to update the last card instead of adding one, after the user got stuck' }
        },
        required: ['title', 'steps']
      }
    }
  }),
  label: () => ({ icon: 'list-check', label: 'Steps', show: 'never' }),
  run: (args, ctx) => (ctx.showSteps ? ctx.showSteps(args) : unavailable('Steps can’t be shown here.'))
}

export const makeChartTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'make_chart',
      description:
        'Chart the user’s own data: a CSV or TSV they attached, or a table they highlighted. Otty adds up the rows itself and shows the chart; you only say what to chart. It returns the numbers it worked out: use only those in your answer, never your own. Not for made-up or general data (draw that with a mermaid block).',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Which table, by file name, when there is more than one' },
          chart: { type: 'string', enum: ['bar', 'line', 'pie'] },
          x: { type: 'string', description: 'The column the bars, points or slices are, exactly as named in the header' },
          y: { type: 'string', description: 'The column of numbers to add up. Leave it out to count rows.' },
          measure: { type: 'string', enum: ['sum', 'count', 'mean', 'min', 'max'], description: 'How to combine y within each group. Default sum.' },
          by: { type: 'string', enum: ['value', 'day', 'month', 'year'], description: 'When x holds dates, group them by day, month or year. Default value.' },
          title: { type: 'string' },
          top: { type: 'number', description: 'Most bars or slices to show' }
        },
        required: ['chart', 'x']
      }
    }
  }),
  label: () => ({ icon: 'chart-histogram', label: 'Worked out the chart', show: 'after' }),
  run: (args, ctx) => (ctx.makeChart ? ctx.makeChart(args) : unavailable('There’s no data to chart here.'))
}

/** `remember` and `forget` are only offered with "Let Otty learn about me" on, and shown as a Noted line. */
const learnLabel = () => ({ icon: 'notebook', label: 'Noted', show: 'never' as const })
const notLearning: ToolOutcome = { result: 'Otty isn’t learning here. Don’t say this was saved.', status: 'denied' }

export const rememberTool: Tool = {
  offer: ({ learn }) =>
    learn
      ? {
          type: 'function',
          function: {
            name: 'remember',
            description:
              'Save something lasting about the user: when they ask you to, or when they reveal something likely to matter in a month. Otty shows them what you saved, with an Undo.',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'One short plain sentence with no subject, e.g. "Is learning Spanish"' },
                kind: { type: 'string', enum: ['about', 'preference', 'person', 'goal'], description: 'Who they are, how they like answers, someone they mention, or what they’re working towards' },
                confidence: { type: 'number', description: 'From 0 to 1, how sure you are, when you worked it out yourself' },
                replaces: { type: 'number', description: 'The # of a memory this updates' },
                until: { type: 'string', description: 'For short-lived facts: when it stops being true, in ISO 8601' }
              },
              required: ['text']
            }
          }
        }
      : null,
  label: learnLabel,
  undo: 'memory',
  run: (args, ctx) => (ctx.learn ? ctx.learn.remember(args) : notLearning)
}

export const forgetTool: Tool = {
  offer: ({ learn }) =>
    learn
      ? {
          type: 'function',
          function: {
            name: 'forget',
            description: 'Delete a memory when the user says it’s wrong or asks you to forget it. Otty shows them, with an Undo.',
            parameters: {
              type: 'object',
              properties: { id: { type: 'number', description: 'The # of the memory' } },
              required: ['id']
            }
          }
        }
      : null,
  label: learnLabel,
  undo: 'memory',
  run: (args, ctx) => (ctx.learn ? ctx.learn.forget(args) : notLearning)
}

export const startJobTool: Tool = {
  offer: ({ web }) =>
    web === 'off'
      ? null
      : {
          type: 'function',
          function: {
            name: 'start_job',
            description:
              'Look into something big in the background, for questions that need many sources or a long comparison. The user is shown the brief and decides. The job only sees the brief, so put everything it needs in it, and nothing private.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words naming what’s being looked into' },
                brief: { type: 'string', description: 'What to find out, in full, standing on its own' }
              },
              required: ['title', 'brief']
            }
          }
        },
  label: (args) => ({ icon: 'lookup', label: `Looking into “${text(args, 'title', 'this')}”` }),
  undo: 'job',
  async run(args, ctx) {
    if (webOff()) return needsWeb
    return ctx.startJob ? await ctx.startJob(args) : unavailable('That isn’t available here.')
  }
}

export const scheduleJobTool: Tool = {
  offer: ({ web }) =>
    web === 'off'
      ? null
      : {
          type: 'function',
          function: {
            name: 'schedule_job',
            description:
              'Look something up later, when the user asks for it at a time ("check this tomorrow at 9", "every Monday at 9"). The user is shown the time and the brief and decides. The job only reads public web pages and leaves a note in the Logbook. It cannot send or change anything. Like start_job, it only sees the brief.',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'A few words naming what’s being checked' },
                brief: { type: 'string', description: 'What to find out, in full, standing on its own, with nothing private' },
                at: { type: 'string', description: 'When to look, in ISO 8601 local time, e.g. 2026-11-10T09:00:00. Work it out from the current local time in the user’s message. For a repeat, the first time.' },
                repeat: { type: 'string', enum: ['once', 'daily', 'weekdays', 'weekly'], description: 'Only when the user asks for it again and again ("every Monday"). Weekly repeats on the day of `at`.' }
              },
              required: ['title', 'brief', 'at']
            }
          }
        },
  label: (args) => ({ icon: 'alarm-clock', label: `Checking later: “${text(args, 'title', 'this')}”` }),
  undo: 'job',
  async run(args, ctx) {
    if (webOff()) return needsWeb
    return ctx.scheduleJob ? await ctx.scheduleJob(args) : unavailable('That isn’t available here.')
  }
}
