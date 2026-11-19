// D-63: the Logbook's one read-only query. Each view holds the right sources, in order, grouped by day, worded in main;
// search is plain matching that never sends anything, and masked text stays masked.
import { describe, expect, it } from 'vitest'
import type { SentItem } from '../../../shared/types'
import type { Job } from '../../jobs/types'
import type { ActionRow } from '../../ledger'
import { entryDetails, logbook, searchTerms, typicalPages, type LogSources } from '..'

const NOW = new Date(2026, 10, 19, 15, 0).getTime()
const H = 3_600_000
const DAY = 24 * H

const job = (over: Partial<Job>): Job => ({
  id: 'j1',
  title: 'Train times to Sendai',
  brief: 'secret brief words',
  status: 'done',
  seedUrls: [],
  denied: [],
  language: 'en',
  rounds: 2,
  lookups: 3,
  workedMs: 0,
  partial: false,
  createdAt: NOW - 2 * H,
  updatedAt: NOW - H,
  ...over
})

const sent = (over: Partial<SentItem>): SentItem => ({ id: 1, at: NOW - H, kind: 'search', service: 'DeepSeek', host: 'api.deepseek.com', local: false, what: 'Sendai shinkansen times', count: 1, ...over })
const act = (over: Partial<ActionRow>): ActionRow => ({ id: 1, at: NOW - H, tool: 'create_reminder', chatId: 'c1', answerId: 'a1', summary: 'Reminder added: Call mum', undo: 'reminder', ref: 'R1', status: 'done', ...over })

function sources(over: Partial<LogSources> = {}): LogSources {
  return { now: NOW, jobs: [], held: false, pausedUntil: null, overCap: false, sent: [], changes: [], chats: new Map([['c1', 'Trip plans']]), cards: [], ...over }
}

const lines = (s: LogSources, view: Parameters<typeof logbook>[1], q = '') =>
  logbook(s, view, q).days.flatMap((d) => d.entries.map((e) => e.first))

describe('logbook views', () => {
  const s = sources({
    jobs: [
      job({ id: 'done' }),
      job({ id: 'wait', title: 'Hotels', status: 'waiting', waitUrl: 'https://jreast.co.jp/en', updatedAt: NOW - 10 * 60_000 }),
      job({ id: 'soon', title: 'Weather', status: 'scheduled', dueAt: NOW + 2 * H }),
      job({ id: 'later', title: 'Prices', status: 'scheduled', dueAt: NOW + 3 * DAY }),
      job({ id: 'fail', title: 'Fares', status: 'failed', error: 'Otty lost its connection.', updatedAt: NOW - 3 * H })
    ],
    sent: [sent({ id: 7, group: 'done' }), sent({ id: 8, kind: 'question', what: 'Budget.xlsx · 1 key hidden', chatId: 'c1', at: NOW - 30 * 60_000 })],
    changes: [act({}), act({ id: 2, tool: 'remember', summary: 'Noted: likes window seats', undo: 'memory', ref: '9', at: NOW - 2 * H })],
    cards: [{ threadId: 'c1', heading: 'Read this page?' }]
  })

  it('Needs you: cards waiting, look-ups waiting or failed, nothing else', () => {
    expect(lines(s, 'wait')).toEqual(['Waiting: Read this page?', 'Waiting: read jreast.co.jp?', 'Couldn’t finish “Fares”'])
    expect(logbook(s, 'wait').days[0].entries[1]).toMatchObject({ tone: 'wait', strong: 'jreast.co.jp', action: { kind: 'decide', label: 'Decide' } })
  })

  it('Coming up: scheduled checks, soonest first, with their own time words', () => {
    const page = logbook(s, 'next')
    expect(page.days.flatMap((d) => d.entries.map((e) => [e.first, e.time]))).toEqual([
      ['Will look into “Weather”', 'in 2 h'],
      ['Will look into “Prices”', new Date(NOW + 3 * DAY).toLocaleDateString(undefined, { weekday: 'short' })]
    ])
    expect(page.subtitle).toBe('2 checks')
  })

  it('Everything: all four sources, newest first, by day, with counts', () => {
    const page = logbook(s, 'all')
    expect(page.days[0]).toMatchObject({ title: 'Today', count: '10 entries' })
    const ats = page.days[0].entries.map((e) => e.at)
    expect([...ats].sort((a, b) => b - a)).toEqual(ats)
    expect(page.views.find((v) => v.view === 'wait')?.count).toBe(3)
  })

  it('the Looking for… views keep to their own source', () => {
    expect(lines(s, 'sent')).toEqual(['Asked DeepSeek: Budget.xlsx · 1 key hidden', 'Searched DeepSeek for “Sendai shinkansen times”'])
    expect(lines(s, 'changed')).toEqual(['Reminder added: Call mum'])
    expect(lines(s, 'noted')).toEqual(['Noted: likes window seats'])
  })

  it('says what a search was part of, and offers Undo only where Otty can take it back', () => {
    const [search] = logbook(s, 'sent').days[0].entries.filter((e) => e.id === 'sent:7')
    expect(search.second).toBe('DeepSeek search · Train times to Sendai')
    const changes = sources({ changes: [act({}), act({ id: 3, undo: 'none', ref: undefined, summary: 'Copied.' }), act({ id: 4, undoneAt: NOW })] })
    expect(logbook(changes, 'changed').days[0].entries.map((e) => [e.action?.label, e.undone ?? false])).toEqual([
      ['Undo', false],
      [undefined, false],
      [undefined, true]
    ])
  })

  it('folds days older than yesterday in Everything only', () => {
    const old = sources({ sent: [sent({ id: 1, at: NOW - H }), sent({ id: 2, at: NOW - DAY }), sent({ id: 3, at: NOW - 4 * DAY })] })
    expect(logbook(old, 'all').days.map((d) => d.folded ?? false)).toEqual([false, false, true])
    expect(logbook(old, 'sent').days.every((d) => !d.folded)).toBe(true)
  })

  it('shows what’s running in Now, with real progress, and says Paused while held', () => {
    const running = sources({ jobs: [job({ id: 'd1', lookups: 4 }), job({ id: 'd2', lookups: 8 }), job({ id: 'run', status: 'working', lookups: 2, note: 'only JR East' })] })
    expect(logbook(running, 'all').now).toEqual([{ id: 'run', title: 'Train times to Sendai', line: 'Page 3 of about 6', done: 2, expected: 6, paused: false, note: 'only JR East' }])
    expect(lines(running, 'all')).not.toContain('Looking into “Train times to Sendai”')
    const held = logbook({ ...running, held: true, pausedUntil: NOW + H }, 'all')
    expect(held.now[0]).toMatchObject({ line: 'Paused', paused: true })
    expect(held.paused).toMatch(/^Otty is paused until today at /)
  })

  it('says what each empty view is for', () => {
    expect(logbook(sources(), 'wait').empty).toBe('Nothing needs you.')
    expect(logbook(sources(), 'next').empty).toContain('check this page again tomorrow at 9')
  })
})

