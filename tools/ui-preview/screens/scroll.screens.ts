import { expect, test, type Page } from '@playwright/test'

// Scrolling on a slow Mac (the CPU slowed 4x, like CI's), where timing bugs show up: only the chat scrolls, and it
// ends at its end even when a drawing or chart renders after its answer.
async function slowly(page: Page, scene: string) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.goto(`/?view=panel&scene=${scene}`)
  await page.waitForLoadState('networkidle')
}

const atEnd = (page: Page) =>
  page.evaluate(() => {
    // Not there yet on a slow Mac: not at its end either, so the poll keeps waiting.
    const chat = document.querySelector('.chat')
    return !!chat && chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 2
  })

for (const scene of ['drawing', 'chart', 'cap']) {
  test(`the chat follows a late ${scene} to its end on a slow Mac`, async ({ page }) => {
    await slowly(page, scene)
    // Every drawing has rendered: that's the late growth the chat has to follow.
    await expect(page.locator('.drawing-card__picture').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.drawing-card__wait')).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => atEnd(page), { timeout: 8_000 }).toBe(true)
    // …and stays there once everything has settled.
    await page.waitForTimeout(1_500)
    expect(await atEnd(page)).toBe(true)
  })
}

test('focusing the box never scrolls the window, even with a full tray', async ({ page }) => {
  await slowly(page, 'tray')
  await expect(page.locator('.tray-hint')).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1_500)
  const scrolled = await page.evaluate(() => [...document.querySelectorAll('html, body, #root, #root > *')].map((e) => e.scrollTop))
  expect(scrolled.every((t) => t === 0)).toBe(true)
})
