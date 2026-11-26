// D-66: Home's one read-only query. The status sentence follows Spec 06's priority; Needs you is the Logbook's own
// view; today's ticks come in order and fold past six; what left the Mac is counted from the logs.
import { describe, expect, it } from 'vitest'
import type { CalendarItem, SentItem, Words } from '../../../shared/types'
import type { Job } from '../../jobs/types'
import type { ActionRow } from '../../ledger'
import { logbook } from '../../logbook'
import { greeting, home, leftWords, statusLine, type HomeSources } from '..'

const NOW = new Date(2026, 10, 19, 15, 0).getTime()
const H = 3_600_000
const job = (over: Partial<Job>): Job => ({ id: 'j', title: 'Train times', brief: 'b', status: 'done', seedUrls: [], denied: [], language: 'en', rounds: 1, lookups: 3, workedMs: 0, partial: false, createdAt: NOW - 2 * H, updatedAt: NOW - H, ...over })
const sent = (over: Partial<SentItem>): SentItem => ({ id: 1, at: NOW - H, kind: 'search', service: 'DeepSeek', host: 'api.deepseek.com', local: false, what: 'q', count: 1, ...over })
const act = (over: Partial<ActionRow>): ActionRow => ({ id: 1, at: NOW - H, tool: 'create_reminder', chatId: 'c1', summary: 'Reminder added', undo: 'reminder', ref: 'R1', status: 'done', ...over })

function sources(over: Partial<HomeSources> = {}): HomeSources {
  return { now: NOW, jobs: [], held: false, pausedUntil: null, overCap: false, sent: [], changes: [], chats: new Map([['c1', 'Trip']]), cards: [], remembered: true, webOff: false, service: 'DeepSeek', asked: true, events: [], ...over }
}
const plain = (w: Words) => w.map((p) => p.text).join('')

describe('the status sentence (Spec 06)', () => {
  it('goes paused, needs you, working, due today, then nothing', () => {
    const due = job({ id: 'd', title: 'the visa page', status: 'scheduled', dueAt: NOW + 3 * H })
    expect(statusLine(sources({ held: true }), 2)).toBe('Otty is paused. Nothing runs on its own.')
    expect(statusLine(sources({ jobs: [due] }), 1)).toMatch(/^One thing needs you\. Next: the visa page at /)
    expect(statusLine(sources(), 2)).toBe('Two things need you.')
    expect(statusLine(sources({ jobs: [job({ status: 'working' })] }), 0)).toBe('Looking into Train times now.')
    expect(statusLine(sources({ jobs: [due] }), 0)).toMatch(/^Next: the visa page at /)
    expect(statusLine(sources(), 0)).toBe('Nothing needs you. Ask me anything.')
  })

  it('greets by the Mac’s clock', () => {
    expect(greeting(new Date(2026, 0, 1, 9).getTime())).toBe('Good morning')
    expect(greeting(new Date(2026, 0, 1, 15).getTime())).toBe('Good afternoon')
    expect(greeting(new Date(2026, 0, 1, 2).getTime())).toBe('Good evening')
  })

  it('dates the cove’s greeting with the weekday, day and month, and no time (Spec 07)', () => {
    const date = home(sources()).date
    expect(date).toMatch(/Thursday/)
    expect(date).toMatch(/19/)
    expect(date).toMatch(/November/)
    expect(date).not.toMatch(/\d:\d/)
  })
})

describe('Needs you', () => {
  it('is the Logbook’s own Needs you, oldest first, three at most, with the card’s words', () => {
    const s = sources({
      jobs: [1, 2, 3, 4].map((n) => job({ id: `w${n}`, title: `Look ${n}`, status: 'waiting', waitUrl: `https://site${n}.example/`, updatedAt: NOW - n * H }))
    })
    const page = home(s)
    expect(page.needs.total).toBe(logbook(s, 'wait').views.find((v) => v.view === 'wait')!.count)
    expect(page.needs.items.map((i) => i.id)).toEqual(['job:w4', 'job:w3', 'job:w2'])
    expect(page.needs.items[0].actions.map((a) => a.label)).toEqual(['Read it', 'Skip'])
    expect(page.needs.items[0].subject).toBe('https://site4.example/')
  })

  it('a chat waiting offers Go to chat', () => {
    const page = home(sources({ cards: [{ threadId: 'c1', heading: 'Add this to Reminders?' }] }))
    expect(page.needs.items[0]).toMatchObject({ question: 'Waiting: Add this to Reminders?', actions: [{ kind: 'open', label: 'Go to chat' }], chatId: 'c1' })
  })
})

