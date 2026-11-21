// Background looks (D-22, D-47): the card, the Logbook (D-63), the otter's marks, and a job that outlives a lost connection,
// sleep, a quit and a forgotten chat. A job's own model rounds are scripted replies matched on its brief.
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, test, type Otty } from '../fixtures'
import { lookEntry, openEntry, openLogbook } from '../logbook'
import { textOf, toolNames, type World } from '../world/server'

interface Look {
  question: string
  title: string
  brief: string
  /** What the chat says once the card is answered. */
  after: string
}

const RAIL: Look = {
  question: 'Compare the Japan rail passes for me across several sites',
  title: 'Japan rail passes',
  brief: 'Find the current prices of the Japan Rail Pass (7, 14 and 21 days) on several sites and compare them.',
  after: 'I’ll look into the rail passes in the background.'
}

const PRICES = 'https://jrpass.example/prices'
const BLOG = 'https://travel-blog.example/rail-pass-review'

/** The chat asks for a background look, and its card appears. */
async function offer(otty: Otty, world: World, panel: Page, look: Look = RAIL): Promise<void> {
  world.reply(look.question, { calls: [{ name: 'start_job', args: { title: look.title, brief: look.brief } }] }, { say: look.after })
  await otty.ask(panel, look.question)
  await expect(panel.getByText('Look into this in the background?', { exact: true })).toBeVisible()
}

/** The chat's own background calls (its title) have gone out, so taking the network away can't catch them. */
async function chatSettled(world: World, panel: Page, look: Look = RAIL): Promise<void> {
  await expect(panel.getByText(look.after)).toBeVisible()
  await expect.poll(() => world.modelRequests().some((b) => !b.stream)).toBe(true)
}

/** A look-up under way, in the Logbook's Now card. */
const nowCard = (panel: Page, title: string = RAIL.title) => panel.locator('.log-now').filter({ hasText: title })
const look = (panel: Page, title: string = RAIL.title) => lookEntry(panel, title)

/** The model requests a job sent, by its brief. */
const jobRequests = (world: World, look: Look = RAIL) => world.turnRequests().filter((b) => (b.messages ?? []).some((m) => m.role === 'user' && textOf(m.content).includes(look.brief)))

const toolText = (world: World, look: Look = RAIL) =>
  (jobRequests(world, look).at(-1)?.messages ?? [])
    .filter((m) => m.role === 'tool')
    .map((m) => textOf(m.content))
    .join('\n')

/**
 * A job that's working but can't reach the model: the Mac sleeps while the card is answered, so the job waits its
 * turn; then the Wi-Fi goes and the Mac wakes. The job's first round fails and it says it's trying again.
 * Its rounds are scripted by the caller.
 */
async function stuckOffline(otty: Otty, world: World, panel: Page): Promise<void> {
  await offer(otty, world, panel)
  await otty.control((c) => c.power('suspend'))
  await panel.getByRole('button', { name: 'Start it' }).click()
  await chatSettled(world, panel)
  await openLogbook(panel)
  await expect(look(panel)).toContainText(`Waiting its turn: “${RAIL.title}”`)
  await otty.control((c) => c.offline(true))
  await otty.control((c) => c.power('resume'))
  // Main waits a moment after waking for the network (WAKE_DELAY), then the first round fails.
  await expect(nowCard(panel)).toContainText('Lost the connection. Trying again…', { timeout: 20_000 })
}

/** One round that searches and writes the report from it. */
function quickJob(world: World, report = 'Report: the 7-day pass is 50,000 yen everywhere.'): void {
  world.search('rail pass', [{ title: 'JR Pass prices', url: PRICES, summary: '7 days: 50,000 yen' }])
  world.reply(RAIL.brief, { calls: [{ name: 'search_web', args: { query: 'Japan rail pass price' } }] }, { say: report })
}

