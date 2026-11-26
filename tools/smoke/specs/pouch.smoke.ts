// The Pouch (D-77, Spec 12): kept Pebbles get their own screen, outlive their chats, sit on shelves, and can be put back.
import type { Page } from '@playwright/test'
import type { ModelBody } from '../world/server'
import { expect, test, type Otty } from '../fixtures'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)
const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code}\n\`\`\``

const RAIN = `pie title "Rainfall by month"\n  "Jan" : 80\n  "Feb" : 60`
const TIDES = `pie title "Tide times"\n  "High" : 2\n  "Low" : 2`

/** The panel at the width the Pouch's wall is laid out for (as calendar.smoke does). */
async function wide(otty: Otty, panel: Page): Promise<void> {
  await otty.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))
    const [, h] = win!.getSize()
    win!.setSize(1000, Math.max(h, 600))
  })
  await expect.poll(() => panel.evaluate(() => window.innerWidth)).toBe(1000)
}

/** Opens the Pouch with its ⌘6 key, at the wide width. */
async function openPouch(otty: Otty, panel: Page): Promise<void> {
  await wide(otty, panel)
  await panel.keyboard.press('Meta+6')
  await expect(panel.locator('.pouch')).toBeVisible()
}

/** A stone by its title, as its accessible name reads: "{title}, {kind}, from …". */
const stone = (panel: Page, title: string) => panel.getByRole('button', { name: new RegExp(`^${title}, `) })

/** A shelf's group on the wall, by its label. */
const group = (panel: Page, label: string) => panel.locator('.pouch-group').filter({ has: panel.locator('.set-group__label', { hasText: label }) })

/** Asks, and waits until the chat's title has been written in the background, so the next call can't take its reply. */
async function ask(otty: Otty, panel: Page, world: { modelRequests(): ModelBody[] }, q: string): Promise<void> {
  await otty.ask(panel, q)
  await expect.poll(() => world.modelRequests().some((b) => !b.stream && JSON.stringify(b.messages).includes(q))).toBe(true)
}

/** Opens a stone's card by its title. */
async function openStone(panel: Page, title: string): Promise<Page> {
  await stone(panel, title).click()
  await expect(panel.getByRole('dialog', { name: title })).toBeVisible()
  return panel
}

test('a kept chart is in the Pouch, opens big, goes back to its chat, and is still there after a restart', { tag: ['@step-196'] }, async ({ otty, world }) => {
  world.reply(streamed('Chart the rain for me'), { say: `Rain falls most in the wet months.\n\nRainfall by month:\n\n${fence('mermaid', RAIN)}` })
  world.backgroundReply = 'Coastal notes'
  let panel = await otty.openPanel()
  await ask(otty, panel, world, 'Chart the rain for me')
  const card = panel.locator('.drawing-card').first()
  await card.getByRole('button', { name: 'Keep' }).click()
  await expect(card.getByRole('button', { name: 'Kept' })).toBeVisible()

  await openPouch(otty, panel)
  await expect(stone(panel, 'Rainfall by month')).toBeVisible()
  await expect(stone(panel, 'Rainfall by month').locator('.stone__from')).toContainText('From “Coastal notes” ·')
  await openStone(panel, 'Rainfall by month')

  // Open big opens the viewer window, as a chat's does; closing it returns to the Pouch.
  await panel.getByRole('dialog', { name: 'Rainfall by month' }).getByRole('button', { name: 'Open big' }).click()
  const viewer = await otty.view('viewer')
  await expect(viewer.getByRole('img', { name: 'Drawing by Otty' })).toBeVisible()
  await viewer.keyboard.down('Escape').catch(() => {})
  await expect.poll(() => otty.app.windows().some((w) => !w.isClosed() && w.url().includes('view=viewer'))).toBe(false)

  // Go to the chat shows that answer.
  await panel.getByRole('dialog', { name: 'Rainfall by month' }).getByRole('button', { name: 'Go to the chat' }).click()
  await expect(panel.getByText('Rain falls most in the wet months.')).toBeVisible()
  await expect(panel.locator('.drawing-card').first()).toBeVisible()

  await otty.relaunch()
  panel = await otty.openPanel()
  await openPouch(otty, panel)
  await expect(stone(panel, 'Rainfall by month')).toBeVisible()
})

