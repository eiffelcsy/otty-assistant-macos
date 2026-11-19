// The Logbook (D-63): a look-up's Now card with real progress and a steering note that reaches its next step, and
// search that finds what Otty read by its host, without asking anyone.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import { openLogbook } from '../logbook'
import { textOf, type World } from '../world/server'

const LOOK = {
  question: 'Compare the Japan rail passes for me across several sites',
  title: 'Japan rail passes',
  brief: 'Find the current prices of the Japan Rail Pass (7, 14 and 21 days) on several sites and compare them.',
  after: 'I’ll look into the rail passes in the background.'
}
const NOTE = 'only check JR East'

/** The model requests the look sent, by its brief. */
const lookRequests = (world: World) => world.turnRequests().filter((b) => (b.messages ?? []).some((m) => m.role === 'user' && textOf(m.content).includes(LOOK.brief)))

/** A look that's working but can't reach the model, so it sits in Now, trying again. */
async function stuck(otty: Otty, world: World, panel: Page): Promise<void> {
  world.reply(LOOK.question, { calls: [{ name: 'start_job', args: { title: LOOK.title, brief: LOOK.brief } }] }, { say: LOOK.after })
  await otty.ask(panel, LOOK.question)
  await otty.control((c) => c.power('suspend'))
  await panel.getByRole('button', { name: 'Start it' }).click()
  await expect(panel.getByText(LOOK.after)).toBeVisible()
  await expect.poll(() => world.modelRequests().some((b) => !b.stream)).toBe(true)
  await openLogbook(panel)
  await otty.control((c) => c.offline(true))
  await otty.control((c) => c.power('resume'))
}

test('a running look-up shows in Now; Add a note shows it under the card and the next step hears it, once', { tag: ['@step-150'] }, async ({ otty, world }) => {
  world.reply(LOOK.brief, { say: 'Report: JR East passes only.' })
  const panel = await otty.openPanel()
  await stuck(otty, world, panel)
  const now = panel.locator('.log-now').filter({ hasText: LOOK.title })
  await expect(now).toContainText('Lost the connection. Trying again…', { timeout: 20_000 })
  await expect(now.getByRole('progressbar')).toBeVisible()

  await now.getByRole('button', { name: 'Add a note' }).click()
  await now.getByPlaceholder('Tell it something, like “only check JR East”').fill(NOTE)
  await now.getByPlaceholder('Tell it something, like “only check JR East”').press('Enter')
  await expect(now).toContainText(`Your note: ${NOTE}`)

  await otty.control((c) => c.offline(false))
  await expect(panel.locator('.log-entry').filter({ hasText: `Looked into “${LOOK.title}”` })).toBeVisible({ timeout: 30_000 })
  const heard = lookRequests(world).at(-1)!.messages ?? []
  expect(heard.filter((m) => m.role === 'user' && textOf(m.content).includes(NOTE))).toHaveLength(1)
  // The job's tools are the same read-only pair with the note as without it.
  expect(lookRequests(world).every((b) => (b.tools ?? []).length === (lookRequests(world)[0].tools ?? []).length)).toBe(true)
})

test('search finds a page Otty read by its host, and says plainly when nothing matches', { tag: ['@step-151'] }, async ({ otty, world }) => {
  const page = 'https://facts.example.org/otters'
  world.search('otter facts', [{ title: 'Otter facts', url: page }])
  world.read(page, 'Otters have the densest fur of any animal.')
  world.reply(
    (text, body) => body.stream === true && text.includes('Find otter facts and read one'),
    { calls: [{ name: 'search_web', args: { query: 'otter facts' } }] },
    { calls: [{ name: 'read_page', args: { url: page } }] },
    { say: 'Otters have very thick fur.' }
  )
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Find otter facts and read one')
  await expect(panel.getByText('Otters have very thick fur.')).toBeVisible()

  await openLogbook(panel)
  const search = panel.getByRole('searchbox', { name: 'Search the Logbook' })
  await search.fill('facts.example.org')
  await expect(panel.locator('.log-head__menu')).toHaveText('“facts.example.org”')
  await expect(panel.locator('li.log-entry')).toContainText([`Read ${page} through DeepSeek`])
  await search.fill('passport')
  await expect(panel.getByText('Nothing in the Logbook mentions “passport”.')).toBeVisible()
  // Searching asked no model and sent nothing.
  expect(world.modelRequests().filter((b) => JSON.stringify(b).includes('passport'))).toEqual([])
})
