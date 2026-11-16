// Confirm cards for things that act (reminders, opening a page), friendly errors, try-asking chips, code tiles (D-47).
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)
const card = (panel: Page) => panel.locator('.confirm-card')

test('a reminder asks first, then goes to Reminders with the words only as arguments', { tag: ['@step-9', '@gate'] }, async ({ otty, world }) => {
  world.reply(turn('Remind me to call mum at 5pm'), { calls: [{ name: 'create_reminder', args: { title: 'Call mum', due: '2026-11-17T17:00:00' } }] }, { say: 'Done, it’s in Reminders.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Remind me to call mum at 5pm')
  await expect(card(panel)).toBeVisible()
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'osascript'), 'nothing runs before Yes').toEqual([])
  await card(panel).getByRole('button', { name: 'Yes, go ahead' }).click()
  await expect(panel.getByText('Done, it’s in Reminders.')).toBeVisible()
  const scripts = (await otty.snapshot()).calls.filter((c) => c.kind === 'osascript')
  expect(scripts).toHaveLength(1)
  const args = scripts[0].detail
  const code = args.filter((_a, i) => args[i - 1] === '-e').join('\n')
  expect(code, 'the model’s words never go inside the script').not.toContain('Call mum')
  expect(args.slice(args.indexOf('--') + 1)).toContain('Call mum')
})

test('No on a reminder card changes nothing', { tag: ['@step-9'] }, async ({ otty, world }) => {
  world.reply(turn('Remind me to water the plants'), { calls: [{ name: 'create_reminder', args: { title: 'Water the plants' } }] }, { say: 'All right, I won’t.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Remind me to water the plants')
  await card(panel).getByRole('button', { name: 'No thanks' }).click()
  await expect(panel.getByText('All right, I won’t.')).toBeVisible()
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'osascript')).toEqual([])
})

test('a search chip, then opening the page asks first and opens the browser', { tag: ['@step-10'] }, async ({ otty, world }) => {
  world.search('otters wikipedia', [{ title: 'Otter - Wikipedia', url: 'https://en.wikipedia.org/wiki/Otter' }])
  world.reply(
    turn('Find me the Wikipedia page for otters and open it'),
    { calls: [{ name: 'search_web', args: { query: 'otters wikipedia' } }] },
    { calls: [{ name: 'open_url', args: { url: 'https://en.wikipedia.org/wiki/Otter' } }] },
    { say: 'Opened it for you.' }
  )
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Find me the Wikipedia page for otters and open it')
  await expect(panel.getByText(/Looking up/)).toBeVisible()
  await expect(card(panel)).toContainText('en.wikipedia.org')
  await card(panel).getByRole('button', { name: 'Yes, go ahead' }).click()
  await expect(panel.getByText('Opened it for you.')).toBeVisible()
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'open-external').map((c) => c.detail[0])).toEqual(['https://en.wikipedia.org/wiki/Otter'])
})

test('a wrong key and no connection each get a friendly line', { tag: ['@step-11'] }, async ({ otty, world }) => {
  world.reply(turn('Hello there'), { status: 401, error: 'invalid api key' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Hello there')
  await expect(panel.getByText('Otty’s key doesn’t look right. Please check it in Settings.')).toBeVisible()
  await expect(panel.getByText('invalid api key')).toHaveCount(0)

  await otty.control((c) => c.offline(true))
  await otty.ask(panel, 'Are you there?')
  await expect(panel.getByText('Otty can’t reach the internet. Check your connection and try again.')).toBeVisible()
  await otty.control((c) => c.offline(false))
})

test('Excel gets an Excel chip that fills the box without sending', { tag: ['@step-105'] }, async ({ otty, world }) => {
  await otty.mac({ selection: null, front: { name: 'Microsoft Excel', bundleId: 'com.microsoft.Excel', title: 'Budget' } })
  const bubble = await otty.view('bubble')
  await bubble.locator('body').click()
  const panel = await otty.view('panel')
  const chip = panel.getByRole('button', { name: 'How do I freeze the top row?' })
  await expect(chip).toBeVisible()
  const before = world.modelRequests().length
  await chip.click()
  await expect(panel.locator('textarea')).toHaveValue('How do I freeze the top row?')
  expect(world.modelRequests().length, 'a chip never sends').toBe(before)
})

test('highlighted code gets code tiles, and an ordinary paragraph the usual ones', { tag: ['@step-110'] }, async ({ otty }) => {
  // Clicking the otter with code highlighted in an editor: the panel's tray offers the code tiles.
  const code = 'def total(items):\n    return sum(i.price for i in items)\n'
  await otty.mac({ selection: code, front: { name: 'Code', bundleId: 'com.microsoft.VSCode', title: 'cart.py' } })
  await (await otty.view('bubble')).locator('body').click()
  const panel = await otty.view('panel')
  for (const tile of ['Explain this code', 'Find problems', 'Add comments']) await expect(panel.getByRole('button', { name: tile })).toBeVisible()
  await panel.getByRole('button', { name: 'Close (Esc)' }).click()

  // An ordinary paragraph in the quick view: ↵ explains it, with nothing about code.
  await otty.mac({ selection: 'Sea otters hold hands while they sleep so they don’t drift apart.', front: { name: 'Notes', bundleId: 'com.apple.Notes' } })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  await expect(quick.getByText('Sea otters hold hands')).toBeVisible()
  await expect(quick.getByPlaceholder('Ask about this, or press ↵ to explain it')).toBeVisible()
  await expect(quick.getByText(/this code/i)).toHaveCount(0)
})
