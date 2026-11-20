// My own tiles (D-56), Pebbles' Keep (step 1) and Otty's own tooltips (D-59).
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import type { ModelBody } from '../world/server'
import { textOf } from '../world/server'
import { expect, test, type Otty } from '../fixtures'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)
const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code}\n\`\`\``

async function attach(otty: Otty, panel: Page, name: string, text: string): Promise<void> {
  const path = join(otty.home, name)
  writeFileSync(path, text)
  await otty.control((c, p) => c.nextOpen(p), [path])
  await panel.getByRole('button', { name: 'Attach files' }).click()
  await expect(panel.getByRole('button', { name: /^Summarize/ })).toBeVisible()
}

test('a tile made in Settings shows for its kind of capture and sends its words as typed', { tag: ['@step-169'] }, async ({ otty, world }) => {
  world.reply(streamed('Turn this into five flashcards.'), { say: 'Here are five flashcards.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'My tiles')
  await panel.getByText('Add a tile').click()
  await panel.getByPlaceholder('Make flashcards').fill('Flashcards')
  await panel.getByPlaceholder(/Turn this into five/).fill('Turn this into five flashcards.')
  await panel.getByRole('combobox').selectOption('file')
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.locator('.set-row', { hasText: 'Flashcards' })).toContainText('A file')

  await otty.go(panel, 'Chat')
  await expect(panel.getByRole('button', { name: /Flashcards/ })).toHaveCount(0)
  await attach(otty, panel, 'otters.txt', 'Sea otters hold hands while they sleep so they don’t drift apart.')
  await panel.getByRole('button', { name: /Flashcards/ }).click()
  await expect(panel.locator('.msg--otty').last()).toContainText('Here are five flashcards.')
  await expect(panel.locator('.msg--user').last()).toContainText('Turn this into five flashcards.')
  const asked = world.modelRequests().filter((b) => b.stream).at(-1)!
  expect(textOf(asked.messages?.filter((m) => m.role === 'user').at(-1)?.content)).toContain('Turn this into five flashcards.')
})

test('a tile Otty drafts in a chat is kept only from its card’s button', { tag: ['@step-170'] }, async ({ otty, world }) => {
  const draft = JSON.stringify({ name: 'Reply politely', icon: 'envelope', prompt: 'Draft a short, polite reply to this.', when: 'text' })
  world.reply(streamed('make me a tile for polite replies'), { say: `Here's a tile you can save.\n\n${fence('tile', draft)}` })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'make me a tile for polite replies')
  const card = panel.locator('.tile-card')
  await expect(card.getByPlaceholder('Make flashcards')).toHaveValue('Reply politely')
  await otty.settings(panel, 'My tiles')
  await expect(panel.locator('.set-row', { hasText: 'Reply politely' })).toHaveCount(0)
  await otty.go(panel, 'Chat')
  await panel.locator('.tile-card').getByRole('button', { name: 'Save tile' }).click()
  await expect(panel.getByText(/Saved “Reply politely” to My tiles/)).toBeVisible()
  await otty.settings(panel, 'My tiles')
  await expect(panel.locator('.set-row', { hasText: 'Reply politely' })).toContainText('Highlighted text')
})

test('a chart can be kept, and is still kept after a restart', { tag: ['@step-171'] }, async ({ otty, world }) => {
  world.reply(streamed('chart my month'), { say: `Rent is most of the month.\n\n${fence('mermaid', 'pie title "Monthly spending"\n  "Rent" : 1200\n  "Food" : 400')}` })
  world.backgroundReply = 'My month'
  let panel = await otty.openPanel()
  await otty.ask(panel, 'chart my month')
  const card = () => panel.locator('.drawing-card')
  await card().getByRole('button', { name: 'Keep' }).click()
  await expect(card().getByRole('button', { name: 'Kept' })).toBeVisible()

  await otty.relaunch()
  panel = await otty.openPanel()
  await otty.go(panel, 'Chats')
  await panel.getByRole('button', { name: /My month/ }).click()
  await expect(card().getByRole('button', { name: 'Kept' })).toBeVisible()
  await card().getByRole('button', { name: 'Kept' }).click()
  await expect(card().getByRole('button', { name: 'Keep' })).toBeVisible()
})

test('header buttons show Otty’s own tooltip with their key', { tag: ['@step-172'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  const button = panel.getByRole('button', { name: 'New chat', exact: true })
  await button.hover()
  await expect(panel.locator('.tooltip')).toHaveText('New chat ⌘N')
  await expect(button).not.toHaveAttribute('title', /.+/)
  await panel.mouse.move(0, 300)
  await expect(panel.locator('.tooltip')).toBeHidden()
  await expect(button).toHaveAttribute('title', 'New chat ⌘N')
})
