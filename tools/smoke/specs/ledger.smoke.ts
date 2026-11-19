// D-46 and D-63: the action ledger, read in the Logbook. A change Otty makes is listed under What Otty changed, with
// whether it can be undone; Undo there takes it back like the receipt's, and Forget all chats clears the list.
import { expect, test } from '../fixtures'
import { entry, openEntry } from '../logbook'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)

test('a reminder Reminders gave no id for is listed under What Otty changed as done for good, and Forget all chats clears it', { tag: ['@step-131'] }, async ({ otty, world }) => {
  world.reply(turn('Remind me to feed the otters'), { calls: [{ name: 'create_reminder', args: { title: 'Feed the otters' } }] }, { say: 'It’s in Reminders.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Remind me to feed the otters')
  await panel.locator('.confirm-card').getByRole('button', { name: 'Add it' }).click()
  await expect(panel.getByText('It’s in Reminders.')).toBeVisible()

  await otty.settings(panel, 'Privacy')
  await panel.getByRole('button', { name: 'See what Otty changed' }).click()
  await expect(panel.locator('.log-head__menu')).toHaveText('What Otty changed')
  const row = entry(panel, 'Reminder added: Feed the otters')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Can’t be undone')
  await expect(row.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)

  await otty.settings(panel, 'Privacy')
  await otty.hold(panel.getByRole('button', { name: 'Hold to forget: Forget all chats' }))
  await expect(panel.getByRole('group', { name: 'Can’t be undone' })).toContainText('Forgotten')
  await panel.getByRole('button', { name: 'See what Otty changed' }).click()
  await expect(panel.getByText('Otty hasn’t changed anything yet.', { exact: false })).toBeVisible()
})

test('Undo in What Otty changed removes the reminder, and the chat’s receipt says Undone too', { tag: ['@step-149'] }, async ({ otty, world }) => {
  await otty.mac({ script: { stdout: 'x-apple-reminder://R1\n' } })
  world.reply(turn('Remind me to feed the otters'), { calls: [{ name: 'create_reminder', args: { title: 'Feed the otters' } }] }, { say: 'It’s in Reminders.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Remind me to feed the otters')
  await panel.locator('.confirm-card').getByRole('button', { name: /^Add it/ }).click()
  await expect(panel.getByText('It’s in Reminders.')).toBeVisible()

  await otty.settings(panel, 'Privacy')
  await panel.getByRole('button', { name: 'See what Otty changed' }).click()
  const row = entry(panel, 'Reminder added: Feed the otters')
  await row.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(row).toContainText('Undone')
  const scripts = (await otty.snapshot()).calls.filter((c) => c.kind === 'osascript')
  expect(scripts).toHaveLength(2)
  const args = scripts[1].detail
  expect(args.slice(args.indexOf('--') + 1)).toEqual(['x-apple-reminder://R1'])

  const details = await openEntry(row)
  await details.locator('.log-details__link').click()
  await expect(panel.locator('.receipt')).toContainText('Undone')
})
