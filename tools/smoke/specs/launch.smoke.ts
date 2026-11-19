import { expect, test } from '../fixtures'

test.describe('first launch', () => {
  test.use({ seed: null })

  test('shows onboarding, the otter and the menu bar menu', { tag: ['@step-1', '@step-2', '@gate'] }, async ({ otty }) => {
    const panel = await otty.view('panel')
    await expect(panel.getByText('Hi! I’m Otty')).toBeVisible()
    await otty.view('bubble')
    const s = await otty.snapshot()
    expect(s.shortcuts).toEqual(expect.arrayContaining(['Alt+Space', 'Alt+Shift+Space', 'Command+Alt+Shift+Space']))
    expect(await otty.control((c) => c.tray())).toEqual(expect.arrayContaining(['Open chat', 'Settings…']))
  })
})

test('asks, streams an answer, and keeps the chat across a relaunch', { tag: ['@step-15', '@step-16', '@gate'] }, async ({ otty, world }) => {
  world.reply('What do otters eat?', { say: 'Otters mostly eat **fish** and shellfish.' })
  world.backgroundReply = 'Otters and food'
  const panel = await otty.openPanel()
  await panel.getByPlaceholder('Ask Otty anything…').fill('What do otters eat?')
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(panel.getByText('Otters mostly eat')).toBeVisible()
  await expect(panel.getByRole('strong').filter({ hasText: 'fish' })).toBeVisible()

  // The request carried the seeded key and the question, and went to the service in Settings.
  const sent = world.requests.find((r) => r.url === 'https://api.deepseek.com/chat/completions')
  expect(sent?.authorization).toBe('Bearer sk-smoke-0000000000000000')

  await otty.relaunch()
  const again = await otty.openPanel()
  await otty.go(again, 'Chats')
  await again.getByRole('button', { name: /Otters and food/ }).click()
  await expect(again.getByText('What do otters eat?')).toBeVisible()
  await expect(again.getByText('Otters mostly eat')).toBeVisible()
})

test('a force quit mid-answer keeps the question', { tag: ['@step-44'] }, async ({ otty, world }) => {
  world.reply('Tell me a long story', { say: 'Once upon a time…' })
  world.backgroundReply = 'A long story'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Tell me a long story')
  await expect(panel.getByText('Once upon a time')).toBeVisible()
  await otty.crash()
  const again = await otty.openPanel()
  await otty.go(again, 'Chats')
  await again.getByRole('button', { name: /A long story|Tell me a long story/ }).first().click()
  await expect(again.getByText('Tell me a long story')).toBeVisible()
})
