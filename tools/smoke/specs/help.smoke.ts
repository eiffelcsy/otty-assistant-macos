// Copy diagnostics (D-50): checklist step 134.
import { expect, pbpaste, SMOKE_KEY, test } from '../fixtures'

test('Copy diagnostics shows the whole report first, copies exactly that, and holds nothing of the user', { tag: ['@step-134'] }, async ({ otty, world }) => {
  // The report quotes the log, which is for Otty's team, so raw error text may show in it.
  otty.rawTextAllowed = true
  const panel = await otty.openPanel()
  world.reply((text, body) => body.stream === true && text.includes('fjord'), { say: 'A long, narrow sea inlet carved by a glacier.' })
  await otty.ask(panel, 'What is a fjord?')
  await expect(panel.getByText('A long, narrow sea inlet carved by a glacier.')).toBeVisible()

  await otty.settings(panel, 'Help')
  await panel.getByRole('button', { name: /^Copy diagnostics/ }).click()
  const report = panel.getByLabel('Diagnostics')
  await expect(report).toContainText(/^Otty \S+ · macOS /)
  await expect(report).toContainText('Service: DeepSeek · model ')
  await expect(report).toContainText(/Accessibility: (yes|no) · Screen Recording: (yes|no)/)
  await expect(report).toContainText(/info Otty \S+ started/)
  const text = await report.innerText()
  expect(text).not.toContain(SMOKE_KEY)
  expect(text).not.toContain('fjord')

  await panel.getByRole('button', { name: 'Copy this' }).click()
  await expect(panel.getByRole('button', { name: 'Copied', exact: true })).toBeVisible()
  expect(pbpaste().trim()).toBe(text.trim())
})
