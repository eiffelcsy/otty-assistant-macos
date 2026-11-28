// Flow and room (D-76, Spec 09): the header rides the sheet, Home and the empty chat are one place, the side columns
// size and fold by hand or by the sidebar button, and pages keep their margins.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'

/** Sets the panel's size as a drag would. */
async function size(otty: Otty, panel: Page, width: number, height = 760): Promise<void> {
  await otty.app.evaluate(({ BrowserWindow }, [w, h]) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))
    win!.setSize(w, h)
  }, [width, height])
  await expect.poll(() => panel.evaluate(() => window.innerWidth)).toBe(width)
  // The window is wide before React has drawn the nav for it; specs that click `.nav-btn` in page code need it there.
  if (width >= 640) await expect(panel.locator('.frame__nav')).toBeVisible()
}

/** Drags from the middle of `target` by `dx`, in steps, optionally keeping the button down. */
async function drag(panel: Page, target: ReturnType<Page['getByRole']>, dx: number, keepDown = false): Promise<{ x: number; y: number }> {
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + 300
  await panel.mouse.move(x, y)
  await panel.mouse.down()
  await panel.mouse.move(x + dx, y, { steps: 8 })
  if (!keepDown) await panel.mouse.up()
  return { x, y }
}

test('to the Logbook from the cove: the header stays hidden until the sheet rises, and lands with it', { tag: ['@step-178'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await size(otty, panel, 1280)
  await expect(panel.locator('.frame__main--full')).toBeVisible()
  // Sampled in the page every 16 ms while the camera tilts: what the eye sees, frame by frame.
  const seen = await panel.evaluate(async () => {
    const out: { t: number; o: number }[] = []
    ;[...document.querySelectorAll<HTMLButtonElement>('.nav-btn')].find((b) => b.getAttribute('aria-label')?.startsWith('Logbook'))!.click()
    // The clock starts at the first frame after the click, when the tilt's transition does: on a slow Mac the click's
    // render can hold the page past 150 ms, and a clock started at the click would count that as the tilt's time.
    await new Promise((r) => requestAnimationFrame(r))
    const start = performance.now()
    const end = performance.now() + 1400
    while (performance.now() < end) {
      out.push({ t: performance.now() - start, o: Number(getComputedStyle(document.querySelector('.frame__main > .panel__header')!).opacity) })
      await new Promise((r) => setTimeout(r, 16))
    }
    return out
  })
  // The sheet starts rising a quarter into the 900 ms tilt: until then (the first ~160 ms) the header isn't seen.
  // Judged by when each sample was taken, not by how many: a slow Mac samples less often.
  const early = seen.filter((s) => s.t < 150)
  expect(early.length).toBeGreaterThan(0)
  expect(early.every((s) => s.o < 0.2), JSON.stringify(seen.slice(0, 15))).toBe(true)
  await expect.poll(() => panel.evaluate(() => Number(getComputedStyle(document.querySelector('.frame__main > .panel__header')!).opacity))).toBe(1)
  await expect(panel.locator('.logbook')).toBeVisible()
})

test('Home to the empty chat: nothing fades, Otty stays, and the chat list opens by its width', { tag: ['@step-179'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await size(otty, panel, 1280)
  await panel.keyboard.press('Meta+1')
  await expect(panel.getByRole('main', { name: 'Home' })).toBeVisible()
  const seen = await panel.evaluate(async () => {
    const frame = document.querySelector<HTMLElement>('.frame')!
    const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getClientRects().length)
    const opacity = (sel: string) => {
      const el = shown(sel)
      return el ? Number(getComputedStyle(el).opacity) : -1
    }
    const out: { t: number; body: number; otty: number; words: number; box: number; fresh: number; cardMoved: boolean; list: number }[] = []
    ;[...document.querySelectorAll<HTMLButtonElement>('.nav-btn')].find((b) => b.getAttribute('aria-label') === 'Chats')!.click()
    // As in step 178: the clock starts at the first frame after the click, when the glide does.
    await new Promise((r) => requestAnimationFrame(r))
    const start = performance.now()
    const end = performance.now() + 900
    while (performance.now() < end) {
      const card = shown('[data-shared="try"]')
      out.push({
        t: performance.now() - start,
        body: opacity('.frame__body'),
        otty: opacity('.cove-otty'),
        words: opacity('[data-shared="words"]'),
        box: opacity('[data-shared="box"]'),
        fresh: opacity('[data-fresh]'),
        cardMoved: Boolean(card && getComputedStyle(card).transform !== 'none' && getComputedStyle(card).transform !== 'matrix(1, 0, 0, 1, 0, 0)'),
        list: parseFloat(frame.style.getPropertyValue('--list-now')) || 0
      })
      await new Promise((r) => setTimeout(r, 16))
    }
    return out
  })
  expect(Math.min(...seen.map((s) => s.body))).toBe(1)
  expect(Math.min(...seen.map((s) => s.otty))).toBe(1)
  // The greeting and the box ride over without fading; the card glides from Home's place; only the new words surface.
  expect(Math.min(...seen.map((s) => s.words))).toBe(1)
  expect(Math.min(...seen.map((s) => s.box))).toBe(1)
  expect(seen.filter((s) => s.t < 200).some((s) => s.cardMoved), JSON.stringify(seen.slice(0, 15))).toBe(true)
  expect(seen[0].fresh).toBeLessThan(1)
  expect(seen.some((s) => s.list > 0 && s.list < 248)).toBe(true)
  // Where it lands, however long the machine takes to get there.
  await expect
    .poll(() =>
      panel.evaluate(() => {
        const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getClientRects().length)!
        const transform = getComputedStyle(shown('[data-shared="try"]')).transform
        return {
          cardStill: transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)',
          fresh: Number(getComputedStyle(shown('[data-fresh]')).opacity),
          list: parseFloat(document.querySelector<HTMLElement>('.frame')!.style.getPropertyValue('--list-now')) || 0
        }
      })
    )
    .toEqual({ cardStill: true, fresh: 1, list: 248 })
  await expect(panel.getByRole('heading', { name: 'Hi, I’m Otty' })).toBeVisible()
  // And back: the list closes by its width.
  const back = await panel.evaluate(async () => {
    const frame = document.querySelector<HTMLElement>('.frame')!
    const out: number[] = []
    ;[...document.querySelectorAll<HTMLButtonElement>('.nav-btn')].find((b) => b.getAttribute('aria-label')?.startsWith('Home'))!.click()
    const end = performance.now() + 900
    while (performance.now() < end) {
      await new Promise((r) => setTimeout(r, 16))
      out.push(parseFloat(frame.style.getPropertyValue('--list-now')) || 0)
    }
    return out
  })
  expect(back.some((w) => w > 0 && w < 248)).toBe(true)
  await expect.poll(() => panel.evaluate(() => parseFloat(document.querySelector<HTMLElement>('.frame')!.style.getPropertyValue('--list-now')) || 0)).toBe(0)
})

