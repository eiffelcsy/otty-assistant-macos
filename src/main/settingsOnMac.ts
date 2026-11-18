import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Keychain, SettingsBackend } from './settings'

// The Mac's side of settings (D-45 step 3): the file in the app's folder, the Keychain and the login item.

/** The Keychain, through electron's safeStorage. Anything else Otty locks away (a connection's token) uses it too. */
export const macKeychain: Keychain = {
  available: () => safeStorage.isEncryptionAvailable(),
  lock: (plain) => safeStorage.encryptString(plain).toString('base64'),
  unlock: (locked) => safeStorage.decryptString(Buffer.from(locked, 'base64'))
}

const file = () => join(app.getPath('userData'), 'settings.json')

export const macSettings: SettingsBackend = {
  read() {
    try {
      return readFileSync(file(), 'utf8')
    } catch {
      return null
    }
  },
  write(text) {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(file(), text)
  },
  keychain: macKeychain,
  systemLanguages: () => app.getPreferredSystemLanguages(),
  packaged: () => app.isPackaged,
  // Only the installed app on a Mac can be a login item. macOS is the source of truth, so it's read each time.
  get loginItem() {
    if (process.platform !== 'darwin' || !app.isPackaged) return null
    return {
      get: () => app.getLoginItemSettings().openAtLogin,
      set: (openAtLogin: boolean) => app.setLoginItemSettings({ openAtLogin })
    }
  }
}
