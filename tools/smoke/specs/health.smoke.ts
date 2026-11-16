// The health banner (D-47): one line at the top of the panel when a shortcut can't work yet, with the fix.
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, test, type Otty } from '../fixtures'

/**
 * The user clicks into another app and back, so the panel looks again. Playwright's focus emulation would swallow the
 * window's focus events, so it's turned off for the panel first.
 */
async function refocusPanel(otty: Otty, panel: Page): Promise<void> {
  const cdp = await panel.context().newCDPSession(panel)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  const focus = (on: boolean) =>
    otty.app.evaluate(({ BrowserWindow }, f) => {
      const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))
      if (f) w?.focus()
      else w?.blur()
      return w?.isFocused()
    }, on)
  await expect.poll(() => focus(false)).toBe(false)
  await expect.poll(() => focus(true)).toBe(true)
}

const banner = (panel: Page) => panel.getByRole('status').filter({ has: panel.locator('.health__text') })

test('without Accessibility the banner offers Allow, and goes once it’s on', { tag: ['@step-99'] }, async ({ otty }) => {
  await otty.mac({ accessibility: false })
  const panel = await otty.openPanel()
  await refocusPanel(otty, panel)
  await expect(banner(panel)).toContainText('can’t read highlighted text until Otty is allowed under Accessibility')

  await banner(panel).getByRole('button', { name: 'Allow' }).click()
  await expect
    .poll(async () => (await otty.snapshot()).calls.filter((c) => c.kind === 'open-external').map((c) => c.detail[0]))
    .toContain('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')

  await otty.mac({ accessibility: true })
  await refocusPanel(otty, panel)
  await expect(panel.getByText('can’t read highlighted text')).toBeHidden()
})

test('without Screen Recording the banner offers Allow and Reopen Otty', { tag: ['@step-99'] }, async ({ otty }) => {
  await otty.mac({ screen: false })
  const panel = await otty.openPanel()
  await refocusPanel(otty, panel)
  await expect(banner(panel)).toContainText('Snips can only see your wallpaper')
  await expect(banner(panel).getByRole('button', { name: 'Allow' })).toBeVisible()
  // Not clicked: it really relaunches the app (✋ by hand).
  await expect(banner(panel).getByRole('button', { name: 'Reopen Otty' })).toBeVisible()
})

test.describe('a shortcut that can’t be registered', () => {
  // Stands in for another app's shortcut: the snip shortcut registers first and takes it from the whole-screen one.
  test.use({ seed: { ...ONBOARDED, snapHotkey: 'Control+Alt+O', screenHotkey: 'Control+Alt+O' } })

  test('the banner names it and Change it opens Settings', { tag: ['@step-99'] }, async ({ otty }) => {
    const panel = await otty.openPanel()
    await expect(banner(panel)).toContainText(/Another app uses .+, so it won’t work for/)
    await banner(panel).getByRole('button', { name: 'Change it' }).click()
    await expect(panel.getByLabel('Shortcut: capture the whole screen')).toBeVisible()
    await expect(panel.getByText('Another app is using this shortcut').first()).toBeVisible()
  })
})
