// Settings in sections (D-61, docs/design/specs/02-settings.md): each control saves as it changes, and Find a
// setting reaches any row.
import { expect, test } from '../fixtures'

test('a switch saves as it’s flipped, says Saved, and is still on after a restart', { tag: ['@step-143'] }, async ({ otty }) => {
  let panel = await otty.openPanel()
  await expect(panel.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await otty.settings(panel, 'You & Otty')
  const ready = () => panel.getByRole('checkbox', { name: /Tell me when something is ready/ })
  await expect(ready()).not.toBeChecked()
  await ready().check()
  await expect(panel.getByText('Saved')).toBeVisible()

  await otty.relaunch()
  panel = await otty.openPanel()
  await otty.settings(panel, 'You & Otty')
  await expect(ready()).toBeChecked()
  await panel.getByRole('button', { name: 'All settings' }).click()
  await expect(panel.locator('.set-row--section', { hasText: 'You & Otty' })).toContainText('notifications on')
})

test('Find a setting finds a row by another word, and Enter opens its section', { tag: ['@step-144'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await panel.getByRole('button', { name: 'Settings', exact: true }).click()
  const find = panel.getByRole('textbox', { name: 'Find a setting' })
  await find.fill('hotkey')
  await expect(panel.getByRole('button', { name: /Ask about highlighted text/ })).toBeVisible()
  await find.press('Enter')
  await expect(panel.getByRole('heading', { name: 'Shortcuts' })).toBeVisible()
  await expect(panel.locator('.set-row--found')).toContainText('Ask about highlighted text')
})