describe('Today and Looking after', () => {
  it('orders today’s ticks by time, marks the running one now, and folds the earliest done past six', () => {
    const jobs = [
      ...[1, 2, 3, 4, 5, 6].map((n) => job({ id: `d${n}`, title: `Done ${n}`, createdAt: NOW - (8 - n) * H / 2 })),
      job({ id: 'run', title: 'Running', status: 'working', createdAt: NOW - 10 * 60_000 }),
      job({ id: 'later', title: 'Later', status: 'scheduled', dueAt: NOW + 2 * H })
    ]
    const t = home(sources({ jobs })).today
    expect(t.folded).toBe(2)
    expect(t.ticks.map((x) => x.state)).toEqual(['done', 'done', 'done', 'done', 'now', 'next'])
    expect(t.ticks.find((x) => x.state === 'now')).toMatchObject({ time: 'now', sub: expect.stringMatching(/^Page /) })
  })

  it('looks after what’s planned beyond today and what repeats, soonest first, four at most', () => {
    const jobs = [
      job({ id: 's', title: 'Every Monday', status: 'scheduled', dueAt: NOW + 5 * 24 * H, repeat: { every: 'week', day: 1 } }),
      job({ id: 't', title: 'Tomorrow', status: 'scheduled', dueAt: NOW + 20 * H }),
      job({ id: 'today', title: 'Later today', status: 'scheduled', dueAt: NOW + H })
    ]
    const a = home(sources({ jobs })).after
    expect(a.items.map((x) => x.title)).toEqual(['Tomorrow', 'Every Monday'])
    expect(a.items[1]).toMatchObject({ repeat: true, when: expect.stringMatching(/^every Monday at /) })
  })
})

describe('what left your Mac', () => {
  it('counts today’s searches, pages, questions and changes', () => {
    const s = sources({
      sent: [sent({ id: 1 }), sent({ id: 2, kind: 'page', count: 1 }), sent({ id: 3, kind: 'question' }), sent({ id: 4, kind: 'search', at: NOW - 30 * H })],
      changes: [act({}), act({ id: 2, undo: 'none', ref: undefined })]
    })
    expect(plain(leftWords(s))).toBe('Today, 1 search and 1 page left your Mac, and 1 question went to DeepSeek. 2 changes, 1 can’t be undone.')
  })

  it('says nothing left, since Otty opened with chats not remembered, and that everything stayed with the web off', () => {
    expect(plain(leftWords(sources()))).toBe('Nothing has left your Mac today.')
    expect(plain(leftWords(sources({ remembered: false })))).toBe('Nothing has left your Mac since Otty opened.')
    expect(plain(leftWords(sources({ webOff: true })))).toBe('Everything stayed on your Mac today.')
  })
})

it('offers things to try only until the first question', () => {
  expect(home(sources({ asked: false })).firstRun).toBe(true)
  expect(home(sources()).firstRun).toBe(false)
})

describe('today’s events (D-73, Spec 11 Part 7)', () => {
  const event = (over: Partial<CalendarItem>): CalendarItem => ({ id: 'e1', title: 'Essay', start: NOW - H / 2, end: NOW + H / 2, allDay: false, source: 'Otty', readOnly: false, ...over })

  it('shows an event on now as a now tick, and one that has ended as done', () => {
    const page = home(sources({ events: [event({}), event({ id: 'e2', title: 'Standup', start: NOW - 3 * H, end: NOW - 2 * H })] }))
    expect(page.today.ticks.find((t) => t.id === 'event:e1')).toMatchObject({ state: 'now', title: 'Essay', time: expect.any(String) })
    expect(page.today.ticks.find((t) => t.id === 'event:e2')).toMatchObject({ state: 'done' })
  })

  it('shows an event before it starts as next, and an all-day event as All day', () => {
    const page = home(sources({ events: [event({ id: 'later', title: 'Gym', start: NOW + H, end: NOW + 2 * H }), event({ id: 'day', title: 'Trip', allDay: true, start: NOW - 5 * H, end: NOW + 20 * H })] }))
    expect(page.today.ticks.find((t) => t.id === 'event:later')).toMatchObject({ state: 'next' })
    expect(page.today.ticks.find((t) => t.id === 'event:day')).toMatchObject({ time: 'All day', state: 'now' })
  })

  it('gives a connected event its calendar as the sub line, and Otty’s own none', () => {
    const page = home(sources({ events: [event({ id: 'a', title: 'Lunch', source: 'Apple Calendar', calendar: 'Home', readOnly: true }), event({})] }))
    expect(page.today.ticks.find((t) => t.id === 'event:a')).toMatchObject({ sub: 'Home', title: 'Lunch' })
    expect(page.today.ticks.find((t) => t.id === 'event:e1')).not.toHaveProperty('sub')
  })

  it('orders events with the jobs by time', () => {
    const page = home(sources({ jobs: [job({ id: 'w', title: 'Train times', status: 'working', createdAt: NOW - 2 * H, updatedAt: NOW - H })], events: [event({ id: 'e', start: NOW + H, end: NOW + 2 * H, title: 'Gym' })] }))
    expect(page.today.ticks.map((t) => t.id)).toEqual(['job:w', 'event:e'])
  })
})
