// Captures (D-47): highlights, snips and the whole screen, through the real shortcuts and the otter, into the quick
// view and the panel's tray, and on to the model.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import { textOf } from '../world/server'

/** A small valid picture, for snips and the whole screen. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const SAFARI = { name: 'Safari', bundleId: 'com.apple.Safari', title: 'Otters', url: 'https://example.com/otters' }
const TERMINAL = { name: 'Terminal', bundleId: 'com.apple.Terminal', title: 'zsh' }

type View = 'panel' | 'quick' | 'bubble'

/** Where one of Otty's windows is, and whether it's shown and focused. */
function windowState(otty: Otty, view: View) {
  return otty.app.evaluate(({ BrowserWindow }, v) => {
    const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes(`view=${v}`))
    return w ? { visible: w.isVisible(), focused: w.isFocused(), bounds: w.getBounds() } : null
  }, view)
}

/** The user clicks into another app, so the window loses focus. */
function clickElsewhere(otty: Otty, view: View) {
  return otty.app.evaluate(({ BrowserWindow }, v) => {
    BrowserWindow.getAllWindows()
      .find((b) => b.webContents.getURL().includes(`view=${v}`))
      ?.blur()
  }, view)
}

/**
 * The quick view, once its page listens. A capture sent while it's still loading at launch is lost, which a person
 * pressing a shortcut a second after launch never meets, so specs wait for it.
 */
async function quickReady(otty: Otty): Promise<Page> {
  const quick = await otty.view('quick')
  await expect(quick.locator('textarea')).toBeAttached()
  return quick
}

const clipboardText = (otty: Otty) => otty.app.evaluate(({ clipboard }) => clipboard.readText())

/** The latest question's words, as the model got them. */
function lastQuestion(otty: Otty): { text: string; pictures: number } {
  const req = otty.world.modelRequests().filter((r) => r.stream).at(-1)
  const user = [...(req?.messages ?? [])].reverse().find((m) => m.role === 'user')
  const parts = Array.isArray(user?.content) ? (user.content as { type?: string }[]) : []
  return { text: textOf(user?.content), pictures: parts.filter((p) => p.type === 'image_url').length }
}

/** The panel's tray: one ✕ per capture. */
const trayItems = (panel: Page) => panel.locator('.composer').getByRole('button', { name: 'Remove' })

/** With the panel open but another app in front: highlight `text` there and press ⌥Space. */
async function highlightIntoPanel(otty: Otty, text: string, front: typeof SAFARI | typeof TERMINAL = SAFARI): Promise<void> {
  await clickElsewhere(otty, 'panel')
  await otty.mac({ selection: text, front })
  await otty.press('Alt+Space')
}

test('⌥Space in Safari: quick view at the cursor, the page tag, a streamed answer, and the clipboard kept', { tag: ['@step-4', '@step-5', '@step-14', '@gate'] }, async ({ otty, world }) => {
  await otty.app.evaluate(({ clipboard }) => clipboard.writeText('What I copied before'))
  await otty.mac({ selection: 'Sea otters hold hands while they sleep.', front: SAFARI })
  const quick = await quickReady(otty)
  await otty.press('Alt+Space')

  await expect.poll(async () => (await windowState(otty, 'quick'))?.visible).toBe(true)
  await expect(quick.getByText('Sea otters hold hands while they sleep.')).toBeVisible()
  await expect(quick.getByText('Highlighted')).toBeVisible()
  const tag = quick.locator('.app-tag').filter({ hasText: 'In Safari · Otters' })
  await expect(tag).toBeVisible()
  await expect(tag).toHaveAttribute('title', /https:\/\/example\.com\/otters/)

  // At the cursor: it opens just under it, unless the screen's edge pushes it.
  const cursor = await otty.app.evaluate(({ screen }) => screen.getCursorScreenPoint())
  const { bounds } = (await windowState(otty, 'quick'))!
  expect(cursor.x).toBeGreaterThanOrEqual(bounds.x)
  expect(cursor.x).toBeLessThanOrEqual(bounds.x + bounds.width)
  expect(bounds.y).toBeLessThanOrEqual(cursor.y + 20)

  world.reply('what is this site?', { say: 'This page is about **sea otters** and how they sleep.' })
  await otty.ask(quick, 'what is this site?')
  await expect(quick.getByText('how they sleep')).toBeVisible()

  // The model was told the highlight, the app and the page.
  const sent = lastQuestion(otty).text
  expect(sent).toContain('Sea otters hold hands while they sleep.')
  expect(sent).toContain('I\'m using Safari')
  expect(sent).toContain('https://example.com/otters')

  // Step 5: the ⌘C trick put the user's clipboard back.
  await expect.poll(() => clipboardText(otty)).toBe('What I copied before')
})

