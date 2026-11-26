import { app, shell } from 'electron'
import { activeProfile } from '../providers'
import { diagnosticsReport, feedbackText } from '../diagnostics'
import { lastDay, lastLines, logFolder } from '../log'
import { copyText } from '../macHands'
import type { KeepChats, PermissionKind, SettingsCounts, SettingsUpdate, UsageReport } from '../../shared/types'
import { serviceAt, serviceById } from '../../shared/services'
import * as settings from '../settings'
import { applySettings, suggestHotkey } from '../controls'
import { cap, pebbles, usageMeter } from '../core'
import { testConnection } from '../llm'
import { getPermissions, openPermissionSettings } from '../permissions'
import { chatStore } from '../store'
import { retentionCutoff } from '../store/retention'
import { memoryStore } from '../memory'
import { handle, SETTABLE } from './check'

/** The build's feedback address (D-79). Unset means the sheet offers Copy it. */
const feedbackEmail = (): string | null => import.meta.env.MAIN_VITE_FEEDBACK_EMAIL?.trim() || null

/** What Copy diagnostics copies (D-50): the same report every time. */
function diagnosticsText(): string {
  const s = settings.getStored()
  const permissions = getPermissions()
  const service = serviceById(serviceAt(s.baseUrl))
  return diagnosticsReport({
    version: app.getVersion(),
    macOS: process.getSystemVersion(),
    arch: process.arch,
    installed: app.isPackaged,
    inApplications: process.platform === 'darwin' && app.isInApplicationsFolder(),
    service: service.label,
    model: s.model,
    web: activeProfile().web,
    accessibility: permissions.accessibility,
    screen: permissions.screen,
    paused: s.workPaused,
    log: lastLines(30),
    // A preset's address is public; anyone else's server is theirs to keep.
    hide: service.id === 'custom' ? [URL.canParse(s.baseUrl) ? new URL(s.baseUrl).hostname : s.baseUrl] : []
  })
}

const feedbackFor = (note: string, withLog: boolean): string => feedbackText(note, withLog, diagnosticsText(), withLog ? lastDay() : [])

export function registerSettings(): void {
  handle('settings:get', () => settings.getPublic())
  handle('settings:save', (_e, u: SettingsUpdate) => applySettings(u))
  // One setting, saved as it changes (D-61). The value is checked against its key's guard; null means refused.
  handle('settings:set', (_e, key: keyof typeof SETTABLE, value: unknown) => (SETTABLE[key](value) ? applySettings({ [key]: value }) : null))
  // The real numbers for the forget prompts: chats kept, how many each retention would forget, and notes.
  handle('settings:counts', async (): Promise<SettingsCounts> => {
    const chats = settings.getStored().rememberChats ? await chatStore().list() : []
    const older = (keep: KeepChats) => {
      const cutoff = retentionCutoff(keep)
      return cutoff === null ? 0 : chats.filter((c) => c.updatedAt < cutoff).length
    }
    return { chats: chats.length, olderThan: { '30d': older('30d'), '1y': older('1y'), forever: 0 }, notes: memoryStore().list().length, pebbles: pebbles().count() }
  })
  handle('settings:test', () => testConnection())
  handle('permissions:get', () => getPermissions())
  handle('permissions:open', (_e, kind: PermissionKind) => openPermissionSettings(kind))
  handle('app:relaunch', () => {
    app.relaunch()
    app.quit()
  })
  handle('diagnostics:get', () => diagnosticsText())
  // D-79: Send feedback. The text is built here, never from the window's copy; the sheet shows it before anything goes.
  handle('help:feedback', (_e, note: string, withLog: boolean) => ({ text: feedbackFor(note, withLog), email: feedbackEmail() }))
  handle('help:send', async (_e, note: string, withLog: boolean) => {
    await copyText(feedbackFor(note, withLog))
    const email = feedbackEmail()
    if (!email) return { mailed: false }
    await shell.openExternal(`mailto:${email}?subject=Otty%20feedback&body=${encodeURIComponent(note)}`)
    return { mailed: true }
  })
  handle('help:logs', () => shell.openPath(logFolder()))
  handle('hotkeys:suggest', (_e, key: 'askHotkey' | 'snapHotkey' | 'screenHotkey') => suggestHotkey(key))
  handle('usage:get', (): UsageReport => {
    const service = serviceById(serviceAt(settings.getStored().baseUrl))
    const empty = { days: 30, questions: 0, tokens: 0, searches: 0, pages: 0, jobs: 0 }
    const meter = usageMeter()
    const { requests: _r, ...summary } = meter?.summary() ?? { ...empty, requests: 0 }
    const month = meter?.month()
    const status = cap()
    return {
      ...summary,
      month: { questions: month?.questions ?? 0, tokens: month?.tokens ?? 0 },
      service: service.label,
      ...(service.usageUrl ? { usageUrl: service.usageUrl } : {}),
      ...(status ? { cap: status } : {})
    }
  })
}
