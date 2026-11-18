import { declined, hostOf, text, type Tool, type ToolOutcome } from './types'

// The tools that change something on the Mac. Each one's change is lasting (`toolSafety.ts`), so the ones the user
// didn't just watch happen ask first. They reach the Mac only through `ctx.mac`, which only a chat turn has.

const noHands: ToolOutcome = { result: 'That can’t be done here.', status: 'error' }

export const openUrlTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Open a web page in the user’s default browser. The user is asked to approve first.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Full http(s) URL' } },
        required: ['url']
      }
    }
  }),
  label: (args) => ({ icon: 'globe', label: `Opening ${hostOf(text(args, 'url'))}` }),
  async run(args, ctx) {
    const url = text(args, 'url')
    if (!/^https?:\/\//i.test(url)) return { result: 'Refused: only http(s) links can be opened.', status: 'error' }
    if (!ctx.mac) return noHands
    if (!(await ctx.confirm('Open this link?', url))) return declined
    await ctx.mac.open(url)
    return { result: `Opened ${url}`, status: 'done' }
  }
}

export const copyTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'copy_to_clipboard',
      description:
        'Put text on the user’s clipboard so they can paste it (e.g. a rewritten email). A Markdown table pastes as a real table in Word, Pages, Excel and Numbers.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The text to copy. For a table, a Markdown table with no code fence.' } },
        required: ['text']
      }
    }
  }),
  label: () => ({ icon: 'copy-alt', label: 'Copied to your clipboard' }),
  async run(args, ctx) {
    if (!ctx.mac) return noHands
    return { result: (await ctx.mac.copy(text(args, 'text'))) ? 'Copied as a real table, ready to paste.' : 'Copied.', status: 'done' }
  }
}

export const reminderTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'create_reminder',
      description: 'Add a reminder to Apple Reminders. The user is asked to approve first.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'What to remind the user about' },
          due: {
            type: 'string',
            description: 'Optional due date/time in ISO 8601 local time, e.g. 2026-10-31T17:00:00'
          }
        },
        required: ['title']
      }
    }
  }),
  label: (args) => ({ icon: 'alarm-clock', label: `Reminder: “${text(args, 'title')}”` }),
  async run(args, ctx) {
    const title = text(args, 'title').trim()
    const due = args.due ? new Date(text(args, 'due')) : null
    const when = due && !isNaN(+due) ? due : null
    const detail = when ? `${title} — ${when.toLocaleString()}` : title
    if (!ctx.mac) return noHands
    if (!(await ctx.confirm('Add this reminder?', detail))) return declined
    await ctx.mac.remind(title, when)
    return { result: `Reminder added: ${detail}`, status: 'done' }
  }
}
