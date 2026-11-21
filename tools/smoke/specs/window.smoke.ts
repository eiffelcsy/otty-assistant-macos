// The roomy window (D-65, Spec 06): Expand and Shrink move one window between floating and roomy, keeping the chat,
// a streaming answer and the box's words; the Dock icon never appears; closing it leaves Otty floating.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import { holdAnswers } from '../hold'

const panelWidth = (otty: Otty) =>
  otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))!.getSize()[0])
const dock = async (otty: Otty) => (await otty.snapshot()).calls.filter((c) => c.kind === 'dock').map((c) => c.detail[0])

async function expandIt(panel: Page): Promise<void> {
  await panel.getByRole('button', { name: 'Expand', exact: true }).click()
  await expect(panel.locator('.panel--roomy')).toBeVisible()
}

test('Expand mid-answer: the answer keeps coming and the words stay; ⇧⌘E back, with the Dock left alone', { tag: ['@step-158'] }, async ({ otty, world }) => {
  world.reply('Tell me about otters', { say: 'Otters hold hands while they sleep.' })
  const panel = await otty.openPanel()
  const release = holdAnswers(world)
  try {
    await otty.ask(panel, 'Tell me about otters')
    await panel.getByRole('textbox').fill('do they snore?')
    await expandIt(panel)
    await expect.poll(() => panelWidth(otty)).toBeGreaterThan(700)
    await expect(panel.locator('.frame__nav')).toBeVisible()
  } finally {
    release()
  }
  await expect(panel.getByText('Otters hold hands while they sleep.')).toBeVisible()
  await expect(panel.getByRole('textbox')).toHaveValue('do they snore?')

  await panel.keyboard.press('Meta+Shift+KeyE')
  await expect(panel.locator('.panel--roomy')).toHaveCount(0)
  await expect.poll(() => panelWidth(otty)).toBeLessThan(500)
  // No Dock icon in either state: showing it moved the focus to the app behind (2026-11-21).
  expect(await dock(otty)).not.toContain('show')
  await expect(panel.getByRole('textbox')).toHaveValue('do they snore?')
  // The move has landed: the glass frosts again (it's off mid-move).
  await expect(panel.locator('.panel--moving')).toHaveCount(0)

  // And it grows again: a stand-in waiting on a hidden window's frame once hung every move after the first Shrink.
  await panel.keyboard.press('Meta+Shift+KeyE')
  await expect.poll(() => panelWidth(otty)).toBeGreaterThan(700)
  await expect(panel.locator('.panel--moving')).toHaveCount(0)
})

test('closing the roomy window puts it away, and the bubble then opens the floating one', { tag: ['@step-159'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await expandIt(panel)
  await otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))!.close())
  await expect.poll(() => otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))!.isVisible())).toBe(false)
  expect(await dock(otty)).not.toContain('show')
  const again = await otty.openPanel()
  await expect(again.locator('.panel--roomy')).toHaveCount(0)
  await expect.poll(() => panelWidth(otty)).toBeLessThan(500)
})
