import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ChatEvent, OttyApi } from '../shared/types'

/** Which window typed a draft, so its own echo is skipped. Random per window, and never leaves the preload. */
const DRAFTS_FROM = Math.random().toString(36).slice(2)

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

/**
 * A capture can reach a window before its page has subscribed (a shortcut pressed just after launch), and an
 * ipcRenderer message with no listener is gone. The preload runs first, so it keeps such messages, a few at most,
 * and hands them to the first subscriber.
 */
const HELD = 4
const held = new Map<string, unknown[]>()
const subscribers = new Map<string, number>()
for (const channel of ['quick:open', 'panel:open']) {
  held.set(channel, [])
  ipcRenderer.on(channel, (_e, v: unknown) => {
    if (subscribers.get(channel)) return
    const waiting = held.get(channel)!
    waiting.push(v)
    if (waiting.length > HELD) waiting.shift()
  })
}

function listenHeld<T>(channel: string, cb: (v: T) => void): () => void {
  subscribers.set(channel, (subscribers.get(channel) ?? 0) + 1)
  const off = listen(channel, cb)
  const waiting = held.get(channel)!.splice(0) as T[]
  if (waiting.length) queueMicrotask(() => waiting.forEach(cb))
  return () => {
    subscribers.set(channel, (subscribers.get(channel) ?? 1) - 1)
    off()
  }
}

const api: OttyApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (u) => ipcRenderer.invoke('settings:save', u),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  settingsCounts: () => ipcRenderer.invoke('settings:counts'),
  testConnection: () => ipcRenderer.invoke('settings:test'),
  getPermissions: () => ipcRenderer.invoke('permissions:get'),
  openPermissionSettings: (kind) => ipcRenderer.invoke('permissions:open', kind),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  getDiagnostics: () => ipcRenderer.invoke('diagnostics:get'),

  sendMessage: (text, captures, opts) => ipcRenderer.invoke('chat:send', text, captures, opts),
  stop: () => ipcRenderer.invoke('chat:stop'),
  resetChat: () => ipcRenderer.invoke('chat:reset'),
  listChats: () => ipcRenderer.invoke('chats:list'),
  openChat: (id, focusMessageId) => ipcRenderer.invoke('chats:open', id, focusMessageId),
  searchChats: (q) => ipcRenderer.invoke('chats:search', q),
  deleteChat: (id) => ipcRenderer.invoke('chats:delete', id),
  clearChats: () => ipcRenderer.invoke('chats:clear'),
  respondConfirm: (id, allow) => ipcRenderer.invoke('chat:confirm', id, allow),
  undoReceipt: (answerId, at) => ipcRenderer.invoke('chat:undo-receipt', answerId, at),
  setDraft: (text) => ipcRenderer.send('chat:draft', text, DRAFTS_FROM),
  runStep: (answerId, index, sure) => ipcRenderer.invoke('steps:run', answerId, index, sure),
  tickStep: (answerId, index, done) => ipcRenderer.invoke('steps:tick', answerId, index, done),
  checkStep: (answerId, index) => ipcRenderer.invoke('steps:check', answerId, index),
  stuckOnStep: (answerId, index) => ipcRenderer.invoke('steps:stuck', answerId, index),
  listActivity: () => ipcRenderer.invoke('activity:list'),
  stopActivity: (item) => ipcRenderer.invoke('activity:stop', item.id),
  answerActivity: (id, allow) => ipcRenderer.invoke('activity:answer', id, allow),
  retryActivity: (id) => ipcRenderer.invoke('activity:retry', id),
  resumeActivity: (id) => ipcRenderer.invoke('activity:resume', id),
  openActivity: (item) => ipcRenderer.invoke('activity:open', item.id),
  seenActivity: () => ipcRenderer.invoke('activity:seen'),
  listSent: () => ipcRenderer.invoke('sent:list'),
  listChanges: () => ipcRenderer.invoke('actions:list'),
  rewindPlan: (messageId: string) => ipcRenderer.invoke('chat:rewind-plan', messageId),
  rewind: (messageId, undo, mode, twist) => ipcRenderer.invoke('chat:rewind', messageId, undo, mode, twist),
  onActivity: (cb) => listen('activity:changed', cb),
  onSettings: (cb) => listen('settings:changed', cb),
  setChatLearn: (on) => ipcRenderer.invoke('chat:learn', on),
  listMemories: () => ipcRenderer.invoke('memory:list'),
  addMemory: (text) => ipcRenderer.invoke('memory:add', text),
  updateMemory: (id, change) => ipcRenderer.invoke('memory:update', id, change),
  removeMemory: (id) => ipcRenderer.invoke('memory:remove', id),
  clearMemories: () => ipcRenderer.invoke('memory:clear'),
  undoMemory: (answerId, memoryId) => ipcRenderer.invoke('memory:undo', answerId, memoryId),
  openMemories: () => ipcRenderer.invoke('memory:open'),
  explain: (term, around, language) => ipcRenderer.invoke('chat:explain', term, around, language),

  pickFiles: () => ipcRenderer.invoke('files:pick'),
  dropFiles: (files) => ipcRenderer.invoke('files:register', files.map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  readFile: (id) => ipcRenderer.invoke('files:read', id),
  discardFile: (id) => ipcRenderer.invoke('files:discard', id),
  hiddenLines: (id) => ipcRenderer.invoke('hidden:show', id),

  captureSelection: () => ipcRenderer.invoke('capture:selection'),
  captureScreenshot: () => ipcRenderer.invoke('capture:screenshot'),
  closePanel: () => ipcRenderer.invoke('panel:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),

  pickUpText: (dataUrl) => ipcRenderer.invoke('pickup:open', dataUrl),
  pickupPicture: () => ipcRenderer.invoke('pickup:picture'),
  pickupRead: () => ipcRenderer.invoke('pickup:read'),
  closePickup: () => ipcRenderer.invoke('pickup:close'),
  exportDrawing: (d, how) => ipcRenderer.invoke('drawing:export', d, how),
  showDrawing: (v) => ipcRenderer.invoke('drawing:show', v),
  viewerContent: () => ipcRenderer.invoke('viewer:content'),
  closeViewer: () => ipcRenderer.invoke('viewer:close'),

  closeQuick: () => ipcRenderer.invoke('quick:close'),
  expandQuick: () => ipcRenderer.invoke('quick:expand'),
  quickResize: (height) => ipcRenderer.send('quick:resize', height),
  quickState: (state) => ipcRenderer.send('quick:state', state),

  bubbleMenu: () => ipcRenderer.send('bubble:menu'),
  bubbleDrag: (phase) => ipcRenderer.send('bubble:drag', phase),

  // A draft this window typed comes back to every window; this one already has it (D-62).
  onChatEvent: (cb) => listen<ChatEvent>('chat:event', (e) => (e.type === 'draft' && e.from === DRAFTS_FROM ? undefined : cb(e))),
  onPanelOpen: (cb) => listenHeld('panel:open', cb),
  onQuickOpen: (cb) => listenHeld('quick:open', cb),
  onBubbleState: (cb) => listen('bubble:state', cb),
  onBubbleMood: (cb) => listen('bubble:mood', cb),
  onBubbleBadge: (cb) => listen('bubble:badge', cb),
  onWindowVisible: (cb) => listen('window:visible', cb)
}

contextBridge.exposeInMainWorld('otty', api)
