import { getStored } from '../settings'
import type { LogView } from '../../shared/types'
import { activity, chat, homeSources, jobs, logbookSources } from '../core'
import { home } from '../home'
import { entryDetails, logbook } from '../logbook'
import { handle } from './check'

/** The Logbook sends ids only; main looks up what each one is, so a window can't say what kind of thing it is (D-44). */
const find = async (id: string) => (await activity()).find((i) => i.id === id)

export function registerActivity(): void {
  handle('activity:list', () => activity())
  handle('activity:stop', async (_e, id: string) => {
    const item = await find(id)
    if (item) await (item.kind === 'job' ? jobs.stop(id) : chat.stopChat(id))
  })
  handle('activity:open', async (_e, id: string) => {
    const chatId = (await find(id))?.chatId
    if (!chatId) return
    const report = jobs.report(chatId)
    if (report && !getStored().rememberChats) chat.showThread(report)
    else await chat.open(chatId)
  })
  handle('activity:answer', (_e, id: string, allow: boolean) => jobs.answer(id, allow))
  handle('activity:retry', (_e, id: string) => jobs.retry(id))
  handle('activity:resume', (_e, id: string) => jobs.resume(id))
  handle('activity:seen', () => jobs.markSeen())
  // The Logbook (D-63): read-only words from main. Undo and notes take an id, and main finds what it names.
  handle('logbook:get', async (_e, view: LogView, search: string) => logbook(await logbookSources(), view, search))
  handle('logbook:entry', async (_e, id: string) => entryDetails(await logbookSources(), id))
  handle('logbook:undo', (_e, id: string) => (id.startsWith('act:') ? chat.undoChange(Number(id.slice(4))) : false))
  handle('logbook:note', (_e, id: string, text: string) => jobs.note(id, text))
  // Home (D-66): one read-only query, worded in main; its buttons use the channels above, by id.
  handle('home:get', async () => home(await homeSources()))
}
