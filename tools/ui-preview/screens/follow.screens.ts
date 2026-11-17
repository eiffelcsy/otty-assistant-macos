import { expect, test } from '@playwright/test'

// A drawing or chart renders after its answer arrived. On a slow Mac (the CPU slowed 4x, like CI's), the chat must
// still end at its end, not where it was when the answer arrived.
for (const scene of ['drawing', 'chart', 'cap']) {
  test(`the chat follows a late ${scene} to its end on a slow Mac`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(`/?view=panel&scene=${scene}`)
    await page.waitForLoadState('networkidle')
    await expect
      .poll(() => page.evaluate(() => {
        const chat = document.querySelector('.chat')!
        return chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 2
      }), { timeout: 8_000 })
      .toBe(true)
    // …and stays there once everything has settled.
    await page.waitForTimeout(1_500)
    expect(await page.evaluate(() => { const c = document.querySelector('.chat')!; return c.scrollTop + c.clientHeight >= c.scrollHeight - 2 })).toBe(true)
  })
}
