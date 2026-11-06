import { describe, expect, it } from 'vitest'
import { stepCard } from '../card'
import { parseCombo } from '../keys'
import { openTarget } from '../open'
import { isRisky } from '../risk'

describe('risky steps', () => {
  it('asks twice for what can’t be undone', () => {
    for (const path of [['Finder', 'Empty Trash…'], ['Edit', 'Delete'], ['Message', 'Send'], ['Account', 'Sign Out'], ['File', '刪除']]) {
      expect(isRisky({ kind: 'menu', path }), path.join()).toBe(true)
    }
    expect(isRisky({ kind: 'keys', combo: '⌘Q' })).toBe(true)
    expect(isRisky({ kind: 'keys', combo: '⌘⌫' })).toBe(true)
    expect(isRisky({ kind: 'keys', combo: 'Command+W' })).toBe(true)
  })

  it('leaves everyday steps alone', () => {
    expect(isRisky({ kind: 'menu', path: ['File', 'Export To', 'PDF…'] })).toBe(false)
    expect(isRisky({ kind: 'keys', combo: '⌘⇧4' })).toBe(false)
    expect(isRisky({ kind: 'paste', text: 'delete everything', mode: 'replace' })).toBe(false)
  })
})

describe('shortcuts', () => {
  it('reads both ways of writing one', () => {
    expect(parseCombo('⌘⇧4')).toEqual({ modifiers: ['command down', 'shift down'], key: '4' })
    expect(parseCombo('Command+Shift+4')).toEqual({ modifiers: ['command down', 'shift down'], key: '4' })
    expect(parseCombo('⌃ Space')).toEqual({ modifiers: ['control down'], key: 49 })
    expect(parseCombo('⌘←')).toEqual({ modifiers: ['command down'], key: 123 })
  })

  it('never presses something without a modifier, or Return', () => {
    for (const combo of ['a', 'Return', 'Enter', '⌘Return', '', 'hello world', '⌘"; do shell script "x']) expect(parseCombo(combo), combo).toBeNull()
  })
})

describe('what a step may open', () => {
  const exists = (p: string) => ['/Applications/Safari.app', '/System/Applications/Utilities/Disk Utility.app', '/Users/me/Documents/a.pdf'].includes(p)
  const open = (t: string) => openTarget(t, exists, '/Users/me')

  it('opens web pages, apps and allowed settings', () => {
    expect(open('https://example.com/a')).toEqual({ kind: 'url', url: 'https://example.com/a' })
    expect(open('Safari')).toEqual({ kind: 'app', path: '/Applications/Safari.app' })
    expect(open('Disk Utility')).toMatchObject({ kind: 'app' })
    expect(open('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')).toMatchObject({ kind: 'settings' })
  })

  it('only ever reveals files in the home folder', () => {
    expect(open('~/Documents/a.pdf')).toEqual({ kind: 'reveal', path: '/Users/me/Documents/a.pdf' })
    expect(open('/Users/me/Documents/a.pdf')).toMatchObject({ kind: 'reveal' })
    expect(open('/etc/passwd')).toBeNull()
    expect(open('~/../other/a.pdf')).toBeNull()
    expect(open('~/missing.pdf')).toBeNull()
  })

  it('refuses everything else', () => {
    for (const t of ['file:///etc/passwd', 'javascript:alert(1)', 'x-apple.systempreferences:com.apple.Other', 'ssh://x', 'NoSuchApp', '../../bin/sh', 'Safari; rm']) {
      expect(open(t), t).toBeNull()
    }
  })
})

describe('building a card', () => {
  it('keeps good steps and leaves a bad action as a step to do by hand', () => {
    const card = stepCard(
      {
        title: 'Add up column B',
        steps: [
          { text: 'Click the cell', action: { kind: 'dance' } },
          { text: 'Paste this', action: { kind: 'paste', text: '=SUM(B:B)' } },
          { text: 'Export', action: { kind: 'menu', path: ['File', 'Export'] } },
          { text: 'One level', action: { kind: 'menu', path: ['File'] } },
          { text: '' }
        ]
      },
      { name: 'Excel', bundleId: 'com.microsoft.Excel' }
    )
    expect(card?.steps).toEqual([
      { text: 'Click the cell' },
      { text: 'Paste this', action: { kind: 'paste', text: '=SUM(B:B)', mode: 'replace' } },
      { text: 'Export', action: { kind: 'menu', path: ['File', 'Export'] } },
      { text: 'One level' }
    ])
    expect(card?.app?.name).toBe('Excel')
  })

  it('shows nothing with no steps', () => {
    expect(stepCard({ title: 'x', steps: [] }, null)).toBeNull()
    expect(stepCard({}, null)).toBeNull()
  })
})
