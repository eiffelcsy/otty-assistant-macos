// D-46: the action ledger. A change Otty makes is listed in Activity › What Otty changed, with whether it can be
// undone, and Forget all chats clears the list.
import { expect, test } from '../fixtures'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)

test('a reminder is listed under What Otty changed as done for good, and Forget all chats clears it', { tag: ['@step-131'] }, async ({ otty, world }) => {
  world.reply(turn('Remind me to feed the otters'), { calls: [{ name: 'create_reminder', args: { title: 'Feed the otters' } }] }, { say: 'It’s in Reminders.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Remind me to feed the otters')
  await panel.locator('.confirm-card').getByRole('button', { name: 'Add it' }).click()
  await expect(panel.getByText('It’s in Reminders.')).toBeVisible()

  await panel.getByRole('button', { name: 'Settings' }).click()
  await panel.getByRole('button', { name: 'See what Otty changed' }).click()
  await expect(panel.getByRole('tab', { name: 'What Otty changed' })).toHaveAttribute('aria-selected', 'true')
  const row = panel.locator('.sent-row', { hasText: 'Reminder added: Feed the otters' })
  await expect(row).toBeVisible()
  await expect(row).toContainText('can’t be undone')

  await panel.getByRole('button', { name: 'Settings' }).click()
  await panel.getByRole('button', { name: 'Forget all chats' }).click()
  await expect(panel.getByRole('button', { name: 'All chats forgotten' })).toBeVisible()
  await panel.getByRole('button', { name: 'See what Otty changed' }).click()
  await expect(panel.getByText('Otty hasn’t changed anything yet.', { exact: false })).toBeVisible()
})
