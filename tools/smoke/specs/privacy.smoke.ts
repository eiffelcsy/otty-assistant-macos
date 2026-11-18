// Privacy and retention of saved chats (D-3): checklist steps 17, 43 and 45.
import type { Page } from '@playwright/test'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { expect, test, type Otty } from '../fixtures'
import type { World } from '../world/server'

const DAY = 86_400_000

/** Asks `q` and waits for its answer (plain text) and its title, written in the background. */
async function chat(otty: Otty, panel: Page, world: World, q: string, say: string, title: string): Promise<void> {
  world.reply((text, body) => body.stream === true && text.includes(q), { say })
  world.reply((text, body) => !body.stream && text.includes(q), { say: title })
  await otty.ask(panel, q)
  await expect(panel.getByText(say)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
  await expect.poll(() => world.modelRequests().some((b) => !b.stream && JSON.stringify(b.messages).includes(q))).toBe(true)
}

/** The hold on the forget prompt under a Privacy row (D-61). */
const holdPrompt = (otty: Otty, panel: Page, name: RegExp) => otty.hold(panel.getByRole('group', { name }).getByRole('button', { name: 'Hold to forget' }))

test('turning off "Remember my chats" forgets them and hides Recent chats', { tag: ['@step-17'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await chat(otty, panel, world, 'How tall do giraffes grow?', 'Up to about five and a half metres.', 'Giraffe height')

  await otty.settings(panel, 'Privacy')
  await panel.getByRole('checkbox', { name: /Remember my chats/ }).uncheck()
  // It asks first, with the real count, and nothing goes until the hold.
  await expect(panel.getByRole('group', { name: 'Turn off and forget 1 chat?' })).toBeVisible()
  await panel.getByRole('button', { name: 'Keep them' }).click()
  await expect(panel.getByRole('checkbox', { name: /Remember my chats/ })).toBeChecked()
  await panel.getByRole('checkbox', { name: /Remember my chats/ }).uncheck()
  await holdPrompt(otty, panel, /^Turn off and forget/)
  await expect(panel.getByText('Saved')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Recent chats' })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: /Forget all chats/ })).toHaveCount(0)

  // The open chat went too, and ⇧⌘F has nowhere to go.
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await expect(panel.getByText('Up to about five and a half metres.')).toHaveCount(0)
  await panel.keyboard.press('Meta+Shift+F')
  await expect(panel.getByText('Recent chats', { exact: true })).toHaveCount(0)

  // Turned back on, the list is empty: the chat was forgotten, not hidden.
  await otty.settings(panel, 'Privacy')
  await panel.getByRole('checkbox', { name: /Remember my chats/ }).check()
  await expect(panel.getByText('Saved')).toBeVisible()
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await expect(panel.getByText('No chats yet')).toBeVisible()
})

test('Keep chats for 30 days asks with the count, then forgets older chats', { tag: ['@step-45'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await chat(otty, panel, world, 'What is a fjord?', 'A long, narrow sea inlet carved by a glacier.', 'Fjords explained')
  // Forty days pass.
  await otty.control((c, ms) => c.shiftClock(ms), 40 * DAY)
  await panel.getByRole('button', { name: 'New chat' }).click()
  await chat(otty, panel, world, 'What is a delta?', 'Land built up where a river meets the sea.', 'River deltas')

  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await expect(panel.getByRole('button', { name: /Fjords explained/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /River deltas/ })).toBeVisible()
  await expect(panel.getByText('Otty keeps chats for a year on this Mac.', { exact: false })).toBeVisible()

  await otty.settings(panel, 'Privacy')
  const keep = panel.getByRole('combobox', { name: 'Keep chats for' })
  await expect(keep).toHaveValue('1y')
  await keep.selectOption('30d')
  await holdPrompt(otty, panel, /^Forget 1 chat older than 30 days\?$/)
  await expect(panel.getByText('Saved')).toBeVisible()

  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await expect(panel.getByRole('button', { name: /River deltas/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Fjords explained/ })).toHaveCount(0)
  await expect(panel.getByText('Otty keeps chats for 30 days on this Mac.', { exact: false })).toBeVisible()

  // Gone for good, not just hidden: still gone after a relaunch, and search can't find it.
  await otty.relaunch()
  const again = await otty.openPanel()
  await again.keyboard.press('Meta+Shift+F')
  await again.getByPlaceholder('Search your chats').fill('glacier')
  await expect(again.getByText('No chats mention “glacier”')).toBeVisible()
})

/** Chats as Otty 0.3.2 saved them: one capture as `context` on the user message, no times on messages. */
function legacyChats(now: number): unknown[] {
  const old = (id: string, title: string, q: string, a: string, daysAgo: number, context: unknown, app: unknown) => ({
    id,
    title,
    createdAt: now - daysAgo * DAY,
    updatedAt: now - daysAgo * DAY,
    messages: [
      { id: `${id}-u`, role: 'user', text: q, context, app },
      { id: `${id}-a`, role: 'assistant', text: a, tools: [] }
    ],
    history: [
      { role: 'user', content: q },
      { role: 'assistant', content: a }
    ]
  })
  return [
    old('print', 'Printing both sides', 'How do I print this on both sides?', 'In the 打印 dialog, tick Two-Sided, then press Print.', 2, { kind: 'text', text: 'Quarterly report' }, { name: 'Preview', title: 'Report.pdf' }),
    old('tea', 'Brewing green tea', 'How hot should the water be?', 'Use water around 80 degrees for sencha.', 5, null, null)
  ]
}

test('chats saved by 0.3.2 move into otty.db, are searchable, and can be forgotten', { tag: ['@step-43'] }, async ({ otty }) => {
  // The fixture already started a fresh install; drop a 0.3.2 chats.json beside it and start again, like an upgrade.
  const file = join(otty.home, 'chats.json')
  writeFileSync(file, JSON.stringify(legacyChats(Date.now())))
  await otty.relaunch()
  expect(existsSync(file), 'chats.json is removed once imported').toBe(false)
  expect(existsSync(join(otty.home, 'otty.db'))).toBe(true)

  const panel = await otty.openPanel()
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await expect(panel.getByRole('button', { name: /Printing both sides/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Brewing green tea/ })).toBeVisible()
  await expect(panel.getByText('No chats yet')).toHaveCount(0)

  const search = panel.getByPlaceholder('Search your chats')
  await search.fill('sencha')
  await expect(panel.getByRole('button', { name: /Brewing green tea/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Printing both sides/ })).toHaveCount(0)
  await search.fill('打印')
  await expect(panel.getByRole('button', { name: /Printing both sides/ })).toBeVisible()
  await expect(panel.getByRole('button', { name: /Brewing green tea/ })).toHaveCount(0)

  // An old chat opens with its question, its highlight (now a capture) and its answer.
  await panel.getByRole('button', { name: /Printing both sides/ }).click()
  await expect(panel.getByText('How do I print this on both sides?')).toBeVisible()
  await expect(panel.getByText('Quarterly report')).toBeVisible()
  await expect(panel.getByText('tick Two-Sided', { exact: false })).toBeVisible()

  await otty.settings(panel, 'Privacy')
  await otty.hold(panel.getByRole('button', { name: 'Hold to forget: Forget all chats' }))
  await expect(panel.getByText('Forgotten', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await expect(panel.getByText('No chats yet')).toBeVisible()
})