test('a kept drawing outlives its deleted chat, and Forget all chats leaves it alone', { tag: ['@step-197'] }, async ({ otty, world }) => {
  world.reply(streamed('Chart the rain for me'), { say: `Rain falls most in the wet months.\n\nRainfall by month:\n\n${fence('mermaid', RAIN)}` })
  world.backgroundReply = 'Coastal notes'
  const panel = await otty.openPanel()
  await ask(otty, panel, world, 'Chart the rain for me')
  await panel.locator('.drawing-card').first().getByRole('button', { name: 'Keep' }).click()
  await expect(panel.locator('.drawing-card').first().getByRole('button', { name: 'Kept' })).toBeVisible()

  // Delete the chat from Recent chats.
  await panel.keyboard.press('Meta+Shift+F')
  await expect(panel.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible()
  await panel.getByRole('button', { name: /Coastal notes/ }).first().hover()
  await panel.locator('.history__delete').first().click()
  await panel.getByRole('dialog').getByRole('button', { name: 'Forget', exact: true }).click()
  await expect(panel.getByRole('button', { name: /Coastal notes/ })).toHaveCount(0)

  await openPouch(otty, panel)
  const kept = stone(panel, 'Rainfall by month')
  await expect(kept).toBeVisible()
  await expect(kept.locator('.stone__from')).toContainText('From a deleted chat ·')
  await openStone(panel, 'Rainfall by month')
  await expect(panel.getByRole('dialog', { name: 'Rainfall by month' }).getByRole('button', { name: 'Go to the chat' })).toHaveCount(0)
  await panel.keyboard.press('Escape')
  await expect(panel.getByRole('dialog', { name: 'Rainfall by month' })).toHaveCount(0)

  // Forget all chats only shows while a chat exists, so start one first; then Settings › Privacy › Forget all chats (held):
  // the chats go, the Pouch stays.
  world.reply(streamed('Something else entirely'), { say: 'Sure thing.' })
  await panel.keyboard.press('Meta+2')
  await panel.keyboard.press('Meta+N')
  await ask(otty, panel, world, 'Something else entirely')
  await expect(panel.getByText('Sure thing.')).toBeVisible()
  await panel.keyboard.press('Meta+,')
  await otty.settings(panel, 'Privacy')
  await otty.hold(panel.getByRole('button', { name: 'Hold to forget: Forget all chats' }))
  await expect(panel.getByRole('group', { name: 'Can’t be undone' })).toContainText('Forgotten')
  await openPouch(otty, panel)
  await expect(stone(panel, 'Rainfall by month')).toBeVisible()
  await expect(stone(panel, 'Rainfall by month').locator('.stone__from')).toContainText('From a deleted chat ·')
})

test('shelves and search: a shelf groups its stones, search matches titles and shelves, and no match says so', { tag: ['@step-198'] }, async ({ otty, world }) => {
  world.reply(streamed('Chart the rain for me'), {
    say: `Two things to keep.\n\nRainfall by month:\n\n${fence('mermaid', RAIN)}\n\nTide times:\n\n${fence('mermaid', TIDES)}`
  })
  world.backgroundReply = 'Coastal notes'
  const panel = await otty.openPanel()
  await ask(otty, panel, world, 'Chart the rain for me')
  await panel.locator('.drawing-card').nth(0).getByRole('button', { name: 'Keep' }).click()
  await panel.locator('.drawing-card').nth(1).getByRole('button', { name: 'Keep' }).click()
  await expect(panel.locator('.drawing-card').nth(1).getByRole('button', { name: 'Kept' })).toBeVisible()

  await openPouch(otty, panel)
  await openStone(panel, 'Tide times')
  const card = panel.getByRole('dialog', { name: 'Tide times' })
  await card.getByLabel('Shelf', { exact: true }).selectOption({ label: 'New shelf…' })
  await card.getByLabel('New shelf').fill('Sea')
  await card.getByLabel('New shelf').press('Enter')
  await expect(card.getByLabel('Shelf', { exact: true })).toHaveValue(/Sea/)
  // Focus has left the field; a click on the card's title gives the card focus so Esc closes it.
  await card.locator('.pouch-card__title').click()
  await panel.keyboard.press('Escape')
  await expect(card).toHaveCount(0)

  await expect(group(panel, 'Sea').getByRole('button', { name: /^Tide times, / })).toBeVisible()
  await expect(group(panel, 'Not on a shelf').getByRole('button', { name: /^Rainfall by month, / })).toBeVisible()

  const find = panel.getByPlaceholder('Find in your Pouch')
  await find.fill('rain')
  await expect(stone(panel, 'Rainfall by month')).toBeVisible()
  await expect(stone(panel, 'Tide times')).toHaveCount(0)

  await find.fill('sea')
  await expect(stone(panel, 'Tide times')).toBeVisible()
  await expect(stone(panel, 'Rainfall by month')).toHaveCount(0)

  await find.fill('zzz')
  await expect(panel.getByText('Nothing in your Pouch matches “zzz”.')).toBeVisible()
  await expect(stone(panel, 'Tide times')).toHaveCount(0)
  await expect(stone(panel, 'Rainfall by month')).toHaveCount(0)
})

test('Put back takes a stone away with Undo, and Forget my Pouch leaves the empty line', { tag: ['@step-199'] }, async ({ otty, world }) => {
  world.reply(streamed('Chart the rain for me'), {
    say: `Two things to keep.\n\nRainfall by month:\n\n${fence('mermaid', RAIN)}\n\nTide times:\n\n${fence('mermaid', TIDES)}`
  })
  world.backgroundReply = 'Coastal notes'
  const panel = await otty.openPanel()
  await ask(otty, panel, world, 'Chart the rain for me')
  await panel.locator('.drawing-card').nth(0).getByRole('button', { name: 'Keep' }).click()
  await panel.locator('.drawing-card').nth(1).getByRole('button', { name: 'Keep' }).click()
  await expect(panel.locator('.drawing-card').nth(1).getByRole('button', { name: 'Kept' })).toBeVisible()

  await openPouch(otty, panel)
  // Put "Tide times" on a shelf first, so Undo has to bring the shelf back with it.
  await openStone(panel, 'Tide times')
  const card = panel.getByRole('dialog', { name: 'Tide times' })
  await card.getByLabel('Shelf', { exact: true }).selectOption({ label: 'New shelf…' })
  await card.getByLabel('New shelf').fill('Sea')
  await card.getByLabel('New shelf').press('Enter')
  await card.locator('.pouch-card__title').click()
  await panel.keyboard.press('Escape')
  await expect(group(panel, 'Sea').getByRole('button', { name: /^Tide times, / })).toBeVisible()

  await openStone(panel, 'Tide times')
  await panel.getByRole('dialog', { name: 'Tide times' }).getByRole('button', { name: 'Put back', exact: true }).click()
  await expect(stone(panel, 'Tide times')).toHaveCount(0)
  await expect(panel.locator('.pouch-ok')).toContainText('Put back “Tide times”')
  await panel.locator('.pouch-ok').getByRole('button', { name: 'Undo' }).click()
  await expect(panel.locator('.pouch-ok')).toHaveCount(0)
  await expect(group(panel, 'Sea').getByRole('button', { name: /^Tide times, / })).toBeVisible()

  // Settings › Privacy › Forget my Pouch (held): the wall is empty and says so.
  await panel.keyboard.press('Meta+,')
  await otty.settings(panel, 'Privacy')
  await otty.hold(panel.getByRole('button', { name: 'Hold to forget: Forget my Pouch' }))
  await openPouch(otty, panel)
  await expect(panel.getByText('Keep a chart, a diagram or slides from any answer, and it lands here.')).toBeVisible()
  await expect(stone(panel, 'Tide times')).toHaveCount(0)
  await expect(stone(panel, 'Rainfall by month')).toHaveCount(0)
})
