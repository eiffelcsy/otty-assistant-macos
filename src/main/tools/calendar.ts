import { text, type Tool } from './types'

// D-73: adds an event to Otty's own calendar. The chat turn checks the times and asks first (`ChatSession.planEvent`),
// so this only describes the tool and hands the call over.

export const planEventTool: Tool = {
  offer: () => ({
    type: 'function',
    function: {
      name: 'plan_event',
      description:
        'Add an event to the user’s own Otty calendar, after they confirm on a card. Use it when they ask you to plan, block or schedule time. Times are in the user’s time zone.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short, like “Essay writing”' },
          start: { type: 'string', description: '“YYYY-MM-DDTHH:MM”, or “YYYY-MM-DD” for an all-day event' },
          end: { type: 'string', description: '“YYYY-MM-DDTHH:MM”, or “YYYY-MM-DD” for an all-day event. The end must be after the start.' },
          all_day: { type: 'boolean', description: 'True for an all-day event' },
          notes: { type: 'string', description: 'Optional, a line or two' }
        },
        required: ['title', 'start', 'end']
      }
    }
  }),
  label: (args) => ({ icon: 'calendar-plus', label: `Planning “${text(args, 'title')}”` }),
  undo: 'event',
  run: (args, ctx) => (ctx.planEvent ? ctx.planEvent(args) : { result: 'Planning isn’t available here.', status: 'error' })
}
