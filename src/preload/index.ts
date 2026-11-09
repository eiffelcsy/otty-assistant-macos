import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { OttyApi } from '../shared/types'

function listen<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_e: Electron.IpcRendererEvent, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: OttyApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (u) => ipcRenderer.invoke('settings:save', u),
  testConnection: () => ipcRenderer.invoke('settings:test'),
  getPermissions: () => ipcRenderer.invoke('permissions:get'),
  openPermissionSettings: (kind) => ipcRenderer.invoke('permissions:open', kind),
  relaunch: () => ipcRenderer.invoke('app:relaunch'),

  sendMessage: (text, captures, opts) => ipcRenderer.invoke('chat:send', text, captures, opts),
  stop: () => ipcRenderer.invoke('chat:stop'),
  resetChat: () => ipcRenderer.invoke('chat:reset'),
  listChats: () => ipcRenderer.invoke('chats:list'),
  openChat: (id, focusMessageId) => ipcRenderer.invoke('chats:open', id, focusMessageId),
  searchChats: (q) => ipcRenderer.invoke('chats:search', q),
  deleteChat: (id) => ipcRenderer.invoke('chats:delete', id),
  clearChats: () => ipcRenderer.invoke('chats:clear'),
  respondConfirm: (id, allow) => ipcRenderer.invoke('chat:confirm', id, allow),
  runStep: (answerId, index, sure) => ipcRenderer.invoke('steps:run', answerId, index, sure),
  tickStep: (answerId, index, done) => ipcRenderer.invoke('steps:tick', answerId, index, done),
  checkStep: (answerId, index) => ipcRenderer.invoke('steps:check', answerId, index),
  stuckOnStep: (answerId, index) => ipcRenderer.invoke('steps:stuck', answerId, index),
  listActivity: () => ipcRenderer.invoke('activity:list'),
  stopActivity: (item) => ipcRenderer.invoke('activity:stop', item),
  answerActivity: (id, allow) => ipcRenderer.invoke('activity:answer', id, allow),
  retryActivity: (id) => ipcRenderer.invoke('activity:retry', id),
  resumeActivity: (id) => ipcRenderer.invoke('activity:resume', id),
  openActivity: (item) => ipcRenderer.invoke('activity:open', item),
  seenActivity: () => ipcRenderer.invoke('activity:seen'),
  onActivity: (cb) => listen('activity:changed', cb),
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

  captureSelection: () => ipcRenderer.invoke('capture:selection'),
  captureScreenshot: () => ipcRenderer.invoke('capture:screenshot'),
  closePanel: () => ipcRenderer.invoke('panel:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),

  pickUpText: (dataUrl) => ipcRenderer.invoke('pickup:open', dataUrl),
  pickupPicture: () => ipcRenderer.invoke('pickup:picture'),
  pickupRead: () => ipcRenderer.invoke('pickup:read'),
  closePickup: () => ipcRenderer.invoke('pickup:close'),

  closeQuick: () => ipcRenderer.invoke('quick:close'),
  expandQuick: () => ipcRenderer.invoke('quick:expand'),
  quickResize: (height) => ipcRenderer.send('quick:resize', height),
  quickState: (state) => ipcRenderer.send('quick:state', state),

  bubbleMenu: () => ipcRenderer.send('bubble:menu'),
  bubbleDrag: (phase) => ipcRenderer.send('bubble:drag', phase),

  onChatEvent: (cb) => listen('chat:event', cb),
  onPanelOpen: (cb) => listen('panel:open', cb),
  onQuickOpen: (cb) => listen('quick:open', cb),
  onBubbleState: (cb) => listen('bubble:state', cb),
  onBubbleWorking: (cb) => listen('bubble:working', cb),
  onBubbleBadge: (cb) => listen('bubble:badge', cb),
  onWindowVisible: (cb) => listen('window:visible', cb)
}

contextBridge.exposeInMainWorld('otty', api)