test('clicking the otter with text highlighted opens the panel next to it with the capture', { tag: ['@step-6', '@gate'] }, async ({ otty, world }) => {
  await otty.mac({ selection: 'Otters use rocks as tools.', front: { name: 'Notes', bundleId: 'com.apple.Notes', title: 'Facts' } })
  const bubble = await otty.view('bubble')
  await bubble.getByTitle('Click to ask Otty · Right-click for more').click()

  const panel = await otty.view('panel')
  await expect.poll(async () => (await windowState(otty, 'panel'))?.visible).toBe(true)
  await expect(panel.getByText('Otters use rocks as tools.')).toBeVisible()
  await expect(panel.locator('.composer .app-tag').filter({ hasText: 'In Notes · Facts' })).toBeVisible()

  // Next to the otter: beside it, not on top of it.
  const p = (await windowState(otty, 'panel'))!.bounds
  const b = (await windowState(otty, 'bubble'))!.bounds
  const beside = p.x + p.width <= b.x + 1 || p.x >= b.x + b.width - 1
  expect(beside, `panel ${JSON.stringify(p)} should sit beside the otter ${JSON.stringify(b)}`).toBe(true)

  world.reply('Why rocks?', { say: 'Rocks help them crack open shellfish.' })
  await otty.ask(panel, 'Why rocks?')
  await expect(panel.getByText('crack open shellfish')).toBeVisible()
  expect(lastQuestion(otty).text).toContain('Otters use rocks as tools.')
})

test('⌥⇧Space snips part of the screen and the model gets the picture', { tag: ['@step-7', '@gate'] }, async ({ otty, world }) => {
  await otty.mac({ snip: PNG, front: { name: 'Numbers', bundleId: 'com.apple.iWork.Numbers', title: 'Sales' } })
  const quick = await quickReady(otty)
  await otty.press('Alt+Shift+Space')

  await expect.poll(async () => (await windowState(otty, 'quick'))?.visible).toBe(true)
  await expect(quick.getByRole('img', { name: 'Your screen snip' })).toBeVisible()
  await expect(quick.locator('.app-tag').filter({ hasText: 'In Numbers · Sales' })).toBeVisible()

  world.reply('what is this?', { say: 'It’s a bar chart of sales by month.' })
  await otty.ask(quick, 'what is this?')
  await expect(quick.getByText('bar chart of sales')).toBeVisible()
  const sent = lastQuestion(otty)
  expect(sent.pictures).toBe(1)
  expect(sent.text).toContain('a snip of part of my screen')
})

