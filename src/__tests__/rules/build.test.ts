// D-49: the packaged app's fuses. Otty holds Accessibility, Screen Recording and Automation, so its binary must not
// run as plain Node or take a debugger, and it loads only its own, checked asar.
import { describe, expect, it } from 'vitest'
import { read } from './source'

const FUSES = {
  runAsNode: false,
  enableNodeOptionsEnvironmentVariable: false,
  enableNodeCliInspectArguments: false,
  enableEmbeddedAsarIntegrityValidation: true,
  onlyLoadAppFromAsar: true,
  enableCookieEncryption: true
}

describe('the packaged build', () => {
  it('sets every fuse, and none can quietly change', () => {
    const yml = read('electron-builder.yml')
    const block = yml.slice(yml.indexOf('electronFuses:')).split('\n').slice(1)
    const set = Object.fromEntries(
      block
        .map((l) => /^ {2}(\w+): (true|false)$/.exec(l))
        .filter((m) => m !== null)
        .map((m) => [m[1], m[2] === 'true'])
    )
    expect(set).toEqual(FUSES)
  })

  it('signs after the fuses, so an arm64 Mac doesn’t kill the edited binary', () => {
    const yml = read('electron-builder.yml').replace(/#.*$/gm, '')
    expect(yml).not.toMatch(/^\s+identity: null/m)
    expect(yml).not.toMatch(/disable-library-validation/)
    expect(read('build/entitlements.mac.plist')).not.toMatch(/disable-library-validation/)
  })
})
