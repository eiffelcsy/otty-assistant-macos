// Find in this chat (D-7): checklist steps 34–36.
import type { Locator, Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import type { World } from '../world/server'

/** Paragraphs that make an answer tall, so a long chat really scrolls. None of them match a search here. */
function filler(topic: string, n: number): string {
  return Array.from({ length: n }, (_, i) => `Part ${i + 1} on ${topic}: take it slowly, one small step at a time, and check each result before going on.`).join('\n\n')
}

/** Asks `q` and waits for the answer's last paragraph (plain text), the composer, and (if `follows`) the view to reach the bottom. */
async function turn(otty: Otty, panel: Page, world: World, q: string, say: string, follows = true): Promise<void> {
  world.reply((text, body) => body.stream === true && text.includes(q), { say })
  await otty.ask(panel, q)
  await expect(panel.getByText(say.split('\n').pop()!)).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
  // The view has finished following the answer, as it has by the time a person acts.
  if (follows) await expect.poll(() => panel.evaluate(() => {
    const chat = document.querySelector('.chat')!
    return chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 2
  })).toBe(true)
}

/** The find bar's current match, read from the CSS highlight it paints, and whether it's inside the chat's view. */
function current(panel: Page): Promise<{ text: string; inView: boolean; painted: number } | null> {
  return panel.evaluate(() => {
    const all = CSS.highlights.get('otty-find')?.size ?? 0
    const cur = CSS.highlights.get('otty-find-current')
    const range = cur ? ([...cur][0] as Range) : undefined
    if (!range) return all ? { text: '', inView: false, painted: all } : null
    const at = range.getBoundingClientRect()
    const view = document.querySelector('.chat')!.getBoundingClientRect()
    return { text: range.toString(), inView: at.top >= view.top && at.bottom <= view.bottom, painted: all + 1 }
  })
}

function panelShown(otty: Otty): Promise<boolean> {
  return otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('view=panel') && w.isVisible()))
}

/** "k of n" → k. */
async function position(count: Locator): Promise<number> {
  return Number((await count.innerText()).split(' ')[0])
}

async function longChat(otty: Otty, panel: Page, world: World): Promise<void> {
  // Three answers mention plankton; one has 計劃 as an explain term, another as plain words.
  await turn(otty, panel, world, 'How does the ocean feed itself?', `It starts with plankton drifting near the surface.\n\nMake a [計劃](#explain) before you dive.\n\n${filler('the ocean', 5)}`)
  await turn(otty, panel, world, 'What eats it?', `Krill eat plankton by the tonne.\n\n這個計劃很好。\n\n${filler('krill', 5)}`)
  await turn(otty, panel, world, 'And then?', `Whales strain krill and plankton through baleen.\n\n${filler('whales', 5)}`)
}

test('⌘F finds every match in a long chat and steps through them, Chinese and explain terms included', { tag: ['@step-34', '@step-35'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await longChat(otty, panel, world)

  await panel.keyboard.press('Meta+F')
  const field = panel.getByPlaceholder('Find in this chat')
  await expect(field).toBeFocused()
  const count = panel.getByText(/^(\d+ of \d+|No matches)$/)

  await field.fill('plankton')
  await expect(count).toHaveText(/^\d of 3$/)
  await expect.poll(() => current(panel)).toMatchObject({ text: 'plankton', inView: true, painted: 3 })

  // ↵ moves on and wraps; ⇧↵ moves back and wraps. The view follows.
  const start = await position(count)
  for (let i = 1; i <= 3; i++) {
    await field.press('Enter')
    await expect(count).toHaveText(`${((start - 1 + i) % 3) + 1} of 3`)
    await expect.poll(() => current(panel).then((c) => c?.inView)).toBe(true)
  }
  for (let i = 1; i <= 3; i++) {
    await field.press('Shift+Enter')
    await expect(count).toHaveText(`${((start - 1 - i + 6) % 3) + 1} of 3`)
    await expect.poll(() => current(panel).then((c) => c?.inView)).toBe(true)
  }

  // A Chinese term, once as an explain term and once in plain words.
  await field.fill('計劃')
  await expect(count).toHaveText(/^\d of 2$/)
  await expect.poll(() => current(panel)).toMatchObject({ text: '計劃', painted: 2 })

  await field.fill('zxqvw')
  await expect(count).toHaveText('No matches')
  await expect.poll(() => current(panel)).toBeNull()
})

test('the find bar holds its place while a follow-up streams in, and Esc closes it, then the panel', { tag: ['@step-36'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await longChat(otty, panel, world)

  // The search button in the header opens the bar too.
  await otty.chatAction(panel, 'Find in this chat')
  const field = panel.getByPlaceholder('Find in this chat')
  await field.fill('plankton')
  const count = panel.getByText(/^(\d+ of \d+|No matches)$/)
  await expect(count).toHaveText(/^\d of 3$/)
  // Go to the first match, far above the bottom of the chat.
  while ((await position(count)) !== 1) await field.press('Enter')
  await expect.poll(() => current(panel).then((c) => c?.inView)).toBe(true)

  await turn(otty, panel, world, 'One more thing?', `Even tiny fish eat plankton.\n\n${filler('fish', 6)}`, false)
  // The new match is counted, and the view stayed on the current one instead of following the answer.
  await expect(count).toHaveText('1 of 4')
  await expect.poll(() => current(panel)).toMatchObject({ inView: true, painted: 4 })
  await expect(panel.getByText('Part 6 on fish')).not.toBeInViewport()

  // Esc closes the bar and clears the highlights; Esc again closes the panel.
  await panel.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  await expect.poll(() => current(panel)).toBeNull()
  expect(await panelShown(otty)).toBe(true)
  await panel.keyboard.press('Escape')
  await expect.poll(() => panelShown(otty)).toBe(false)
})

test('⌘F straight after an answer keeps the current match in view while the chat finishes gliding down', { tag: ['@step-34'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await turn(otty, panel, world, 'How does the ocean feed itself?', `It starts with plankton drifting near the surface.\n\n${filler('the ocean', 5)}`)
  await turn(otty, panel, world, 'What eats it?', `Krill eat plankton by the tonne.\n\n${filler('krill', 5)}`)
  // No waiting for the view to reach the bottom this time: find while it may still be moving.
  await turn(otty, panel, world, 'And then?', `Whales strain krill and plankton through baleen.\n\n${filler('whales', 8)}`, false)
  await panel.keyboard.press('Meta+F')
  await panel.getByPlaceholder('Find in this chat').fill('plankton')
  // Wait until the chat stops moving (ten still frames), then the current match must still be on screen.
  await panel.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const chat = document.querySelector('.chat')!
        let last = -1
        let still = 0
        const tick = () => {
          still = chat.scrollTop === last ? still + 1 : 0
          last = chat.scrollTop
          if (still >= 10) resolve()
          else requestAnimationFrame(tick)
        }
        tick()
      })
  )
  await expect.poll(() => current(panel)).toMatchObject({ text: 'plankton', inView: true })
})
