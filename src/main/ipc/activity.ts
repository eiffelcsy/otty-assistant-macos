import { getStored } from '../settings'
import { activity, chat, jobs, ledger, sentLog } from '../core'
import { handle } from './check'

/** Activity sends ids only; main looks up what each one is, so a window can't say what kind of thing it is (D-44). */
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
  handle('sent:list', () => sentLog().list())
  handle('actions:list', () => ledger().list())
}
