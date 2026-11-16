import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import type { ModelBody } from '../world/server'

// Math (D-12): typed sums answered on the Mac, the `calculate` chip, thinking only for real problems, and equations
// that render under the release build's CSP. How well a real model explains or solves stays with the eval.

/** Chat requests only: titles and explain warm-ups aren't streamed. */
const chats = (bodies: ModelBody[]) => bodies.filter((b) => b.stream)

/** What the app put on the clipboard, read in main. */
const clipboardText = (otty: Otty) => otty.app.evaluate(({ clipboard }) => clipboard.readText())

/** The latest answer in a chat window. */
const lastAnswer = (page: Page) => page.locator('.msg--otty').last()

/** Asks, then waits for that question's answer to finish (its Copy button only shows once it has). */
async function askAndWait(otty: Otty, page: Page, text: string): Promise<void> {
  const before = await page.locator('.msg--otty').count()
  await otty.ask(page, text)
  await expect(page.locator('.msg--otty')).toHaveCount(before + 1)
  await expect(lastAnswer(page).getByRole('button', { name: /^(Copy|Copied)$/ })).toBeVisible()
}

test('a typed sum is answered on the Mac, offline, and only sentences go to the model', { tag: ['@step-73', '@gate'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await otty.control((c) => c.offline(true))

  await askAndWait(otty, panel, '17.5% of 2,340')
  await expect(lastAnswer(panel).locator('.calc-card__result')).toHaveText('= 409.5')
  await expect(lastAnswer(panel).getByRole('button', { name: 'Explain the working' })).toBeVisible()
  await lastAnswer(panel).getByRole('button', { name: 'Copy' }).click()
  await expect.poll(() => clipboardText(otty)).toBe('409.5')

  await askAndWait(otty, panel, '38°C to °F')
  await expect(lastAnswer(panel).locator('.calc-card__result')).toHaveText(/^= 100\.4 degF$/)
  await askAndWait(otty, panel, '10 km to miles')
  await expect(lastAnswer(panel).locator('.calc-card__result')).toHaveText(/^= 6\.21\d* miles?$/)
  await askAndWait(otty, panel, 'what is 2 + 2?')
  await expect(lastAnswer(panel).locator('.calc-card__result')).toHaveText('= 4')
  expect(world.requests, 'a typed sum never leaves the Mac').toEqual([])

  // Back online, the working is the model's job, and things that only look like sums go to it too.
  await otty.control((c) => c.offline(false))
  world.reply('Explain the working for that', { say: '17.5% is 0.175, and 0.175 × 2,340 = 409.5.' })
  world.reply('macOS 15.1', { say: 'That’s a version of macOS.' })
  world.reply('12/25/2026', { say: 'That’s Christmas Day 2026.' })
  world.reply('1 in 3', { say: 'One in three is about 33%.' })
  await panel.locator('.msg--otty').first().getByRole('button', { name: 'Explain the working' }).click()
  await expect(lastAnswer(panel)).toContainText('0.175 × 2,340 = 409.5')
  await expect(lastAnswer(panel).getByRole('button', { name: 'Copy' })).toBeVisible()
  for (const q of ['macOS 15.1', '12/25/2026', '1 in 3']) await askAndWait(otty, panel, q)
  await expect(lastAnswer(panel)).toContainText('about 33%')
  expect(chats(world.modelRequests())).toHaveLength(4)
  // The earlier sums are in the history the model got, so it can follow on from them.
  expect(JSON.stringify(chats(world.modelRequests())[0].messages)).toContain('17.5% of 2,340 = 409.5')
})

test('a calculation uses one Calculated chip, and only a real problem thinks', { tag: ['@step-74'] }, async ({ otty, world }) => {
  world.reply(
    'plus 8% tax',
    { calls: [{ name: 'calculate', args: { steps: ['base = 2340 * 17.5%', 'tax = base * 8%', 'total = base + tax'] } }] },
    { say: 'With tax, that comes to **442.26**.' }
  )
  world.reply('Solve 3x + 7 = 25', {
    think: 'Subtract 7, then divide by 3.',
    say: 'Take 7 from both sides, then divide by 3:\n\n$$x = \\frac{25 - 7}{3} = \\frac{18}{3} = 6$$\n\nCheck: 3 × 6 + 7 = 25 ✓'
  })
  world.reply('capital of France', { say: 'Paris.' })
  const panel = await otty.openPanel()

  await askAndWait(otty, panel, 'What’s 17.5% of 2,340 plus 8% tax?')
  const chip = lastAnswer(panel).locator('.tool-chip')
  await expect(chip).toHaveCount(1)
  await expect(chip).toHaveText('Calculated total = 442.26')
  await expect(lastAnswer(panel)).toContainText('442.26')
  await chip.click()
  await expect(chip).toHaveText('Copied')
  await expect.poll(() => clipboardText(otty)).toBe('442.26')
  // The model got the steps' numbers back.
  const afterTool = chats(world.modelRequests())[1]
  expect(JSON.stringify(afterTool.messages)).toContain('total = 442.26')

  await askAndWait(otty, panel, 'Solve 3x + 7 = 25')
  // Rendered as a real fraction, not `\frac`.
  await expect(lastAnswer(panel).locator('.katex .mfrac').first()).toBeVisible()
  await expect(lastAnswer(panel).locator('.msg__bubble')).not.toContainText('\\frac', { useInnerText: true })
  await expect(lastAnswer(panel)).toContainText('Check: 3 × 6 + 7 = 25')

  await askAndWait(otty, panel, 'What’s the capital of France?')
  const thinking = (q: string) => (chats(world.modelRequests()).find((b) => JSON.stringify(b.messages?.at(-1)).includes(q)) as { thinking?: { type: string } } | undefined)?.thinking?.type
  expect(thinking('plus 8% tax'), 'a calculation doesn’t think').toBe('disabled')
  expect(thinking('Solve 3x + 7 = 25'), 'a real problem thinks').toBe('enabled')
  expect(thinking('capital of France'), 'no extra pause for a plain question').toBe('disabled')
})

test('dollars stay text, Chinese sums work, and equations render in a built app in light and dark', { tag: ['@step-75', '@step-76'] }, async ({ otty, world }) => {
  world.reply('$1,150 on rent', { calls: [{ name: 'calculate', args: { steps: ['1150 / 3200 * 100'] } }] }, { say: 'Rent is $1,150 of your $3,200, about **35.9%**.' })
  world.reply('3,000 蚊打八折', { calls: [{ name: 'calculate', args: { steps: ['3000 * 80%'] } }] }, { say: '打八折即係付八成：\n\n$$3000 \\times 0.8 = 2400$$\n\n即係 **2,400** 蚊。' })
  const panel = await otty.openPanel()

  await askAndWait(otty, panel, 'I earn $3,200 a month and spend $1,150 on rent, what share is that?')
  await expect(lastAnswer(panel).locator('.msg__bubble')).toContainText('Rent is $1,150 of your $3,200')
  await expect(lastAnswer(panel).locator('.katex'), 'prices are never math').toHaveCount(0)
  await expect(lastAnswer(panel).locator('.tool-chip')).toHaveText('Calculated 1150 / 3200 × 100 = 35.9375')

  await askAndWait(otty, panel, '3,000 蚊打八折係幾多？')
  await expect(lastAnswer(panel).locator('.tool-chip')).toHaveText('Calculated 3000 × 80% = 2,400')
  const equation = lastAnswer(panel).locator('.katex').first()
  await expect(equation).toBeVisible()

  // KaTeX's fonts got past the page's CSP: a blocked font would log a console error and fail the test at the end.
  await expect.poll(() => panel.evaluate(() => document.fonts.check('16px KaTeX_Main'))).toBe(true)

  await panel.emulateMedia({ colorScheme: null })
  for (const mode of ['dark', 'light'] as const) {
    await otty.control((c, m) => c.theme(m), mode)
    await expect.poll(() => panel.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(mode === 'dark')
    // Legible: the equation's colour differs from the background behind it. How it looks is ✋.
    const [ink, paper] = await equation.evaluate((el) => {
      let bg = 'rgba(0, 0, 0, 0)'
      for (let n: Element | null = el; n && bg === 'rgba(0, 0, 0, 0)'; n = n.parentElement) bg = getComputedStyle(n).backgroundColor
      if (bg === 'rgba(0, 0, 0, 0)') bg = getComputedStyle(document.body).backgroundColor
      return [getComputedStyle(el).color, bg]
    })
    expect(ink, `${mode}: equation colour vs background`).not.toBe(paper)
  }

  await lastAnswer(panel).getByRole('button', { name: 'Copy' }).click()
  await expect.poll(() => clipboardText(otty)).toContain('$$3000 \\times 0.8 = 2400$$')
  expect(chats(world.modelRequests())).toHaveLength(4)
})
