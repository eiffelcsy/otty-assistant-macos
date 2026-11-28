// Quiet chrome (D-85) and Home widgets (D-86): icons named by their tooltips, with keys for the latest answer, and the
// widgets Home shows, chosen from Customise Home.
import { expect, test, type Otty } from '../fixtures'
import type { ModelBody } from '../world/server'

const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

const clipboardText = (otty: Otty) => otty.app.evaluate(({ clipboard }) => clipboard.readText())

test('the latest answer’s icons: Copy’s tooltip has its key, ⇧⌘C copies and ⌘R tries again', { tag: ['@step-210'] }, async ({ otty, world }) => {
  world.reply(streamed('tell me about otters'), { say: 'Otters hold hands.' }, { say: 'Otters, once more.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'tell me about otters')
  const answer = panel.locator('.msg--otty').last()
  await expect(answer).toContainText('Otters hold hands.')
  await expect(answer.locator('.msg__actions')).not.toContainText(/\w/)

  await answer.getByRole('button', { name: 'Copy' }).hover()
  await expect(panel.locator('.tooltip')).toHaveText('Copy⇧⌘C')
  await panel.keyboard.press('Meta+Shift+C')
  await expect.poll(() => clipboardText(otty)).toBe('Otters hold hands.')

  await panel.keyboard.press('Meta+R')
  await expect(panel.locator('.msg--otty').last()).toContainText('Otters, once more.')
  await expect(panel.getByText('Otters hold hands.')).toHaveCount(0)
})

test('Home’s Calendar widget opens the Calendar, and Customise Home turns it off for good', { tag: ['@step-211'] }, async ({ otty }) => {
  let panel = await otty.openPanel()
  await panel.keyboard.press('Meta+1')
  let home = panel.getByRole('main', { name: 'Home' })
  const calendar = home.getByRole('region', { name: 'Calendar' })
  await expect(calendar).toContainText('A clear day.')
  await calendar.getByRole('button', { name: 'Open Calendar' }).click()
  await expect(panel.getByRole('main', { name: 'Home' })).toBeHidden()

  await panel.keyboard.press('Meta+1')
  await home.getByRole('button', { name: 'Customise Home' }).click()
  await panel.getByRole('menuitemcheckbox', { name: 'Calendar' }).click()
  await expect(home.getByRole('region', { name: 'Calendar' })).toHaveCount(0)

  await otty.relaunch()
  panel = await otty.openPanel()
  await panel.keyboard.press('Meta+1')
  home = panel.getByRole('main', { name: 'Home' })
  await expect(home.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(home.getByRole('region', { name: 'Calendar' })).toHaveCount(0)
})

test('a tile for anything shows in Home’s My tiles and asks its question in a new chat', { tag: ['@step-212'] }, async ({ otty, world }) => {
  world.reply(streamed('Help me plan my week.'), { say: 'Let’s start with Monday.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'My tiles')
  await panel.getByText('Add a tile').click()
  await panel.getByPlaceholder('Make flashcards').fill('Plan my week')
  await panel.getByPlaceholder(/Turn this into five/).fill('Help me plan my week.')
  await panel.getByRole('button', { name: 'Save', exact: true }).click()

  await panel.keyboard.press('Meta+1')
  const tiles = panel.getByRole('main', { name: 'Home' }).getByRole('region', { name: 'My tiles' })
  await tiles.getByRole('button', { name: /Plan my week/ }).click()
  await expect(panel.locator('.msg--user').last()).toContainText('Help me plan my week.')
  await expect(panel.locator('.msg--otty').last()).toContainText('Let’s start with Monday.')
})