test('the sidebar button and ⌃⌘S fold and bring back both sides; the edges size, fold and hide by hand, and are kept', { tag: ['@step-180'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await size(otty, panel, 1280)
  const list = panel.locator('.frame__list')
  const navWidth = () => panel.locator('.frame__nav').evaluate((e) => e.getBoundingClientRect().width)
  // The list opens by its width over a moment; an edge is only where it lands once the glide is done.
  const listOpen = () => expect.poll(() => list.evaluate((e) => e.getBoundingClientRect().width)).toBe(248)
  await expect(list).not.toHaveAttribute('data-shut')

  await panel.getByRole('button', { name: 'Hide sidebar' }).click()
  await expect(panel.locator('.frame__nav--rail')).toBeVisible()
  await expect(list).toHaveAttribute('data-shut')
  await panel.keyboard.press('Control+Meta+s')
  await expect(panel.locator('.frame__nav--sidebar')).toBeVisible()
  await expect(list).not.toHaveAttribute('data-shut')
  await listOpen()

  // The list dragged away hides; the sidebar stays, and the button brings the list back.
  await drag(panel, panel.getByRole('separator', { name: 'Chat list width' }), -200)
  await expect(list).toHaveAttribute('data-shut')
  await expect(panel.locator('.frame__nav--sidebar')).toBeVisible()
  await panel.getByRole('button', { name: 'Show sidebar' }).click()
  await expect(list).not.toHaveAttribute('data-shut')
  await listOpen()

  // The sidebar follows the hand to 260.
  await drag(panel, panel.getByRole('separator', { name: 'Sidebar width' }), 44)
  await expect.poll(navWidth).toBe(260)
  // Past the line it folds to the rail while the hand is still down, and opens again when the hand comes back.
  const at = await drag(panel, panel.getByRole('separator', { name: 'Sidebar width' }), -150, true)
  await expect(panel.locator('.frame__nav--rail')).toBeVisible()
  await panel.mouse.move(at.x, at.y, { steps: 8 })
  await expect(panel.locator('.frame__nav--sidebar')).toBeVisible()
  await panel.mouse.up()
  await expect.poll(navWidth).toBe(260)
  // Let go: nothing stays stuck to the pointer.
  await panel.mouse.move(at.x + 80, at.y)
  await expect.poll(navWidth).toBe(260)
  // The list keeps a width it's dragged to.
  await drag(panel, panel.getByRole('separator', { name: 'Chat list width' }), 40)
  await expect.poll(() => list.evaluate((e) => e.getBoundingClientRect().width)).toBe(288)
  // Both sizes survive a reload of the window.
  await panel.reload()
  await expect(panel.locator('.frame__nav--sidebar')).toBeVisible()
  await expect.poll(navWidth).toBe(260)
  await expect.poll(() => panel.locator('.frame__list').evaluate((e) => e.getBoundingClientRect().width)).toBe(288)
})

test('pages keep their margin: the Notebook reads in a centred 720 column, and the chat list’s check is Otty’s own', { tag: ['@step-181'] }, async ({ otty, world }) => {
  // The answer, and the chat's title written in the background, so it's saved and listed.
  world.reply((text, body) => body.stream === true && text.includes('What do otters eat?'), { say: 'Mostly fish and shellfish.' })
  world.reply((text, body) => !body.stream && text.includes('What do otters eat?'), { say: 'Otters and food' })
  const panel = await otty.openPanel()
  await size(otty, panel, 1280)
  await otty.ask(panel, 'What do otters eat?')
  await expect(panel.getByText('Mostly fish and shellfish.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible()
  await expect.poll(() => world.modelRequests().some((b) => !b.stream && JSON.stringify(b.messages).includes('What do otters eat?'))).toBe(true)

  // The chat list's pick is drawn in the house style, not the system's.
  const row = panel.getByRole('region', { name: 'Chats' }).locator('.history__item').first()
  await row.hover()
  const check = row.getByRole('checkbox')
  await expect(check).toBeVisible()
  expect(await check.evaluate((c) => [getComputedStyle(c).appearance, c.getBoundingClientRect().width])).toEqual(['none', 18])

  await panel.keyboard.press('Meta+4')
  const heading = panel.getByRole('heading', { name: 'What Otty knows about you' })
  await expect(heading).toBeVisible()
  // Measured in one go, once the chat list has finished closing: the heading is centred in a 720 column.
  await expect
    .poll(() =>
      panel.evaluate(() => {
        const h = document.querySelector('.set-bar__title')!.getBoundingClientRect()
        const m = document.querySelector('.frame__main')!.getBoundingClientRect()
        return Math.round(h.left - m.left) - Math.round((m.width - 720) / 2)
      })
    )
    .toBe(0)
  // Just inside wide (the floating window's 1 px border puts 980 under the line), where 720 doesn't fit with its margins: the page keeps 32 from the sidebar.
  await size(otty, panel, 1000)
  await expect.poll(async () => Math.round((await heading.evaluate((h) => h.getBoundingClientRect().left)) - (await panel.locator('.frame__main').evaluate((m) => m.getBoundingClientRect().left)))).toBe(32)

  await size(otty, panel, 760)
  await expect.poll(async () => Math.round((await heading.evaluate((h) => h.getBoundingClientRect().left)) - (await panel.locator('.frame__main').evaluate((m) => m.getBoundingClientRect().left)))).toBe(24)
})
