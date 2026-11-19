// Recent chats and search across chats (D-3, D-7): checklist steps 26–28.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import type { World } from '../world/server'

/** Paragraphs that make an answer tall, so a long chat really scrolls. Words chosen not to match any search here. */
function filler(topic: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `Part ${i + 1} on ${topic}: take it slowly, one small step at a time, and check each result before going on.`).join('\n\n')
}

/** Asks `q` in the panel and waits for the whole answer. A chat's first answer also gets its `title`. */
async function turn(otty: Otty, panel: Page, world: World, q: string, say: string, title?: string): Promise<void> {
  world.reply((text, body) => body.stream === true && text.includes(q), { say })
  if (title) world.reply((text, body) => !body.stream && text.includes(q), { say: title })
  await otty.ask(panel, q)
  // Answers here are plain text, so their last paragraph shows exactly as written.
  await expect(panel.getByText(say.split('\n').pop()!)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
  // The title is written in the background; wait for it so the next chat can't take its reply.
  if (title) await expect.poll(() => world.modelRequests().some((b) => !b.stream && JSON.stringify(b.messages).includes(q))).toBe(true)
}

/** Whether the panel window is on screen. */
function panelShown(otty: Otty): Promise<boolean> {
  return otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('view=panel') && w.isVisible()))
}

async function threeChats(otty: Otty, panel: Page, world: World): Promise<void> {
  await turn(otty, panel, world, 'How do I print a PDF on both sides?', 'Open the 打印 dialog with ⌘P, then tick Two-Sided before you press Print.', 'Printing a PDF')
  await panel.getByRole('button', { name: 'New chat' }).click()
  await turn(otty, panel, world, 'What is the best way to brew tea?', 'Steep oolong leaves in hot water for about three minutes.', 'Brewing tea')
  await panel.getByRole('button', { name: 'New chat' }).click()
  await turn(otty, panel, world, 'Why does my wifi keep dropping?', 'Restart the router and move it away from the microwave.', 'Fixing the wifi')
}

test('⇧⌘F and ⌘F open Recent chats ready to search; search finds English and Chinese; Esc clears, then closes', { tag: ['@step-26', '@step-27'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await threeChats(otty, panel, world)

  // ⇧⌘F from a chat with messages.
  await panel.keyboard.press('Meta+Shift+F')
  await expect(panel.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible()
  const search = panel.getByPlaceholder('Search your chats')
  await expect(search).toBeFocused()
  await expect(panel.getByRole('button', { name: /Printing a PDF/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Brewing tea/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Fixing the wifi/ })).toBeVisible()

  // A word from an answer: only that chat, with the word marked in its snippet.
  await search.fill('oolong')
  await expect(panel.getByRole('button', { name: /Brewing tea/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Printing a PDF|Fixing the wifi/ })).toHaveCount(0)
  await expect(panel.locator('mark').filter({ hasText: /^oolong$/i })).toBeVisible()

  // Two Chinese characters (shorter than the trigram index) still find the right chat.
  await search.fill('打印')
  await expect(panel.getByRole('button', { name: /Printing a PDF/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Brewing tea|Fixing the wifi/ })).toHaveCount(0)
  await expect(panel.locator('mark').filter({ hasText: '打印' })).toBeVisible()

  await search.fill('platypus')
  await expect(panel.getByText('No chats mention “platypus”')).toBeVisible()

  // The first Esc only clears the search; the panel stays.
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(panel.getByRole('button', { name: /Fixing the wifi/ })).toBeVisible()
  expect(await panelShown(otty)).toBe(true)

  // ⌘F on an empty chat also opens Recent chats with the box focused.
  await otty.go(panel, 'Chat')
  await expect(panel.getByRole('heading', { name: 'Chats', exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: 'New chat' }).click()
  await expect(panel.locator('.screen-menu__title')).toHaveText('New chat')
  await panel.keyboard.press('Meta+F')
  await expect(panel.getByRole('heading', { name: 'Chats', exact: true })).toBeVisible()
  await expect(search).toBeFocused()

  // With nothing to clear, Esc closes the panel.
  await search.press('Escape')
  await expect.poll(() => panelShown(otty)).toBe(false)
})

test('a search result opens the chat at the matching message, and a follow-up is followed', { tag: ['@step-28'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await turn(otty, panel, world, 'Tell me about kelp forests', `Kelp anchors to rock with a holdfast, not roots.\n\n${filler('kelp', 6)}`, 'Kelp forests')
  await turn(otty, panel, world, 'What lives there?', filler('sea life', 8))
  await turn(otty, panel, world, 'And what eats the urchins?', filler('urchins', 8))
  await panel.getByRole('button', { name: 'New chat' }).click()
  await expect(panel.getByText('Kelp anchors to rock')).toHaveCount(0)

  await panel.keyboard.press('Meta+Shift+F')
  await panel.getByPlaceholder('Search your chats').fill('holdfast')
  await panel.getByRole('button', { name: /Kelp forests/ }).click()

  // The matching answer is on screen and glows; the newest answer, far below it, isn't.
  const found = panel.locator('.msg--found')
  await expect(found).toHaveCount(1)
  await expect(found).toContainText('holdfast')
  await expect(found).toBeInViewport()
  await expect(panel.getByText('Part 8 on urchins')).not.toBeInViewport()

  // A follow-up: the view follows the new answer, and the glow is gone.
  await turn(otty, panel, world, 'Are sea otters part of that?', `Yes: otters eat urchins, which keeps the kelp standing.\n\n${filler('otters', 4)}`)
  await expect(panel.getByText('Part 4 on otters')).toBeInViewport()
  await expect(found).toHaveCount(0)
})