test('the panel tray collects from two apps and offers the tiles for several', { tag: ['@step-38', '@step-39'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  const before = (await windowState(otty, 'panel'))!.bounds

  await highlightIntoPanel(otty, 'Sea otters have the densest fur of any animal.')
  await expect(trayItems(panel)).toHaveCount(1)
  await expect(panel.locator('.composer .app-tag').filter({ hasText: 'In Safari' })).toBeVisible()
  expect((await windowState(otty, 'panel'))!.bounds, 'the panel stays where it is').toEqual(before)

  await otty.mac({ snip: PNG, front: TERMINAL })
  await otty.press('Alt+Shift+Space')
  await expect(trayItems(panel)).toHaveCount(2)
  await expect(panel.locator('.composer .app-tag').filter({ hasText: 'In Terminal' })).toBeVisible()
  for (const tile of ['Compare these', 'Summarize all', 'Explain each']) await expect(panel.getByRole('button', { name: tile })).toBeVisible()

  // Step 39: ↵ with an empty box sends both, each with its app.
  world.backgroundReply = 'Otter fur and a terminal'
  world.reply('collected 2 things', { say: 'The **first** is about otter fur; the **second** is a terminal window.' })
  await panel.locator('.composer textarea').press('Enter')
  await expect(panel.getByText('is a terminal window')).toBeVisible()
  const sent = panel.locator('.msg--user')
  await expect(sent.locator('.app-tag').filter({ hasText: 'In Safari' })).toBeVisible()
  await expect(sent.locator('.app-tag').filter({ hasText: 'In Terminal' })).toBeVisible()
  const q = lastQuestion(otty)
  expect(q.pictures).toBe(1)
  expect(q.text).toContain('from Safari')
  expect(q.text).toContain('from Terminal')
  expect(q.text).toContain('densest fur')

  // Reopened from Recent chats: both captures, the snip as not saved.
  await panel.getByRole('button', { name: 'New chat' }).click()
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.getByRole('button', { name: /Otter fur and a terminal/ }).click()
  await expect(panel.locator('.msg--user').getByText('Sea otters have the densest fur')).toBeVisible()
  await expect(panel.locator('.msg--user').getByText('Screen snip (not saved)')).toBeVisible()

  // Search finds it by a word from the Safari text.
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.getByPlaceholder('Search your chats').fill('densest')
  await expect(panel.getByRole('button', { name: /Otter fur and a terminal/ })).toBeVisible()
})

test('the tray holds four, says so at five, and keeps one copy of the same text', { tag: ['@step-40'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  for (const [i, text] of ['One otter.', 'Two otters.', 'Three otters.', 'Four otters.'].entries()) {
    await highlightIntoPanel(otty, text)
    await expect(trayItems(panel)).toHaveCount(i + 1)
  }
  await highlightIntoPanel(otty, 'Five otters.')
  await expect(panel.getByText('Otty can look at 4 things at once')).toBeVisible()
  await expect(trayItems(panel)).toHaveCount(4)

  await trayItems(panel).first().click()
  await expect(trayItems(panel)).toHaveCount(3)
  await expect(panel.getByText('Otty can look at 4 things at once')).toBeHidden()

  // The same highlight again is ignored; the next new one still lands.
  await highlightIntoPanel(otty, 'Two otters.')
  await highlightIntoPanel(otty, 'Six otters.')
  await expect(trayItems(panel)).toHaveCount(4)
  await expect(panel.locator('.composer').getByText('Two otters.')).toHaveCount(1)
})

test('a very long window title is cut with … and stays inside the chat', { tag: ['@step-49'] }, async ({ otty, world }) => {
  const title = `Quarterly otter population report for the northern Pacific coast ${'and its many small islands '.repeat(4)}`.trim()
  await otty.mac({ snip: PNG, front: { name: 'Preview', bundleId: 'com.apple.Preview', title } })
  const quick = await quickReady(otty)
  await otty.press('Alt+Shift+Space')
  await expect.poll(async () => (await windowState(otty, 'quick'))?.visible).toBe(true)

  world.reply('Summarize this', { say: 'It’s a report on otter numbers.' })
  await otty.ask(quick, 'Summarize this')
  await expect(quick.getByText('report on otter numbers')).toBeVisible()
  await expectCutInside(quick.locator('.quick__card .app-tag').first(), quick.locator('.quick__card'))

  await quick.getByRole('button', { name: /continue in chat/ }).click()
  const panel = await otty.view('panel')
  await expect.poll(async () => (await windowState(otty, 'panel'))?.visible).toBe(true)
  const tag = panel.locator('.msg--user .app-tag').first()
  await expect(tag).toBeVisible()
  await expectCutInside(tag, panel.locator('.chat'))
})

/** The tag's text is cut short by an ellipsis, and the tag doesn't poke out of its container. */
async function expectCutInside(tag: ReturnType<Page['locator']>, container: ReturnType<Page['locator']>): Promise<void> {
  const text = tag.locator('.app-tag__text')
  const cut = await text.evaluate((el) => ({ overflow: el.scrollWidth > el.clientWidth, ellipsis: getComputedStyle(el).textOverflow }))
  expect(cut).toEqual({ overflow: true, ellipsis: 'ellipsis' })
  const t = (await tag.boundingBox())!
  const c = (await container.boundingBox())!
  expect(t.x).toBeGreaterThanOrEqual(c.x - 0.5)
  expect(t.x + t.width).toBeLessThanOrEqual(c.x + c.width + 0.5)
}

test('⌘⌥⇧Space takes the whole screen; into the tray with the panel open; a friendly notice without Screen Recording', { tag: ['@step-66'] }, async ({ otty, world }) => {
  await otty.mac({ screenImage: PNG, front: SAFARI })
  const quick = await quickReady(otty)
  await otty.press('Command+Alt+Shift+Space')
  await expect.poll(async () => (await windowState(otty, 'quick'))?.visible).toBe(true)
  await expect(quick.getByText('Whole screen')).toBeVisible()

  world.reply('What’s on my screen?', { say: 'Your screen shows a page about otters.' })
  await otty.ask(quick, 'What’s on my screen?')
  await expect(quick.getByText('a page about otters')).toBeVisible()
  const sent = lastQuestion(otty)
  expect(sent.pictures).toBe(1)
  expect(sent.text).toContain('a picture of my whole screen')
  // Otty's windows are back after the blink.
  const shown = await otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).map((w) => w.getOpacity()))
  expect(shown.every((o) => o === 1)).toBe(true)

  // With the panel open, it goes into the tray.
  const panel = await otty.openPanel()
  await clickElsewhere(otty, 'panel')
  await otty.press('Command+Alt+Shift+Space')
  await expect(trayItems(panel)).toHaveCount(1)
  await expect(panel.locator('.composer').getByText('Whole screen')).toBeVisible()

  // Without Screen Recording: the friendly notice.
  await otty.mac({ screen: false })
  await otty.press('Command+Alt+Shift+Space')
  await expect(panel.getByText('Otty can only see your wallpaper')).toBeVisible()
})

test('Settings shows the whole-screen shortcut and warns when it can’t be used', { tag: ['@step-66'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Shortcuts')
  const keys = panel.getByRole('button', { name: /^The whole screen: Command\+Alt\+Shift\+Space/ })
  await expect(keys).toBeVisible()
  // Stands in for another app's shortcut: Otty's own ask shortcut is already taken when this one registers.
  await keys.click()
  await panel.getByRole('button', { name: /recording/ }).press('Alt+Space')
  await expect(panel.getByText('Another app uses this. Pick a different one.')).toBeVisible()
  // The old shortcut stays, and still works.
  await expect(keys).toBeVisible()
  expect((await otty.snapshot()).shortcuts).toContain('Command+Alt+Shift+Space')
})
