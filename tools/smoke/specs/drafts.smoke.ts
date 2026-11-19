// The message box's words are kept per chat in main (D-62): moving from the quick view to the panel, or between chats,
// never loses them.
import { expect, test } from '../fixtures'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)
const SAFARI = { name: 'Safari', bundleId: 'com.apple.Safari', title: 'Otters', url: 'https://example.com/otters' }

test('a follow-up typed in the quick view is still in the box after ↵ continue in chat', { tag: ['@step-145'] }, async ({ otty, world }) => {
  world.reply(turn('Sea otters hold hands'), { say: 'So they don’t drift apart while they sleep.' })
  const quick = await otty.view('quick')
  await expect(quick.locator('textarea')).toBeAttached()
  await otty.mac({ selection: 'Sea otters hold hands', front: SAFARI })
  await otty.press('Alt+Space')
  await expect(quick.getByText('Sea otters hold hands')).toBeVisible()
  await quick.locator('textarea').press('Enter')
  await expect(quick.getByText('So they don’t drift apart while they sleep.')).toBeVisible()

  await quick.getByRole('textbox', { name: 'Ask a follow-up' }).fill('Do river otters do it too?')
  await quick.getByRole('button', { name: /continue in chat/ }).click()
  const panel = await otty.view('panel')
  await expect(panel.locator('textarea')).toHaveValue('Do river otters do it too?')
})

test('a draft stays with its chat across a switch, and Recent chats says so', { tag: ['@step-146'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Otter naps'
  world.reply(turn('How long do otters sleep?'), { say: 'About eleven hours a day.' })
  world.reply(turn('What do otters eat?'), { say: 'Mostly fish and shellfish.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'How long do otters sleep?')
  await expect(panel.getByText('About eleven hours a day.')).toBeVisible()
  await panel.locator('textarea').fill('And in the winter?')

  await panel.getByRole('button', { name: 'New chat' }).click()
  await expect(panel.locator('textarea')).toHaveValue('')
  await otty.ask(panel, 'What do otters eat?')
  await expect(panel.getByText('Mostly fish and shellfish.')).toBeVisible()

  await otty.go(panel, 'Chats')
  // Both chats get the same scripted title, so the draft is what tells them apart.
  const row = panel.getByRole('button', { name: /Draft: And in the winter\?/ })
  await expect(row).toHaveCount(1)
  await row.click()
  await expect(panel.locator('textarea')).toHaveValue('And in the winter?')
})
