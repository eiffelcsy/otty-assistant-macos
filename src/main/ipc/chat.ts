import type { AnswerLanguage, Capture, PanelOpenPayload, SendOptions } from '../../shared/types'
import { chatStore } from '../store'
import { discardFile, pickFiles, readFile, registerFiles } from '../files'
import { explainTerm } from '../llm'
import { hiddenLines } from '../hiddenLines'
import { memoryStore } from '../memory'
import { isSecret } from '../memory/guard'
import { chat, deleteChat, forgetAllChats, resetChat, stuckOnStep } from '../core'
import { getPanel, getQuick, showPanelByBubble } from '../windows'
import { BrowserWindow } from 'electron'
import { handle, on } from './check'

/** Recent chats shows this many; search reaches the rest. */
const RECENT_CHATS = 500

export function registerChat(): void {
  handle('chat:send', (_e, text: string, captures: Capture[], opts?: SendOptions) => {
    if (opts?.fresh) resetChat()
    void chat.send(text, captures, opts?.app ?? null, { language: opts?.language, action: opts?.action, files: opts?.files })
  })
  handle('chat:stop', () => chat.stop())
  handle('chat:reset', () => resetChat())
  handle('chat:confirm', (_e, id: string, allow: boolean) => chat.respondConfirm(id, allow))
  handle('chat:undo-receipt', (_e, answerId: string, at: number) => chat.undoReceipt(answerId, at))
  handle('chat:rewind-plan', (_e, id: string) => chat.rewindPlan(id))
  handle('chat:rewind', (_e, id: string, undo: string[], mode: 'retry' | 'edit') => chat.rewind(id, undo, mode))
  handle('chat:learn', (_e, on: boolean) => chat.setLearn(on))
  handle('chat:explain', (_e, term: string, around: string, language?: AnswerLanguage) => explainTerm(term, around, language ?? undefined))

  handle('chats:list', async () => (await chatStore().list({ limit: RECENT_CHATS })).map((c) => ({ ...c, ...(chat.draftOf(c.id) ? { draft: chat.draftOf(c.id) } : {}) })))
  on('chat:draft', (_e, text: string) => chat.setDraft(text))
  handle('chats:open', (_e, id: string, focusMessageId?: string) => chat.open(id, focusMessageId ?? undefined))
  handle('chats:search', (_e, q: string) => chatStore().search(q.slice(0, 200)))
  handle('chats:delete', (_e, id: string) => deleteChat(id))
  handle('chats:clear', () => forgetAllChats())

  handle('steps:run', (_e, answerId: string, index: number, sure?: boolean) => chat.runStep(answerId, index, sure === true))
  handle('steps:tick', (_e, answerId: string, index: number, done: boolean) => chat.tickStep(answerId, index, done))
  handle('steps:check', (_e, answerId: string, index: number) => stuckOnStep(answerId, index, true))
  handle('steps:stuck', (_e, answerId: string, index: number) => stuckOnStep(answerId, index))

  handle('memory:list', () => memoryStore().list())
  handle('memory:add', (_e, text: string) => {
    // Passwords, keys and codes are never kept, even typed here.
    if (text.trim() && !isSecret(text)) memoryStore().add({ text, origin: 'settings' })
    return memoryStore().list()
  })
  handle('memory:update', (_e, id: number, change: Record<string, unknown>) => {
    const text = typeof change.text === 'string' ? change.text : undefined
    const status = change.status === 'active' || change.status === 'paused' ? change.status : undefined
    if (text === undefined || (text.trim() && !isSecret(text))) memoryStore().update(id, { text, status })
    return memoryStore().list()
  })
  handle('memory:remove', (_e, id: number) => {
    memoryStore().remove(id)
    return memoryStore().list()
  })
  handle('memory:clear', () => memoryStore().clear())
  handle('memory:undo', (_e, answerId: string, memoryId: number) => chat.undoMemory(answerId, memoryId))
  handle('memory:open', () => {
    getQuick()?.hide()
    getPanel()?.webContents.send('panel:open', { context: null, notice: 'open-memory' } satisfies PanelOpenPayload)
    showPanelByBubble()
  })

  handle('files:pick', (e) => pickFiles(BrowserWindow.fromWebContents(e.sender)))
  handle('files:register', (_e, paths: unknown) => registerFiles(paths))
  handle('files:read', (_e, id: string) => readFile(id))
  handle('files:discard', (_e, id: string) => discardFile(id))
  handle('hidden:show', (_e, id: string) => hiddenLines(id))
}
