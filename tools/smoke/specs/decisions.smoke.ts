// Decisions and receipts (D-60, docs/design/specs/01-decisions.md): cards in their own words, buttons that can't be
// hit by accident, and a receipt that stays in the chat.
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)
const card = (panel: Page) => panel.locator('.confirm-card')
const receipts = (panel: Page) => panel.locator('.receipt')

test('a page Otty doesn’t know asks with Read it and Skip, and leaves “Read <host>”, still there after reopening', { tag: ['@step-139'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Kelp forests'
  const page = 'https://kelp.example.net/article?id=42'
  world.read(page, { title: 'Kelp', content: 'Kelp forests shelter sea otters.' })
  world.reply(turn('Read the kelp article'), { calls: [{ name: 'read_page', args: { url: page } }] }, { say: 'Kelp forests shelter sea otters.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Read the kelp article')
  await expect(card(panel)).toContainText('Read this page?')
  await expect(card(panel)).toContainText('kelp.example.net')
  await expect(card(panel)).toContainText('/article?id=42')
  await expect(card(panel).getByRole('button', { name: 'Skip' })).toBeVisible()
  await card(panel).getByRole('button', { name: /^Read it/ }).click()
  await expect(panel.getByText('Kelp forests shelter sea otters.')).toBeVisible()
  await expect(receipts(panel)).toHaveText('Read kelp.example.net')

  await panel.getByRole('button', { name: 'New chat' }).click()
  await otty.go(panel, 'Chats')
  await panel.getByRole('button', { name: /Kelp forests/ }).click()
  await expect(receipts(panel)).toHaveText('Read kelp.example.net')
})

test('an address in another alphabet says so on its card', { tag: ['@step-140'] }, async ({ otty, world }) => {
  world.reply(turn('Check my Apple account'), { calls: [{ name: 'read_page', args: { url: 'https://аpple.com/account' } }] }, { say: 'All right, I won’t.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Check my Apple account')
  await expect(card(panel)).toContainText('xn--pple-43d.com')
  await expect(card(panel)).toContainText('This address uses letters from another alphabet.')
  await card(panel).getByRole('button', { name: 'Skip' }).click()
  await expect(receipts(panel)).toHaveText('Skipped xn--pple-43d.com')
})

test('a click the instant a card appears does nothing', { tag: ['@step-141'] }, async ({ otty, world }) => {
  world.reply(turn('Open the otter page'), { calls: [{ name: 'open_url', args: { url: 'https://otters.example/' } }] }, { say: 'Okay.' })
  const panel = await otty.openPanel()
  // Clicked from inside the page in the same tick the button mounts, so it always lands while the card is arming:
  // a Playwright click took longer than ARM_MS on CI's slower Mac and was rightly counted. detail 1 = a mouse click.
  const clicked = panel.evaluate(
    () =>
      new Promise<void>((done) => {
        const watch = new MutationObserver(() => {
          const open = [...document.querySelectorAll<HTMLButtonElement>('.confirm-card button')].find((b) => b.textContent?.startsWith('Open it'))
          if (!open) return
          watch.disconnect()
          open.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
          done()
        })
        watch.observe(document.body, { childList: true, subtree: true })
      })
  )
  await otty.ask(panel, 'Open the otter page')
  await clicked
  await card(panel).getByRole('button', { name: 'Skip' }).click()
  await expect(receipts(panel)).toHaveText('Skipped otters.example')
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'open-external')).toEqual([])
})

test('Undo on a reminder’s receipt removes that reminder', { tag: ['@step-142'] }, async ({ otty, world }) => {
  await otty.mac({ script: { stdout: 'x-apple-reminder://R1\n' } })
  world.reply(turn('Remind me to feed the otters'), { calls: [{ name: 'create_reminder', args: { title: 'Feed the otters' } }] }, { say: 'It’s in Reminders.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Remind me to feed the otters')
  await card(panel).getByRole('button', { name: /^Add it/ }).click()
  await expect(receipts(panel)).toHaveText('Added “Feed the otters” · Undo')
  await receipts(panel).getByRole('button', { name: 'Remove the reminder “Feed the otters”' }).click()
  await expect(receipts(panel)).toHaveText('Added “Feed the otters” · Undone')
  const scripts = (await otty.snapshot()).calls.filter((c) => c.kind === 'osascript')
  expect(scripts).toHaveLength(2)
  const args = scripts[1].detail
  expect(args.filter((_a, i) => args[i - 1] === '-e').join('\n')).toContain('delete')
  expect(args.slice(args.indexOf('--') + 1)).toEqual(['x-apple-reminder://R1'])
})
