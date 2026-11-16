import { Notification } from 'electron'
import type { ActivityItem, BubbleMood, BubbleState, ChatEvent } from '../shared/types'
import { getStored } from './settings'
import { getBubble, getPanel, getQuick, openPanel } from './windows'

// D-45: what the user is told, and where: chat events to the windows, the otter's face and badge, Activity and
// macOS notifications.

let happyTimer: NodeJS.Timeout | null = null

function setBubbleState(state: BubbleState): void {
  getBubble()?.webContents.send('bubble:state', state)
}

export function setBadge(on: boolean): void {
  getBubble()?.webContents.send('bubble:badge', on)
}

/** A short cheer from the otter. */
export function celebrate(): void {
  if (happyTimer) clearTimeout(happyTimer)
  setBubbleState('happy')
  happyTimer = setTimeout(() => setBubbleState('idle'), 2500)
}

/** Only the chat on show gets here, so the otter follows what the user is looking at. */
export function forward(e: ChatEvent): void {
  getPanel()?.webContents.send('chat:event', e)
  getQuick()?.webContents.send('chat:event', e)
  if (happyTimer) clearTimeout(happyTimer)
  if (e.type === 'start') setBubbleState('thinking')
  if (e.type === 'error' || e.type === 'reset') setBubbleState('idle')
  if (e.type === 'load') setBubbleState(e.streaming ? 'thinking' : 'idle')
  // The quick view hides when it loses focus, so an answer can finish with nobody looking.
  const seen = getPanel()?.isVisible() || getQuick()?.isVisible()
  if ((e.type === 'done' || e.type === 'error') && !seen) setBadge(true)
  if (e.type === 'done') celebrate()
}

/** What each job was last time, so a notification fires once, on the change. Null until the first look. */
let lastStates: Map<string, ActivityItem['state']> | null = null

/** A finished, failed or waiting job the user asked for, told through macOS when they've opted in. */
function notifyChanges(items: ActivityItem[]): void {
  const before = lastStates
  lastStates = new Map(items.filter((i) => i.kind === 'job').map((i) => [i.id, i.state]))
  if (!before || !getStored().notifyDone || getPanel()?.isVisible() || !Notification.isSupported()) return
  for (const item of items) {
    if (item.kind !== 'job' || before.get(item.id) === item.state) continue
    const body =
      item.state === 'done' ? `Ready: ${item.title}` : item.state === 'waiting' ? `${item.title} needs your OK to read a page.` : item.state === 'failed' ? `${item.title} couldn’t finish.` : null
    if (!body) continue
    const note = new Notification({ title: 'Otty', body, silent: false })
    note.on('click', () => openPanel({ context: null, notice: 'open-activity' }, 'bubble'))
    note.show()
  }
}

/** The otter's mood about its own work: paused by the user first, then waiting for an OK, then busy. */
function bubbleMood(items: ActivityItem[]): BubbleMood {
  if (getStored().workPaused) return 'paused'
  if (items.some((i) => i.state === 'waiting')) return 'waiting'
  return items.some((i) => i.state === 'working') ? 'working' : null
}

export function tellActivity(items: ActivityItem[], news: boolean): void {
  getPanel()?.webContents.send('activity:changed', items)
  getBubble()?.webContents.send('bubble:mood', bubbleMood(items))
  notifyChanges(items)
  if (news && !getPanel()?.isVisible()) setBadge(true)
}