test.describe('the card', () => {
  test('shows the whole brief; No runs nothing, Yes starts a look with a chip, a Logbook entry and pages counted', { tag: ['@step-83', '@gate'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()

    world.reply(RAIL.question, { calls: [{ name: 'start_job', args: { title: RAIL.title, brief: RAIL.brief } }] }, { say: 'Alright, I won’t look into it.' })
    await otty.ask(panel, RAIL.question)
    const card = panel.locator('.confirm-card')
    await expect(card).toContainText('Look into this in the background?')
    await expect(card).toContainText(RAIL.brief)
    await expect(card).toContainText('only this text goes with it')
    await expect(card).toContainText(/It stops after \d+ searches or pages, or \d+ minutes/)
    await panel.getByRole('button', { name: 'Skip' }).click()
    await expect(panel.getByText('Alright, I won’t look into it.')).toBeVisible()
    expect(jobRequests(world)).toEqual([])
    await openLogbook(panel)
    await expect(look(panel)).toHaveCount(0)
    await otty.go(panel, 'Chat')

    quickJob(world)
    await offer(otty, world, panel)
    await panel.getByRole('button', { name: 'Start it' }).click()
    await expect(panel.getByText(`Looking into “${RAIL.title}”`, { exact: true })).toBeVisible()
    await expect(panel.getByText(RAIL.after)).toBeVisible()
    await openLogbook(panel)
    await expect(look(panel)).toContainText(`Looked into “${RAIL.title}”`)
    await expect(look(panel)).toContainText(/\d+ pages? read/)
    // The job was only given its brief and the read-only tools.
    const first = jobRequests(world)[0]
    expect(toolNames(first).sort()).toEqual(['read_page', 'search_web'])
    expect((first.messages ?? []).map((m) => textOf(m.content)).join('\n')).not.toContain(RAIL.question)
  })
})

test.describe('a job that meets trouble', () => {
  test('an unfamiliar address waits with a green dot; Wi-Fi off says it’s trying again with the straw dot; Wi-Fi on carries on', { tag: ['@step-83', '@step-85', '@step-91', '@step-103', '@gate'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    const bubble = (await otty.view('bubble')).locator('.bubble')
    world.search('rail pass', [{ title: 'JR Pass prices', url: PRICES, summary: '7 days: 50,000 yen' }])
    world.reply(
      RAIL.brief,
      { say: 'Notes so far.', calls: [{ name: 'search_web', args: { query: 'Japan rail pass price' } }, { name: 'read_page', args: { url: BLOG } }] },
      { say: 'Report: 50,000 yen for 7 days on every site I could reach.' }
    )
    await offer(otty, world, panel)
    await panel.getByRole('button', { name: 'Start it' }).click()
    await chatSettled(world, panel)
    await openLogbook(panel, 'Needs you')

    const waiting = panel.locator('li.log-entry').filter({ hasText: 'Waiting: read travel-blog.example?' })
    await expect(waiting).toContainText(`Part of “${RAIL.title}”`)
    const details = await openEntry(waiting)
    await expect(details.locator('code')).toHaveText(BLOG)
    await expect(bubble.locator('.bubble__working--waiting')).toBeVisible()
    await expect(bubble).toHaveAttribute('title', /needs your OK/)

    // Allowed with the Wi-Fi off: the page can't be read, the next round can't be sent, and the Now card says so.
    await otty.control((c) => c.offline(true))
    await details.getByRole('button', { name: 'Allow', exact: true }).click()
    await panel.locator('.log-details__back').click()
    await expect(nowCard(panel)).toContainText('Lost the connection. Trying again…', { timeout: 15_000 })
    await expect(bubble.locator('.bubble__working:not(.bubble__working--waiting)')).toBeVisible()
    await expect(bubble).toHaveAttribute('title', /looking into something/)

    // Back online, the retry carries on from the saved steps: the search isn't run again.
    await otty.control((c) => c.offline(false))
    await expect(nowCard(panel)).toHaveCount(0, { timeout: 30_000 })
    await openLogbook(panel, 'Everything')
    await expect(look(panel)).toContainText(`Looked into “${RAIL.title}”`)
    await expect(look(panel)).not.toContainText('Lost the connection')
    expect(world.requests.filter((r) => r.url.endsWith('/v1/tools/search'))).toHaveLength(1)
    expect(toolText(world)).toContain(PRICES)
    await expect(bubble.locator('.bubble__working')).toHaveCount(0)
  })

  test('Stop, then Try again carries on from the last step and the report replaces the partial one', { tag: ['@step-91'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { say: 'Full report: 50,000 yen for 7 days.' })
    await stuckOffline(otty, world, panel)
    await nowCard(panel).getByRole('button', { name: 'Stop' }).click()
    const job = look(panel)
    await expect(job).toContainText(`Couldn’t finish “${RAIL.title}”`)
    await expect(job).toContainText('You stopped this.')

    await otty.control((c) => c.offline(false))
    const details = await openEntry(job)
    await details.getByRole('button', { name: 'Try again' }).click()
    await expect(details).toContainText(`Looked into “${RAIL.title}”`)
    await details.getByRole('button', { name: 'Open the report' }).click()
    await expect(panel.getByText('Full report: 50,000 yen for 7 days.')).toBeVisible()
    // One report chat, under the job's title.
    await otty.go(panel, 'Chats')
    await expect(panel.locator('.history__title').filter({ hasText: RAIL.title })).toHaveCount(1)
  })
})

test.describe('a job outlives', () => {
  test('a sleeping Mac: it carries on after waking', { tag: ['@step-84'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { say: 'Report after the nap.' })
    await stuckOffline(otty, world, panel)
    await otty.control((c) => c.power('suspend'))
    await otty.control((c) => c.offline(false))
    await otty.control((c) => c.power('resume'))
    await expect(look(panel)).toContainText(`Looked into “${RAIL.title}”`, { timeout: 20_000 })
  })

  test('a day asleep: it asks first, and Keep going carries on', { tag: ['@step-84'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { say: 'Report a day later.' })
    await stuckOffline(otty, world, panel)
    await otty.control((c) => c.power('suspend'))
    await otty.control((c) => c.shiftClock(25 * 3_600_000))
    await otty.control((c) => c.offline(false))
    await otty.control((c) => c.power('resume'))
    const job = look(panel)
    await expect(job).toContainText('This has been sitting a while. Keep going?', { timeout: 20_000 })
    await expect(job).toContainText(`Waiting for you: “${RAIL.title}”`)
    const details = await openEntry(job)
    await details.getByRole('button', { name: 'Keep going' }).click()
    await expect(details).toContainText(`Looked into “${RAIL.title}”`)
  })

  test('a quit: it carries on after relaunching', { tag: ['@step-84'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { say: 'Report after the restart.' })
    await stuckOffline(otty, world, panel)
    await otty.relaunch()
    const again = await otty.openPanel()
    await openLogbook(again)
    await expect(look(again)).toContainText(`Looked into “${RAIL.title}”`, { timeout: 20_000 })
    await (await openEntry(look(again))).getByRole('button', { name: 'Open the report' }).click()
    await expect(again.getByText('Report after the restart.')).toBeVisible()
  })
})

test.describe('when it’s done', () => {
  test('a dot on the otter and on the Logbook; Open the report is a normal chat to follow up and find in Recent chats', { tag: ['@step-85', '@step-103'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    const bubble = (await otty.view('bubble')).locator('.bubble')
    quickJob(world, 'Report: the Kintetsu otter pass is the best value.')
    await offer(otty, world, panel)
    // Asleep while the card is answered, so the look starts only once the panel is closed.
    await otty.control((c) => c.power('suspend'))
    await panel.getByRole('button', { name: 'Start it' }).click()
    await chatSettled(world, panel)
    await panel.keyboard.press('Escape')
    await otty.control((c) => c.power('resume'))
    await expect(bubble.locator('.bubble__badge')).toBeVisible({ timeout: 20_000 })
    await expect(bubble).toHaveAttribute('title', /has an answer for you/)

    const again = await otty.openPanel()
    await openLogbook(again)
    await (await openEntry(look(again))).getByRole('button', { name: 'Open the report' }).click()
    await expect(again.getByText('Report: the Kintetsu otter pass is the best value.')).toBeVisible()

    world.reply('Is that pass good for Nara too?', { say: 'Yes, the Kintetsu pass covers Nara.' })
    await otty.ask(again, 'Is that pass good for Nara too?')
    await expect(again.getByText('Yes, the Kintetsu pass covers Nara.')).toBeVisible()
    // The follow-up was asked with the report in the history.
    expect((world.turnRequests().at(-1)?.messages ?? []).map((m) => textOf(m.content)).join('\n')).toContain('Kintetsu otter pass')

    await otty.go(again, 'Chats')
    await again.getByPlaceholder('Search your chats').fill('Kintetsu')
    await expect(again.locator('.history__title').filter({ hasText: RAIL.title }).first()).toBeVisible()
  })

  test('a job waiting on an unfamiliar address can be allowed after a restart', { tag: ['@step-85'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { calls: [{ name: 'read_page', args: { url: BLOG } }] }, { say: 'Report: the blog says 50,000 yen.' })
    world.read(BLOG, { title: 'Rail pass review', content: 'The 7-day pass is 50,000 yen.' })
    await offer(otty, world, panel)
    await panel.getByRole('button', { name: 'Start it' }).click()
    await chatSettled(world, panel)
    // Compact, the screen menu carries the needs-you dot; the Logbook is inside it.
    const button = panel.getByRole('button', { name: /, switch screen/ })
    await expect(button.locator('.icon-btn__dot')).toBeVisible()
    await expect(button).toHaveAccessibleName(/, switch screen, 1 needs you$/)
    await openLogbook(panel, 'Needs you')
    await expect(panel.locator('li.log-entry')).toContainText(['Waiting: read travel-blog.example?'])

    await otty.relaunch()
    const again = await otty.openPanel()
    await openLogbook(again, 'Needs you')
    const details = await openEntry(again.locator('li.log-entry').filter({ hasText: 'Waiting: read travel-blog.example?' }))
    await expect(details.locator('code')).toHaveText(BLOG)
    await details.getByRole('button', { name: 'Allow', exact: true }).click()
    await expect(details).toContainText(`Looked into “${RAIL.title}”`)
    expect(toolText(world)).toContain('The 7-day pass is 50,000 yen.')
  })
})

test.describe('forgetting', () => {
  test.describe('with Remember my chats off', () => {
    test.use({ seed: { ...ONBOARDED, rememberChats: false } })

    test('a finished job leaves no trace on disk after a quit', { tag: ['@step-86'] }, async ({ otty, world }) => {
      const panel = await otty.openPanel()
      quickJob(world, 'Report: nothing of this is kept.')
      await offer(otty, world, panel)
      await panel.getByRole('button', { name: 'Start it' }).click()
      await openLogbook(panel)
      await expect(look(panel)).toContainText(`Looked into “${RAIL.title}”`)
      await (await openEntry(look(panel))).getByRole('button', { name: 'Open the report' }).click()
      await expect(panel.getByText('Report: nothing of this is kept.')).toBeVisible()

      await otty.relaunch()
      const files = readdirSync(otty.home).filter((f) => f.startsWith('otty.db'))
      for (const f of files) {
        const bytes = readFileSync(join(otty.home, f)).toString('latin1')
        for (const words of ['Japan Rail Pass', 'Japan rail passes', 'nothing of this is kept', 'Compare the Japan']) expect(bytes, `${f} holds “${words}”`).not.toContain(words)
      }
      const again = await otty.openPanel()
      await openLogbook(again)
      await expect(look(again)).toHaveCount(0)
    })
  })

  test('Forget all chats with a job running stops it and it’s gone', { tag: ['@step-86'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { say: 'never sent' })
    await stuckOffline(otty, world, panel)
    await otty.settings(panel, 'Privacy')
    await otty.hold(panel.getByRole('button', { name: 'Hold to forget: Forget all chats' }))
    await expect(panel.getByRole('group', { name: 'Can’t be undone' })).toContainText('Forgotten')
    await otty.go(panel, 'Chat')
    await openLogbook(panel)
    await expect(look(panel)).toHaveCount(0)
    await expect(nowCard(panel)).toHaveCount(0)
  })

  test('deleting the chat that started a job stops it', { tag: ['@step-86'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    world.reply(RAIL.brief, { say: 'never sent' })
    await stuckOffline(otty, world, panel)
    await otty.go(panel, 'Chats')
    await panel.getByRole('button', { name: 'Forget this chat' }).first().click()
    await panel.getByRole('dialog').getByRole('button', { name: 'Forget' }).click()
    await expect(panel.locator('.history__title')).toHaveCount(0)
    await openLogbook(panel)
    await expect(look(panel)).toHaveCount(0)
    await expect(nowCard(panel)).toHaveCount(0)
  })
})

test.describe('on a model on this Mac', () => {
  test.use({ seed: { ...ONBOARDED, baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', apiKeys: {} } })

  test('Otty never offers a job, and a model that asks anyway gets no card', { tag: ['@step-87'] }, async ({ otty, world }) => {
    world.reply('Compare laptops for me', { calls: [{ name: 'start_job', args: { title: 'Laptops', brief: 'Compare laptops.' } }] }, { say: 'I can’t look things up from here, but here’s what I know.' })
    const panel = await otty.openPanel()
    await otty.ask(panel, 'Compare laptops for me')
    await expect(panel.getByText('here’s what I know')).toBeVisible()
    const sent = world.turnRequests()
    expect(sent.length).toBeGreaterThan(0)
    for (const body of sent) expect(toolNames(body)).not.toEqual(expect.arrayContaining(['start_job']))
    for (const body of sent) expect(toolNames(body)).not.toContain('schedule_job')
    await expect(panel.locator('.confirm-card')).toHaveCount(0)
    await openLogbook(panel, 'Coming up')
    await expect(panel.locator('li.log-entry')).toHaveCount(0)
  })
})
