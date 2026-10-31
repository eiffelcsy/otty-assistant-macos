import { shell, systemPreferences } from 'electron'
import type { PermissionKind, Permissions } from '../shared/types'

const isMac = process.platform === 'darwin'

export function getPermissions(): Permissions {
  if (!isMac) return { platform: process.platform, accessibility: true, screen: true }
  return {
    platform: process.platform,
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    screen: systemPreferences.getMediaAccessStatus('screen') === 'granted'
  }
}

export async function openPermissionSettings(kind: PermissionKind): Promise<void> {
  if (!isMac) return
  if (kind === 'accessibility') {
    // Shows the system prompt (once) and adds the app to the list.
    systemPreferences.isTrustedAccessibilityClient(true)
  }
  const pane = kind === 'accessibility' ? 'Privacy_Accessibility' : 'Privacy_ScreenCapture'
  await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`)
}
