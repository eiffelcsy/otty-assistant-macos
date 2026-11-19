// The chat and its message box (D-62, Spec 03): ⌘. stops an answer, ↑ in an empty box edits the last question, and
// while everything is paused the box sends nothing until Carry on.
import { expect, test } from '../fixtures'
import { holdAnswers } from '../hold'

test('⌘. stops an answer that is still coming', { tag: ['@step-153'] }, async ({ otty, world }) => {
  world.reply('Tell me about otters', { say: 'Otters are playful.' })
  const panel = await otty.openPanel()
  const release = holdAnswers(world)
  try {
    await otty.ask(panel, 'Tell me about otters')
    await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible()
    await panel.keyboard.press('Meta+Period')
    await expect(panel.getByText('You stopped this answer.')).toBeVisible()
  } finally {
    release()
  }
})

test('↑ in an empty box brings the last question back to edit', { tag: ['@step-154'] }, async ({ otty, world }) => {
  world.reply('What do otters eat?', { say: 'Mostly fish and shellfish.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'What do otters eat?')
  await expect(panel.getByText('Mostly fish and shellfish.')).toBeVisible()
  const box = panel.getByRole('textbox')
  await box.focus()
  await box.press('ArrowUp')
  await expect(box).toHaveValue('What do otters eat?')
  await expect(panel.getByText('Mostly fish and shellfish.')).toHaveCount(0)
})

test('paused, the box says so and sends nothing; Carry on lets it ask again', { tag: ['@step-155'] }, async ({ otty, world }) => {
  world.reply('Are otters awake?', { say: 'Yes, and hungry.' })
  const panel = await otty.openPanel()
  expect(await otty.control((c) => c.clickTray('Until I say'))).toBe(true)
  const box = panel.getByPlaceholder('Otty is paused')
  await expect(box).toBeVisible()
  await box.fill('Are otters awake?')
  await box.press('Enter')
  await expect(box).toHaveValue('Are otters awake?')
  expect(world.turnRequests()).toEqual([])
  await panel.getByRole('button', { name: 'Paused · Carry on' }).click()
  await expect(panel.getByPlaceholder('Otty is paused')).toHaveCount(0)
  await panel.getByRole('textbox').press('Enter')
  await expect(panel.getByText('Yes, and hungry.')).toBeVisible()
})
