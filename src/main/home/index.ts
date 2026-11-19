import type { HomeAfter, HomeNeed, HomePage, HomeTick, LogControl, Words } from '../../shared/types'
import { repeatWords } from '../../shared/repeat'
import type { Job } from '../jobs/types'
import { entryDetails, needsYouEntries, typicalPages, type LogSources } from '../logbook'
import { clock, dayKey, plural } from '../logbook/words'

// Home (D-66, Spec 06): where Otty looks after you. One read-only query, every word chosen here, from the same sources
// as the Logbook: its Needs you view (so the two can't disagree), the job store for today and what's planned, and the
// sent log and ledger for what left the Mac. Pure, so it's tested without a Mac.

export interface HomeSources extends LogSources {
  /** With Remember my chats off the logs cover only this session. */
  remembered: boolean
  /** Nothing may leave the Mac (a local model with the web off). */
  webOff: boolean
  /** The AI service's name, for "6 questions went to DeepSeek". */
  service: string
  /** Has the user asked Otty anything, ever? Until then Home offers things to try. */
  asked: boolean
}

const NUMBERS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const counted = (n: number, one: string, many: string) => `${n < 10 ? NUMBERS[n] : n} ${n === 1 ? one : many}`

export function greeting(now: number): string {
  const h = new Date(now).getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening'
}

const today = (at: number | undefined, now: number) => at !== undefined && dayKey(at) === dayKey(now)

/** The jobs on Today's river: runs that started or finished today, and checks due later today. Never a series row. */
function todaysJobs(s: HomeSources): Job[] {
  return s.jobs.filter((j) => (j.status === 'scheduled' ? !j.repeat && today(j.dueAt, s.now) : today(j.updatedAt, s.now) || today(j.createdAt, s.now)))
}

/** What's due later today, soonest first. */
const dueToday = (s: HomeSources) =>
  s.jobs.filter((j) => j.status === 'scheduled' && j.dueAt && j.dueAt > s.now && today(j.dueAt, s.now)).sort((a, b) => a.dueAt! - b.dueAt!)

/** The one sentence on how things stand (Spec 06's priority table). */
export function statusLine(s: HomeSources, needs: number): string {
  if (s.held) return s.pausedUntil ? `Otty is paused until ${clock(s.pausedUntil)}. Nothing runs on its own.` : 'Otty is paused. Nothing runs on its own.'
  const next = dueToday(s)[0]
  const nextWords = next ? `Next: ${next.title} at ${clock(next.dueAt!)}.` : ''
  if (needs) return [`${counted(needs, 'thing needs you.', 'things need you.')}`, nextWords].filter(Boolean).join(' ')
  const running = s.jobs.filter((j) => j.status === 'working')
  if (running.length) return running.length === 1 ? `Looking into ${running[0].title} now.` : `Looking into ${counted(running.length, 'thing', 'things').toLowerCase()} now.`
  if (next) return nextWords
  return 'Nothing needs you. Ask me anything.'
}

/** The card's own words for a decision (Spec 01): Read it or Skip, rather than the Logbook's Allow. */
const BUTTON_WORDS: Partial<Record<LogControl['kind'], string>> = { allow: 'Read it', deny: 'Skip' }

function need(s: HomeSources, id: string, glyph: string, first: string, second: string, at: number): HomeNeed {
  const d = entryDetails(s, id)
  const actions = (d?.controls ?? []).filter((c) => c.kind !== 'stop').map((c) => ({ ...c, label: BUTTON_WORDS[c.kind] ?? c.label }))
  return {
    id,
    glyph,
    question: first,
    subject: d?.waitUrl ?? second,
    since: `since ${clock(at)}`,
    actions: id.startsWith('card:') ? [{ kind: 'open', label: 'Go to chat', primary: true }] : actions,
    ...(d?.partOf ? { chatId: d.partOf.chatId } : {})
  }
}

