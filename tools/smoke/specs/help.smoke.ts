// Copy diagnostics (D-50): checklist step 134.
import { expect, ONBOARDED, pbpaste, SMOKE_KEY, test } from '../fixtures'

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

test('How do I… names the shortcut the person set, and Send feedback without the log copies only the note', { tag: ['@step-202'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Help')
  await panel.getByRole('button', { name: /^Ask about something you highlighted/ }).click()
  await expect(panel.getByText(/Highlight text in any app and press ⌥ ?Space\./)).toBeVisible()

  await panel.getByRole('button', { name: /^Send feedback/ }).click()
  // The build has no feedback address, so the button copies: it says so, and the email isn't offered.
  await panel.getByLabel('What happened, or what you’d like').fill('The otter froze.')
  await expect(panel.getByRole('checkbox', { name: /Attach the last day’s log/ })).not.toBeChecked()
  await panel.getByRole('button', { name: 'Copy it' }).click()
  await expect(panel.getByText('Copied. Send it to the person who gave you Otty.')).toBeVisible()
  expect(pbpaste().trim()).toBe('The otter froze.')
})

test('with the log ticked, Send feedback shows what it sends before it copies, and Open the log folder opens the folder', { tag: ['@step-203'] }, async ({ otty }) => {
  // The log can quote raw error text, which is for Otty's team; the sheet shows all of it first.
  otty.rawTextAllowed = true
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Help')
  await panel.getByRole('button', { name: /^Send feedback/ }).click()
  await panel.getByLabel('What happened, or what you’d like').fill('It froze.')
  await panel.getByRole('checkbox', { name: /Attach the last day’s log/ }).check()
  const shown = panel.getByLabel('What will be sent')
  await expect(shown).toContainText('— Log, last 24 hours —')
  await expect(shown).toContainText(/info Otty \S+ started/)
  expect(pbpaste()).not.toContain('— Log, last 24 hours —')

  await panel.getByRole('button', { name: 'Copy it' }).click()
  await expect(panel.getByText('Copied. Send it to the person who gave you Otty.')).toBeVisible()
  expect(pbpaste().trim()).toBe((await shown.innerText()).trim())

  await panel.getByRole('button', { name: /^Open the log folder/ }).click()
  await expect.poll(async () => (await otty.snapshot()).calls.filter((c) => c.kind === 'open-path').length).toBe(1)
})

test.describe('a taken shortcut with a free one', () => {
  // Stands in for another app's shortcut: the snip shortcut registers first and takes the whole-screen one's key too.
  test.use({ seed: { ...ONBOARDED, snapHotkey: 'Control+Alt+O', screenHotkey: 'Control+Alt+O' } })

  test('the Home banner names the free one, and Settings › Shortcuts uses it on Use it', { tag: ['@step-204'] }, async ({ otty }) => {
    const panel = await otty.openPanel()
    const banner = panel.getByRole('status').filter({ has: panel.locator('.health__text') })
    await expect(banner).toContainText(/Another app uses ⌃⌥O, so it won’t work for snapping part of the screen\. ⌥⇧Space is free\./)
    await banner.getByRole('button', { name: 'Change it' }).click()

    const row = panel.locator('.set-row', { hasText: 'Snip part of the screen' })
    await expect(row).toContainText('Another app uses this. ⌥⇧Space is free.')
    await row.getByRole('button', { name: 'Use it' }).click()
    await expect(row).not.toContainText('Another app uses this')
    expect((await otty.snapshot()).shortcuts).toContain('Alt+Shift+Space')
  })
})
