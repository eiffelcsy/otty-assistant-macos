// Home (D-66, Spec 06): one sentence on how things stand, only the blocks with something in them, and deciding a
// waiting item does what the Logbook's card does.
import type { Locator } from '@playwright/test'
import { expect, test } from '../fixtures'

const LOOK = {
  question: 'Compare the Japan rail passes for me across several sites',
  title: 'Japan rail passes',
  brief: 'Find the current prices of the Japan Rail Pass on several sites and compare them.',
  after: 'I’ll look into the rail passes in the background.'
}
const BLOG = 'https://travel-blog.example/rail-pass-review'

test('first open: the greeting, nothing left the Mac, things to try that fill the box, and no empty blocks', { tag: ['@step-161'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await panel.keyboard.press('Meta+1')
  const home = panel.getByRole('main', { name: 'Home' })
  await expect(home.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)$/)
  await expect(home.getByText('Nothing needs you. Ask me anything.')).toBeVisible()
  await expect(home.getByText('Nothing has left your Mac today.')).toBeVisible()
  await expect(home.getByRole('region', { name: 'Needs you' })).toHaveCount(0)
  await expect(home.getByRole('region', { name: 'Today' })).toHaveCount(0)
  const first = home.getByRole('region', { name: 'Try asking' }).getByRole('button').first()
  const words = (await first.textContent())!.trim()
  await first.click()
  await expect(panel.getByRole('textbox', { name: 'Ask Otty' })).toHaveValue(words)
  expect(otty.world.turnRequests()).toEqual([])
})

test('a look-up waiting on a page: Home says one thing needs you, Read it reads it, and the item goes', { tag: ['@step-160'] }, async ({ otty, world }) => {
  world.reply(LOOK.question, { calls: [{ name: 'start_job', args: { title: LOOK.title, brief: LOOK.brief } }] }, { say: LOOK.after })
  world.reply(LOOK.brief, { calls: [{ name: 'read_page', args: { url: BLOG } }] }, { say: 'Report: the blog says 50,000 yen.' })
  world.read(BLOG, { title: 'Rail pass review', content: 'The 7-day pass is 50,000 yen.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, LOOK.question)
  await panel.getByRole('button', { name: 'Start it' }).click()
  await expect(panel.getByText(LOOK.after)).toBeVisible()

  await panel.keyboard.press('Meta+1')
  const home = panel.getByRole('main', { name: 'Home' })
  await expect(home.getByText(/^One thing needs you\./)).toBeVisible({ timeout: 20_000 })
  const needs = home.getByRole('region', { name: 'Needs you' })
  await expect(needs).toContainText('Waiting: read travel-blog.example?')
  await expect(needs).toContainText(BLOG)
  await needs.getByRole('button', { name: 'Read it' }).click()
  await expect(home.getByRole('region', { name: 'Needs you' })).toHaveCount(0, { timeout: 20_000 })
  await expect(home.getByRole('region', { name: 'Today' })).toContainText(LOOK.title)
  await expect(home.getByText(/left your Mac/)).toBeVisible()
})

test('the living cove: Home and the empty chat show the painting for the hour full bleed, every layer drawn, and Otty on the water', { tag: ['@step-174'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  // The cove is the frame's backdrop (D-74): it fills the main column, behind the header, and Otty is in the screen's hero.
  const coveIn = async (screen: Locator) => {
    const cove = panel.locator('.frame__main--full > .cove--full')
    await expect(cove).toBeVisible()
    await expect(cove).toHaveAttribute('data-time', /^(dawn|day|golden|night)$/)
    const [c, main] = await Promise.all([cove.boundingBox(), panel.locator('.frame__main').boundingBox()])
    expect(c).toEqual(main)
    // Each painting loads under the built app's CSP: a picture that didn't would have no width.
    const otty = screen.getByRole('button', { name: 'Otty' })
    for (const imgs of [cove.locator('img'), otty.locator('img')]) {
      await expect.poll(() => imgs.evaluateAll((all) => all.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true)
    }
    await expect(otty).toBeVisible()
  }
  await coveIn(panel.locator('.empty'))
  await panel.keyboard.press('Meta+1')
  const home = panel.getByRole('main', { name: 'Home' })
  await coveIn(home)
  await home.getByRole('button', { name: 'Otty' }).click()
  await expect(home.getByRole('heading', { level: 1 })).toBeVisible()
})
