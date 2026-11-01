import { contextBridge, ipcRenderer } from 'electron'
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

  sendMessage: (text, ctx, opts) => ipcRenderer.invoke('chat:send', text, ctx, opts),
  stop: () => ipcRenderer.invoke('chat:stop'),
  resetChat: () => ipcRenderer.invoke('chat:reset'),
  listChats: () => ipcRenderer.invoke('chats:list'),
  openChat: (id) => ipcRenderer.invoke('chats:open', id),
  deleteChat: (id) => ipcRenderer.invoke('chats:delete', id),
  clearChats: () => ipcRenderer.invoke('chats:clear'),
  respondConfirm: (id, allow) => ipcRenderer.invoke('chat:confirm', id, allow),
  explain: (term, around, language) => ipcRenderer.invoke('chat:explain', term, around, language),

  captureSelection: () => ipcRenderer.invoke('capture:selection'),
  captureScreenshot: () => ipcRenderer.invoke('capture:screenshot'),
  closePanel: () => ipcRenderer.invoke('panel:close'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),

  closeQuick: () => ipcRenderer.invoke('quick:close'),
  expandQuick: () => ipcRenderer.invoke('quick:expand'),
  quickResize: (height) => ipcRenderer.send('quick:resize', height),

  bubbleMenu: () => ipcRenderer.send('bubble:menu'),
  bubbleDrag: (phase) => ipcRenderer.send('bubble:drag', phase),

  onChatEvent: (cb) => listen('chat:event', cb),
  onPanelOpen: (cb) => listen('panel:open', cb),
  onQuickOpen: (cb) => listen('quick:open', cb),
  onBubbleState: (cb) => listen('bubble:state', cb),
  onBubbleBadge: (cb) => listen('bubble:badge', cb)
}

contextBridge.exposeInMainWorld('otty', api)
