// What left your Mac (D-31): one row per question, search and page read, in names and counts, gone with its chat.
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)

/** Tomorrow at 9:00, in the local ISO time `schedule_job` takes. */
function tomorrowAtNine(): string {
  const d = new Date(Date.now() + 24 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00:00`
}

/** Activity › What left your Mac, from the chat. */
async function openSent(panel: Page): Promise<void> {
  await panel.getByTitle('Activity', { exact: true }).click()
  await panel.getByRole('tab', { name: 'What left your Mac' }).click()
}

const row = (panel: Page, text: string) => panel.locator('.sent-row', { hasText: text })

test('a highlight question, a search and a page each have a row; Open goes to the chat; rows go with their chat and with Remember my chats', { tag: ['@step-117'] }, async ({ otty, world }) => {
  world.reply(turn('Sea otters hold hands while they sleep.'), { say: 'They hold hands so they don’t drift apart.' })
  world.search('otter facts', [{ title: 'Otter facts', url: 'https://facts.example.org/otters' }])
  world.read('https://facts.example.org/otters', 'Otters have the densest fur of any animal.')
  world.reply(
    turn('Find otter facts and read one'),
    { calls: [{ name: 'search_web', args: { query: 'otter facts' } }] },
    { calls: [{ name: 'read_page', args: { url: 'https://facts.example.org/otters' } }] },
    { say: 'Otters have very thick fur.' }
  )
  world.reply(
    turn('Check otter news tomorrow at 9'),
    { calls: [{ name: 'schedule_job', args: { title: 'Otter news', brief: 'Find this week’s otter news.', at: tomorrowAtNine() } }] },
    { say: 'I’ll look tomorrow at 9.' }
  )
  world.reply(
    turn('Check otter news tomorrow at 9 please'),
    { calls: [{ name: 'schedule_job', args: { title: 'Otter news', brief: 'Find this week’s otter news.', at: tomorrowAtNine() } }] },
    { say: 'I’ll look tomorrow at 9, as asked.' }
  )

  // A question about a highlight, from the quick view.
  world.backgroundReply = 'Holding hands'
  await otty.mac({ selection: 'Sea otters hold hands while they sleep.', front: { name: 'Notes', bundleId: 'com.apple.Notes' } })
  const quick = await otty.view('quick')
  await expect(quick.locator('textarea')).toBeAttached()
  await otty.press('Alt+Space')
  await expect(quick.getByText('Sea otters hold hands while they sleep.')).toBeVisible()
  await quick.locator('textarea').first().press('Enter')
  await expect(quick.getByText('so they don’t drift apart')).toBeVisible()
  await quick.keyboard.press('Escape')

  // A search and a page read, in a chat of their own.
  world.backgroundReply = 'Otter facts'
  const panel = await otty.openPanel()
  // The panel opens on the highlight's chat; start another.
  await panel.getByTitle('New chat').click()
  await otty.ask(panel, 'Find otter facts and read one')
  await expect(panel.getByText('Otters have very thick fur.')).toBeVisible()

  // Activity only appears once something is in it (see the report), so schedule something to reach the list.
  await otty.ask(panel, 'Check otter news tomorrow at 9')
  await panel.locator('.confirm-card').getByRole('button', { name: 'Yes, go ahead' }).click()
  await expect(panel.getByText('I’ll look tomorrow at 9.')).toBeVisible()

  await openSent(panel)
  const asked = row(panel, 'Asked DeepSeek: 1 highlight')
  await expect(asked).toBeVisible()
  await expect(asked).toContainText('api.deepseek.com')
  await expect(row(panel, 'Searched DeepSeek for “otter facts”')).toBeVisible()
  await expect(row(panel, 'Read https://facts.example.org/otters through DeepSeek')).toBeVisible()
  // Rows hold names and counts, never what was asked.
  await expect(panel.locator('.sent')).not.toContainText('hold hands')

  await asked.getByRole('button', { name: 'Open' }).click()
  await expect(panel.getByText('so they don’t drift apart')).toBeVisible()

  // Forget that chat: its rows go, the others stay.
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.locator('.history__item', { hasText: 'Holding hands' }).getByTitle('Forget this chat').click()
  await expect(panel.locator('.history__item', { hasText: 'Holding hands' })).toHaveCount(0)
  await openSent(panel)
  await expect(row(panel, 'Searched DeepSeek for “otter facts”')).toBeVisible()
  await expect(row(panel, 'Asked DeepSeek: 1 highlight')).toHaveCount(0)

  // Remember my chats off: the list empties.
  await panel.getByTitle('Settings').click()
  await panel.getByRole('checkbox', { name: /Remember my chats/ }).uncheck()
  await panel.getByRole('button', { name: 'Save' }).click()
  await panel.getByTitle('Back to chat').click()
  // That forgets the chats and the scheduled look with them, so Activity goes too. Schedule another to reach the list:
  // only that question is left on it.
  await expect(panel.getByTitle('Activity', { exact: true })).toHaveCount(0)
  await otty.ask(panel, 'Check otter news tomorrow at 9 please')
  await panel.locator('.confirm-card').getByRole('button', { name: 'Yes, go ahead' }).click()
  await expect(panel.getByText('I’ll look tomorrow at 9, as asked.')).toBeVisible()
  await openSent(panel)
  await expect(row(panel, 'Asked DeepSeek').first()).toBeVisible()
  await expect(row(panel, 'Searched DeepSeek')).toHaveCount(0)
  await expect(row(panel, 'facts.example.org')).toHaveCount(0)
})