function ticks(s: HomeSources): { ticks: HomeTick[]; folded: number } {
  const expected = typicalPages(s.jobs)
  const all = todaysJobs(s)
    .map((j): HomeTick & { at: number } => {
      const at = j.status === 'scheduled' ? j.dueAt! : j.createdAt
      const title = j.title
      const state: HomeTick['state'] = j.status === 'working' ? 'now' : j.status === 'failed' ? 'failed' : j.status === 'done' ? 'done' : 'next'
      const text: Words =
        state === 'done'
          ? [{ text: title, strong: true }, { text: ', looked into' }]
          : state === 'now'
            ? [{ text: 'Looking into ' }, { text: title, strong: true }]
            : state === 'failed'
              ? [{ text: title, strong: true }]
              : [{ text: 'Will look into ' }, { text: title, strong: true }]
      const sub = state === 'now' ? `Page ${Math.min(j.lookups + 1, Math.max(expected, j.lookups + 1))} of about ${Math.max(expected, j.lookups + 1)}` : state === 'failed' ? 'Couldn’t finish' : undefined
      return { id: `job:${j.id}`, at, time: state === 'now' ? 'now' : clock(at), state, title, text, ...(sub ? { sub } : {}) }
    })
    .sort((a, b) => a.at - b.at)
  // More than six: the earliest finished ones fold into one "N earlier" tick.
  const done = all.filter((t) => t.state === 'done')
  const folded = all.length > 6 ? Math.min(done.length, all.length - 6) : 0
  const hidden = new Set(done.slice(0, folded).map((t) => t.id))
  return { ticks: all.filter((t) => !hidden.has(t.id)).map(({ at: _a, ...t }) => t), folded }
}

function after(s: HomeSources): HomeAfter[] {
  return s.jobs
    .filter((j) => j.status === 'scheduled' && j.dueAt && (j.repeat || !today(j.dueAt, s.now)))
    .sort((a, b) => a.dueAt! - b.dueAt!)
    .map((j) => ({
      id: `job:${j.id}`,
      title: j.title,
      when: j.repeat ? repeatWords(j.repeat, j.dueAt!) : new Date(j.dueAt!).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }),
      repeat: Boolean(j.repeat)
    }))
}

/** What left the Mac today, in one sentence of counts, never estimates (Spec 06). */
export function leftWords(s: HomeSources): Words {
  const sent = s.sent.filter((i) => today(i.at, s.now) && !i.local)
  const changes = s.changes.filter((r) => today(r.at, s.now) && r.status === 'done')
  const since = s.remembered ? 'today' : 'since Otty opened'
  if (!sent.length && !changes.length) return [{ text: s.webOff ? `Everything stayed on your Mac ${since}.` : `Nothing has left your Mac ${since}.` }]
  const n = (kind: string) => sent.filter((i) => i.kind === kind).reduce((t, i) => t + (kind === 'question' ? 1 : i.count), 0)
  const out: Words = []
  const web = [n('search') && plural(n('search'), 'search', 'searches'), n('page') && plural(n('page'), 'page')].filter(Boolean) as string[]
  if (web.length) {
    out.push({ text: s.remembered ? 'Today, ' : 'Since Otty opened, ' })
    web.forEach((w, i) => out.push(...(i ? [{ text: ' and ' }] : []), { text: w, strong: true }))
    out.push({ text: ' left your Mac' })
  }
  const asked = n('question') + n('job')
  if (asked) {
    out.push({ text: web.length ? ', and ' : s.remembered ? 'Today, ' : 'Since Otty opened, ' }, { text: plural(asked, 'question'), strong: true }, { text: ` went to ${s.service}` })
  }
  if (out.length) out.push({ text: '.' })
  if (changes.length) {
    const lasting = changes.filter((r) => r.undo === 'none' || !r.ref).length
    out.push(
      { text: out.length ? ' ' : '' },
      { text: plural(changes.length, 'change'), strong: true },
      { text: lasting ? `, ${lasting} can’t be undone.` : changes.length === 1 ? ', which can be undone.' : `, ${changes.length === 2 ? 'both' : 'all'} can be undone.` }
    )
  }
  return out.filter((w) => w.text)
}

export function home(s: HomeSources): HomePage {
  const waiting = needsYouEntries(s)
  const items = waiting.slice(0, 3).map((e) => need(s, e.id, e.glyph, e.first, e.second, e.at))
  const afterAll = after(s)
  const running = s.jobs.filter((j) => j.status === 'working')
  const expected = typicalPages(s.jobs)
  const now = running.length > 1
    ? [{ id: `job:${running[0].id}`, text: [{ text: plural(running.length, 'look-up'), strong: true }] as Words, paused: s.held }]
    : running.map((j) => ({
        id: `job:${j.id}`,
        text: [{ text: j.title, strong: true }, { text: s.held ? ' · Paused' : ` · ${Math.min(j.lookups + 1, Math.max(expected, j.lookups + 1))} of about ${Math.max(expected, j.lookups + 1)} pages` }] as Words,
        paused: s.held
      }))
  return {
    greeting: greeting(s.now),
    status: statusLine(s, waiting.length),
    now,
    needs: { items, total: waiting.length },
    today: { date: new Date(s.now).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }), ...ticks(s) },
    after: { items: afterAll.slice(0, 4), total: afterAll.length },
    left: leftWords(s),
    firstRun: !s.asked
  }
}
