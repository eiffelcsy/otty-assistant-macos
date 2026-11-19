import { expect, test, type Locator, type Page } from '@playwright/test'

// D-67: what must hold at every width and in both window states. Screenshots can't see a control that's missing (the
// baseline is whatever was there) and specs test one way in, so these check the rules instead: a way out, menus that
// open inside the window, nothing scrolling sideways, and New chat from every screen. No screenshots here.

const WIDTHS = [380, 680, 760, 1280]
const STATES = ['floating', 'roomy'] as const

async function open(page: Page, scene: string, width: number, state: (typeof STATES)[number]) {
  await page.setViewportSize({ width: 1340, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/?view=panel&scene=${scene}&w=${width}&h=600${state === 'roomy' ? '&state=roomy' : ''}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300)
}

/** Fails unless `inner` lies within the window (the preview's `#root`). */
async function expectInsideWindow(page: Page, inner: Locator) {
  const win = (await page.locator('#root').boundingBox())!
  const box = (await inner.boundingBox())!
  expect(box.x, 'left edge').toBeGreaterThanOrEqual(win.x - 1)
  expect(box.y, 'top edge').toBeGreaterThanOrEqual(win.y - 1)
  expect(box.x + box.width, 'right edge').toBeLessThanOrEqual(win.x + win.width + 1)
  expect(box.y + box.height, 'bottom edge').toBeLessThanOrEqual(win.y + win.height + 1)
}

/** Each visible button with this name that opens a menu: the menu opens inside the window, then closes. */
async function menusOpenInside(page: Page, name: string | RegExp) {
  const buttons = page.getByRole('button', { name }).filter({ visible: true })
  for (const button of await buttons.all()) {
    if ((await button.getAttribute('aria-haspopup')) !== 'menu') continue
    await button.click()
    const menu = page.getByRole('menu').filter({ visible: true })
    await expect(menu).toHaveCount(1)
    await expectInsideWindow(page, menu)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }
}

for (const state of STATES) {
  for (const width of WIDTHS) {
    test(`${state} at ${width}: a way out, menus inside the window, nothing sideways`, async ({ page }) => {
      await open(page, 'chat', width, state)
      // The floating window has no traffic lights, so it needs its own Close; the roomy one can always shrink.
      if (state === 'floating') await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
      else await expect(page.getByRole('button', { name: 'Shrink to floating' }).filter({ visible: true })).toHaveCount(1)

      await menusOpenInside(page, 'Pause everything')
      await menusOpenInside(page, /switch screen$/)

      const sideways = await page.evaluate(() => {
        const root = document.getElementById('root')!
        return root.scrollWidth - root.clientWidth
      })
      expect(sideways, 'the window scrolls sideways').toBeLessThanOrEqual(0)
    })
  }
}

// The nav matrix: ⌘N from every screen lands on an empty chat, ready to type in.
const SCREENS: [string, string][] = [
  ['Home', 'Meta+1'],
  ['the Logbook', 'Meta+3'],
  ['the Notebook', 'Meta+4'],
  ['Settings', 'Meta+,']
]

for (const [state, width] of [
  ['floating', 420],
  ['roomy', 1280]
] as const) {
  for (const [screen, key] of SCREENS) {
    test(`${state} at ${width}: New chat from ${screen} shows the new chat, focused`, async ({ page }) => {
      await open(page, 'chat', width, state)
      await expect(page.locator('.msg').first()).toBeVisible()
      await page.keyboard.press(key)
      await expect(page.locator('.chat')).toBeHidden()
      await page.keyboard.press('Meta+n')
      // The chat screen, empty, with its own box focused (Home has a box of its own, so the chat must be on show).
      await expect(page.locator('.chat')).toBeVisible()
      await expect(page.locator('.msg')).toHaveCount(0)
      await expect(page.locator('.composer__input').filter({ visible: true }).last()).toBeFocused()
    })
  }
}

test('the Notebook opened as a screen has nothing to go back to', async ({ page }) => {
  await open(page, 'chat', 420, 'floating')
  await page.keyboard.press('Meta+4')
  await expect(page.getByRole('button', { name: 'All settings' })).toHaveCount(0)
})
