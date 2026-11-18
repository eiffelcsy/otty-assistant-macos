import { app } from 'electron'
import { activeProfile } from '../providers'
import { diagnosticsReport } from '../diagnostics'
import { lastLines } from '../log'
import type { PermissionKind, SettingsUpdate, UsageReport } from '../../shared/types'
import { serviceAt, serviceById } from '../../shared/services'
import * as settings from '../settings'
import { applySettings } from '../controls'
import { cap, usageMeter } from '../core'
import { testConnection } from '../llm'
import { getPermissions, openPermissionSettings } from '../permissions'
import { handle } from './check'

export function registerSettings(): void {
  handle('settings:get', () => settings.getPublic())
  handle('settings:save', (_e, u: SettingsUpdate) => applySettings(u))
  handle('settings:test', () => testConnection())
  handle('permissions:get', () => getPermissions())
  handle('permissions:open', (_e, kind: PermissionKind) => openPermissionSettings(kind))
  handle('app:relaunch', () => {
    app.relaunch()
    app.quit()
  })
  handle('diagnostics:get', () => {
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
  })
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
