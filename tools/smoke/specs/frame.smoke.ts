// The frame (D-64, Spec 05): the screen menu and Back when narrow, and the window's width alone setting the layout.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'

/** Sets the panel's width as a drag would, keeping its height. */
async function widen(otty: Otty, panel: Page, width: number): Promise<void> {
  await otty.app.evaluate(({ BrowserWindow }, w) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))
    const [, h] = win!.getSize()
    win!.setSize(w, Math.max(h, 600))
  }, width)
  await expect.poll(() => panel.evaluate(() => window.innerWidth)).toBe(width)
}

test('Chats from the screen menu, and ⌘[ back to the chat with its words still in the box', { tag: ['@step-156'] }, async ({ otty, world }) => {
  world.reply('What do otters eat?', { say: 'Mostly fish and shellfish.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'What do otters eat?')
  await expect(panel.getByText('Mostly fish and shellfish.')).toBeVisible()
  await panel.getByRole('textbox').fill('and sea urchins?')

  await otty.go(panel, 'Chats')
  await expect(panel.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
  await panel.keyboard.press('Meta+BracketLeft')
  await expect(panel.getByText('Mostly fish and shellfish.')).toBeVisible()
  await expect(panel.getByRole('textbox')).toHaveValue('and sea urchins?')
  await expect(panel.getByRole('button', { name: 'Chat, switch screen' })).toBeVisible()
})

test('dragged wider: a rail with Chats beside the chat at 760, the sidebar at 1000, and the chat stays put', { tag: ['@step-157'] }, async ({ otty, world }) => {
  world.reply('Tell me about otters', { say: 'Otters hold hands while they sleep.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Tell me about otters')
  await expect(panel.getByText('Otters hold hands while they sleep.')).toBeVisible()
  await panel.getByRole('textbox').fill('do they snore?')

  await widen(otty, panel, 760)
  await expect(panel.locator('.frame__nav--rail')).toBeVisible()
  await expect(panel.getByRole('region', { name: 'Chats' })).toBeVisible()
  await expect(panel.getByText('Otters hold hands while they sleep.')).toBeVisible()

  await widen(otty, panel, 1000)
  await expect(panel.locator('.frame__nav--sidebar')).toBeVisible()
  await expect(panel.getByText('Otters hold hands while they sleep.')).toBeVisible()
  await expect(panel.getByRole('textbox')).toHaveValue('do they snore?')
  // No column under its minimum, and nothing scrolls sideways.
  expect(await panel.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(await panel.locator('.frame__main').evaluate((m) => m.clientWidth)).toBeGreaterThanOrEqual(400)

  // ⌘3 from the keyboard: the Logbook, selected in the sidebar.
  await panel.keyboard.press('Meta+3')
  await expect(panel.locator('.logbook')).toBeVisible()
  await expect(panel.getByRole('button', { name: /^Logbook/ })).toHaveAttribute('aria-current', 'true')
  await widen(otty, panel, 420)
  await expect(panel.locator('.frame__nav')).toHaveCount(0)
})