describe('search', () => {
  const s = sources({ sent: [sent({ id: 1, kind: 'page', service: 'jreast.co.jp', host: 'jreast.co.jp', what: 'jreast.co.jp/en/timetable' }), sent({ id: 2, what: 'my CV.pdf', kind: 'question' })] })

  it('finds hosts and queries by their words, never by a model', () => {
    expect(lines(s, 'all', 'jreast')).toEqual(['Read jreast.co.jp/en/timetable'])
    const page = logbook(s, 'all', 'did my CV leave my Mac?')
    expect(page.title).toBe('“did my CV leave my Mac?”')
    expect(page.subtitle).toBe('1 entry')
  })

  it('drops words too common to search on, unless nothing else is left', () => {
    expect(searchTerms('did my CV leave my Mac?')).toEqual(['cv'])
    expect(searchTerms('my mac')).toEqual(['my', 'mac'])
  })

  it('says plainly when nothing matches, without claiming nothing happened', () => {
    const page = logbook(s, 'all', 'passport')
    expect(page.days).toEqual([])
    expect(page.empty).toBe('Nothing in the Logbook mentions “passport”.')
  })

  it('keeps masked text masked', () => {
    const masked = sources({ changes: [act({ summary: 'Copied [hidden key]' })] })
    expect(JSON.stringify(logbook(masked, 'all'))).toContain('[hidden key]')
  })
})

describe('entry details', () => {
  it('a waiting look-up: why, what it sent, part of, and Allow as the primary control', () => {
    const s = sources({
      jobs: [job({ id: 'w', status: 'waiting', waitUrl: 'https://jreast.co.jp/en', sourceThread: 'c1' })],
      sent: [sent({ id: 4, group: 'w' })]
    })
    const d = entryDetails(s, 'job:w')!
    expect(d.why).toBe('Your look-up “Train times to Sendai” found this page and needs your OK to read it.')
    expect(d.sent).toHaveLength(1)
    expect(d.partOf).toEqual({ label: 'Trip plans', chatId: 'c1' })
    expect(d.controls.map((c) => [c.kind, c.primary ?? false])).toEqual([
      ['allow', true],
      ['deny', false],
      ['stop', false]
    ])
    expect(d.waitUrl).toBe('https://jreast.co.jp/en')
    expect(JSON.stringify(d)).not.toContain('secret brief words')
  })

  it('a change: why, and Undo only while it can be undone', () => {
    expect(entryDetails(sources({ changes: [act({})] }), 'act:1')!.changes[0].action).toEqual({ kind: 'undo', label: 'Undo' })
    expect(entryDetails(sources({ changes: [act({ undoneAt: NOW })] }), 'act:1')!.changes[0]).toMatchObject({ note: 'Undone' })
    expect(entryDetails(sources(), 'act:1')).toBeNull()
    expect(entryDetails(sources(), 'nonsense')).toBeNull()
  })

  it('a paused look-up past the limit offers Run it anyway', () => {
    const d = entryDetails(sources({ overCap: true, jobs: [job({ status: 'paused', error: 'This month’s limit is reached.' })] }), 'job:j1')!
    expect(d.controls[0]).toEqual({ kind: 'resume', label: 'Run it anyway', primary: true })
  })
})

describe('typicalPages', () => {
  it('guesses from the last finished look-ups, six with none', () => {
    expect(typicalPages([])).toBe(6)
    expect(typicalPages([job({ lookups: 2 }), job({ lookups: 4 })])).toBe(3)
  })
})
