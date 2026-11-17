// Pick up text: the real OCR helper (build/bin/otty-ocr, Apple Vision) reads a snip, and the pickup window lays
// selectable text over it. How accurate the reading is stays by hand; this checks the wiring around it.
import { existsSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import { expect, pbcopy, pbpaste, ROOT, test, type Otty } from '../fixtures'

const HELPER = join(ROOT, 'build/bin/otty-ocr')

/** A picture of some words, drawn in one of Otty's pages, as a snip would be. */
function picture(page: Page, lines: string[]): Promise<string> {
  return page.evaluate((words) => {
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 90 + words.length * 90
    const g = c.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#000000'
    g.font = '56px Helvetica, "PingFang TC", sans-serif'
    words.forEach((w, i) => g.fillText(w, 40, 100 + i * 90))
    return c.toDataURL('image/png')
  }, lines)
}

const pickupOpen = (otty: Otty) => otty.app.windows().some((w) => !w.isClosed() && w.url().includes('view=pickup'))

async function snipToQuick(otty: Otty, snip: string): Promise<Page> {
  await otty.mac({ snip, front: { name: 'Preview', bundleId: 'com.apple.Preview' } })
  await otty.press('Alt+Shift+Space')
  const quick = await otty.view('quick')
  await expect(quick.getByRole('img', { name: 'Your screen snip' })).toBeVisible()
  return quick
}

test.describe('Pick up text', () => {
  test.skip(!existsSync(HELPER), 'build/bin/otty-ocr is missing: build it with `npm run dev` or `npm run build:mac`')

  test('a snip in the quick view opens a window that reads its words, copies a drag, ⌘A and Copy all, and Esc closes it', { tag: ['@step-56', '@step-57', '@step-58'] }, async ({ otty }) => {
    const panel = await otty.openPanel()
    // Chinese comes first in the helper's language list (CLAUDE.md), so a line of it is read beside English.
    const snip = await picture(panel, ['Otters hold hands', 'Kelp forests 42', '海獺牽手睡覺'])
    await panel.keyboard.down('Escape')
    const quick = await snipToQuick(otty, snip)
    await quick.getByRole('button', { name: 'Pick up text' }).click()

    const pickup = await otty.view('pickup')
    const hint = pickup.getByRole('status')
    await expect(hint).toHaveText(/Reading the words…|Drag across the words/)
    // The first read after installing can take up to a minute while Apple's models load.
    await expect(hint).toHaveText('Drag across the words, then press ⌘C.', { timeout: 90_000 })

    // Drag across the first line, then ⌘C: just those words.
    const line = pickup.locator('[data-line]').first()
    const box = (await line.boundingBox())!
    await pickup.mouse.move(box.x + 1, box.y + box.height / 2)
    await pickup.mouse.down()
    await pickup.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 5 })
    await pickup.mouse.up()
    await pickup.keyboard.press('Meta+c')
    await expect.poll(pbpaste).toMatch(/^Otters hold hands$/i)

    // ⌘A then ⌘C, and Copy all: every line, in order, the Chinese one too.
    await pickup.keyboard.press('Meta+a')
    await pickup.keyboard.press('Meta+c')
    await expect.poll(pbpaste).toMatch(/Otters hold hands\s*\n\s*Kelp forests 42\s*\n\s*海獺牽手睡覺/i)
    pbcopy('')
    await pickup.getByRole('button', { name: 'Copy all' }).click()
    await expect(pickup.getByRole('button', { name: 'Copied' })).toBeVisible()
    await expect.poll(pbpaste).toMatch(/Otters hold hands\s*\n\s*Kelp forests 42/i)

    // Esc closes it (which app gets focus back stays by hand).
    await pickup.keyboard.down('Escape')
    await expect.poll(() => pickupOpen(otty)).toBe(false)
  })

  test('it works from the panel tray and a sent picture, offline, and says when there are no words', { tag: ['@step-56', '@step-58'] }, async ({ otty, world }) => {
    world.reply((_t, body) => body.stream === true, { say: 'That says “Otters hold hands”.' })
    world.backgroundReply = 'A snip'
    const panel = await otty.openPanel()
    const words = await picture(panel, ['Otters hold hands'])
    const blank = await picture(panel, [])

    // From the panel's tray, with the Wi-Fi off: it all happens on the Mac.
    await otty.control((c) => c.offline(true))
    await otty.mac({ snip: words })
    await panel.getByRole('button', { name: 'Snap part of my screen' }).click()
    await expect(panel.getByRole('img', { name: 'Your screen snip' })).toBeVisible()
    await panel.getByRole('button', { name: 'Pick up text' }).click()
    let pickup = await otty.view('pickup')
    await expect(pickup.getByRole('status')).toHaveText('Drag across the words, then press ⌘C.', { timeout: 90_000 })
    await pickup.getByRole('button', { name: 'Close' }).click()
    await expect.poll(() => pickupOpen(otty)).toBe(false)
    await otty.control((c) => c.offline(false))

    // From a picture in a sent message.
    await otty.ask(panel, 'what does this say?')
    await expect(panel.locator('.msg--otty').last().getByText('That says')).toBeVisible()
    await panel.getByRole('button', { name: 'Pick up text' }).last().click()
    pickup = await otty.view('pickup')
    await expect(pickup.getByRole('status')).toHaveText('Drag across the words, then press ⌘C.', { timeout: 90_000 })
    await pickup.keyboard.down('Escape')
    await expect.poll(() => pickupOpen(otty)).toBe(false)

    // A picture with no words says so.
    await otty.mac({ snip: blank })
    await panel.getByRole('button', { name: 'Snap part of my screen' }).click()
    await expect(panel.getByRole('img', { name: 'Your screen snip' }).last()).toBeVisible()
    await panel.locator('footer, [role=contentinfo]').getByRole('button', { name: 'Pick up text' }).click()
    pickup = await otty.view('pickup')
    await expect(pickup.getByRole('status')).toHaveText('Otty couldn’t find any words in this picture.', { timeout: 90_000 })
    await pickup.keyboard.down('Escape')
  })
})
