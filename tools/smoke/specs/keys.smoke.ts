// Hidden keys (D-29, D-32): a key in a file or a highlight never reaches the model, the chat or otty.db.
// The keys here are made up for the test.
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import type { ModelBody, World } from '../world/server'

const ENV_KEY = 'sk-test1234567890abcdef'
const ENV_PASSWORD = 'kelpforest99'
const TERMINAL_KEY = 'sk-test1234567890abcdefgh'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)
const sentText = (world: World) => JSON.stringify(world.requests)

/** What otty.db and its write-ahead log hold, as text, to look for a value in. */
function dbText(otty: Otty): string {
  return ['otty.db', 'otty.db-wal']
    .map((f) => join(otty.home, f))
    .filter(existsSync)
    .map((f) => readFileSync(f).toString('latin1'))
    .join('\n')
}

/** Searches Recent chats and expects nothing found. */
async function expectNotFound(panel: Page, value: string): Promise<void> {
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.getByPlaceholder('Search your chats').fill(value)
  await expect(panel.getByText(`No chats mention “${value}”`)).toBeVisible()
  await panel.getByRole('button', { name: 'Back to chat' }).click()
}

test('a .env file’s keys are hidden on the chip, from the model, from search and from otty.db', { tag: ['@step-109', '@gate'] }, async ({ otty, world }) => {
  world.reply(turn('what’s my key?'), { say: 'Otty hid that key before sending, so I can’t see it.' })
  world.backgroundReply = 'Settings file'
  const panel = await otty.openPanel()
  await otty.control((c, p) => c.nextOpen(p), [join(__dirname, 'files', '.env')])
  await panel.getByTitle('Attach files').click()

  const chip = panel.locator('.file-tray .file-chip', { hasText: '.env' })
  await expect(chip).toContainText('2 keys hidden')
  // Hovering shows the full line.
  await expect(chip).toHaveAttribute('title', /Otty hid 2 things that looked like keys or passwords before sending\./)

  await otty.ask(panel, 'what’s my key?')
  await expect(panel.getByText('Otty hid that key before sending')).toBeVisible()

  const sent = sentText(world)
  expect(sent).not.toContain(ENV_KEY)
  expect(sent).not.toContain(ENV_PASSWORD)
  expect(sent).toContain('OPENAI_API_KEY=[hidden key]')
  expect(sent).toContain('Otty replaced 2 things that looked like a key or password')
  expect(sent).toContain('DEBUG=true') // what isn't a key is left alone

  await expectNotFound(panel, ENV_KEY)
  expect(dbText(otty)).not.toContain(ENV_KEY)
  expect(dbText(otty)).not.toContain(ENV_PASSWORD)
})

test('a highlighted key is hidden before sending and says so; typed words stay as typed', { tag: ['@step-118', '@gate'] }, async ({ otty, world }) => {
  world.reply(turn('[hidden key]'), { say: 'This sets an environment variable for your API key.' })
  world.reply(turn('what’s my key?'), { say: 'It was hidden before sending, so I never saw it.' })
  world.reply(turn('my password is hunter2'), { say: 'Noted that you typed it yourself.' })
  world.backgroundReply = 'Terminal key'
  await otty.mac({ selection: `export OPENAI_API_KEY=${TERMINAL_KEY}`, front: { name: 'Terminal', bundleId: 'com.apple.Terminal' } })
  // A capture sent while the quick view is still loading is lost, so wait for it first.
  const quick = await otty.view('quick')
  await expect(quick.locator('textarea')).toBeAttached()
  await otty.press('Alt+Space')
  await expect(quick.getByText('export OPENAI_API_KEY')).toBeVisible()
  await quick.locator('textarea').first().press('Enter')
  await expect(quick.getByText('This sets an environment variable')).toBeVisible()

  await quick.getByRole('button', { name: /continue in chat/ }).click()
  const panel = await otty.view('panel')
  await expect(panel.getByText('Otty hid 1 key before sending')).toBeVisible()
  await expect(panel.getByText('export OPENAI_API_KEY=[hidden key]')).toBeVisible()

  await otty.ask(panel, 'what’s my key?')
  await expect(panel.getByText('It was hidden before sending')).toBeVisible()
  await otty.ask(panel, 'my password is hunter2')
  await expect(panel.getByText('Noted that you typed it yourself.')).toBeVisible()
  await expect(panel.getByText('my password is hunter2', { exact: true })).toBeVisible()

  const sent = sentText(world)
  expect(sent).not.toContain(TERMINAL_KEY)
  expect(sent).toContain('export OPENAI_API_KEY=[hidden key]')
  expect(sent).toContain('my password is hunter2')

  await expectNotFound(panel, TERMINAL_KEY)
  expect(dbText(otty)).not.toContain(TERMINAL_KEY)
})
