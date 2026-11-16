// Looks for later (D-27), repeating looks (D-34) and Pause everything, through the real runner and Activity (D-47).
// Time moves with shiftClock. A Mac waking is power('resume'), which main acts on after its wake delay; a quit past a
// due time is a clock moved back before scheduling, because a relaunch starts at the real time again.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import { textOf, type World } from '../world/server'

const MIN = 60_000
const DAY = 24 * 3_600_000

interface Later {
  question: string
  title: string
  brief: string
  /** When, in the app's time (ms). */
  at: number
  repeat?: 'daily' | 'weekdays' | 'weekly'
  after: string
}

/** ISO 8601 local time with no zone, the way the model is told to write it. */
function localIso(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * A time as either clock shows it: "9:00 AM" (with the narrow space newer ICU puts before AM) or "09:00". Main writes
 * the card and the renderer writes Activity rows, and in a smoke run they don't share a locale.
 */
const timeRe = (ms: number) => {
  const d = new Date(ms)
  const mm = String(d.getMinutes()).padStart(2, '0')
  const h12 = d.getHours() % 12 || 12
  return `(?:${h12}:${mm}\\s[AP]M|0?${d.getHours()}:${mm})`
}

const nineTomorrow = (offset = 0) => {
  const d = new Date(Date.now() + offset)
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

/** The app's now: real time plus however far the spec moved the clock. */
const appNow = async (otty: Otty) => Date.now() + (await otty.snapshot()).clockOffset

/** The chat asks to schedule a look, and its card appears. */
async function offerLater(otty: Otty, world: World, panel: Page, later: Later, answer = 'Okay.'): Promise<void> {
  const args = { title: later.title, brief: later.brief, at: localIso(later.at), ...(later.repeat ? { repeat: later.repeat } : {}) }
  world.reply(later.question, { calls: [{ name: 'schedule_job', args }] }, { say: answer })
  await otty.ask(panel, later.question)
  await expect(panel.locator('.confirm-card').last()).toContainText(later.repeat ? 'Check this regularly?' : 'Look into this later?')
}

async function scheduleLater(otty: Otty, world: World, panel: Page, later: Later): Promise<void> {
  await offerLater(otty, world, panel, later, later.after)
  await panel.getByRole('button', { name: 'Yes, go ahead' }).click()
  await expect(panel.getByText(later.after)).toBeVisible()
}

async function openActivity(panel: Page): Promise<void> {
  if ((await panel.locator('.panel__title').textContent()) === 'Activity') return
  await panel.getByRole('button', { name: 'Activity' }).click()
  await expect(panel.locator('.panel__title')).toHaveText('Activity')
}

async function backToChat(panel: Page): Promise<void> {
  if ((await panel.locator('.panel__title').textContent()) !== 'Activity') return
  await panel.getByRole('button', { name: 'Back to chat' }).click()
}

const rows = (panel: Page, title: string) => panel.locator('li.activity-row').filter({ hasText: title })

/** Runs of a job, counted by the first request each one sent. */
const runsOf = (world: World, brief: string) => world.turnRequests().filter((b) => (b.messages ?? []).filter((m) => m.role !== 'system').length === 1 && textOf(b.messages?.find((m) => m.role === 'user')?.content).includes(brief)).length

const RAIL: Omit<Later, 'at'> = {
  question: 'Check the Tokyo rail pass price tomorrow at 9',
  title: 'Tokyo rail pass price',
  brief: 'Find the current price of the Tokyo Subway 72-hour ticket.',
  after: 'Done, I’ll check it then.'
}

test('a look for tomorrow at 9: No schedules nothing; yes shows it in Activity, and Cancel removes it', { tag: ['@step-93', '@gate'] }, async ({ otty, world }) => {
  const at = nineTomorrow()
  const panel = await otty.openPanel()
  await offerLater(otty, world, panel, { ...RAIL, at }, 'Alright, I won’t.')
  const card = panel.locator('.confirm-card')
  await expect(card).toContainText(new RegExp(`Tomorrow at ${timeRe(at)}, Otty will look this up`))
  await expect(card).toContainText('It won’t send or change anything.')
  await expect(card).toContainText('Otty has to be running then')
  await expect(card).toContainText(RAIL.brief)
  await panel.getByRole('button', { name: 'No thanks' }).click()
  await expect(panel.getByText('Alright, I won’t.')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Activity' })).toHaveCount(0)

  await scheduleLater(otty, world, panel, { ...RAIL, at })
  await openActivity(panel)
  const row = rows(panel, RAIL.title)
  await expect(row).toContainText(new RegExp(`Will look tomorrow at ${timeRe(at)}`))
  await row.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toHaveCount(0)
  expect(runsOf(world, RAIL.brief)).toBe(0)
})

test('left running, the runner’s own timer starts a due look; it finishes as a chat with only the dot', { tag: ['@step-94'] }, async ({ otty, world }) => {
  const soon: Later = { question: 'Check the ferry times in 2 minutes', title: 'Ferry times', brief: 'Find today’s ferry times from Tokyo to Oshima.', at: (await appNow(otty)) + 2 * MIN + 30_000, after: 'I’ll check the ferry soon.' }
  const later: Later = { ...RAIL, at: nineTomorrow() }
  world.reply(soon.brief, { say: 'Note: the ferry leaves at 10:00 and 13:30.' })
  const panel = await otty.openPanel()
  const bubble = (await otty.view('bubble')).locator('.bubble')
  await scheduleLater(otty, world, panel, soon)
  await scheduleLater(otty, world, panel, later)
  await panel.getByRole('button', { name: 'Close (Esc)' }).click()

  // Time passes with Otty running. The runner sets one timer for the soonest look and re-sets it whenever the list
  // changes; cancelling the other look re-sets it, and with the time already past it goes off straight away.
  // (The real two-minute wait, and that nothing else wakes up meanwhile, stay by hand.)
  await otty.control((c) => c.shiftClock(3 * 60_000))
  await panel.evaluate(async (title) => {
    const otty = (window as unknown as { otty: { listActivity(): Promise<{ title: string }[]>; stopActivity(i: unknown): Promise<void> } }).otty
    const item = (await otty.listActivity()).find((i) => i.title === title)
    await otty.stopActivity(item)
  }, later.title)

  await expect(bubble.locator('.bubble__badge')).toBeVisible({ timeout: 15_000 })
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'notify')).toEqual([])
  const again = await otty.openPanel()
  await openActivity(again)
  const row = rows(again, soon.title)
  await expect(row).toContainText('Done')
  await expect(row).not.toContainText('late')
  await row.getByRole('button', { name: 'Open' }).click()
  await expect(again.getByText('Note: the ferry leaves at 10:00 and 13:30.')).toBeVisible()
  expect(runsOf(world, soon.brief)).toBe(1)
})

test('a Mac asleep past the time runs the look once on waking, and says it was late', { tag: ['@step-95'] }, async ({ otty, world }) => {
  const look: Later = { ...RAIL, question: 'Check the rail pass price in 3 minutes', at: (await appNow(otty)) + 3 * MIN }
  world.reply(look.brief, { say: 'Note: 1,500 yen.' })
  const panel = await otty.openPanel()
  await scheduleLater(otty, world, panel, look)
  await openActivity(panel)
  await otty.control((c) => c.power('suspend'))
  await otty.control((c) => c.shiftClock(5 * 60_000))
  await otty.control((c) => c.power('resume'))
  const row = rows(panel, look.title)
  await expect(row).toContainText('Done', { timeout: 20_000 })
  await expect(row).toContainText(new RegExp(`Looked a little late: it was due today at ${timeRe(look.at)}, but Otty wasn’t running then.`))
  expect(runsOf(world, look.brief)).toBe(1)
})

test('quit past the time and relaunch: the look runs once, late', { tag: ['@step-95'] }, async ({ otty, world }) => {
  // Back ten minutes, so a look three minutes ahead is seven minutes past when the relaunch brings real time back.
  await otty.control((c) => c.shiftClock(-10 * 60_000))
  const look: Later = { ...RAIL, question: 'Check the rail pass price in 3 minutes', at: (await appNow(otty)) + 3 * MIN }
  world.reply(look.brief, { say: 'Note: 1,500 yen, checked late.' })
  const panel = await otty.openPanel()
  await scheduleLater(otty, world, panel, look)
  await otty.relaunch()
  const again = await otty.openPanel()
  await openActivity(again)
  const row = rows(again, look.title)
  await expect(row).toContainText('Done', { timeout: 20_000 })
  await expect(row).toContainText('Looked a little late')
  expect(runsOf(world, look.brief)).toBe(1)
})

test('Pause everything stops the running look and holds the scheduled one, across a relaunch, until Let Otty carry on', { tag: ['@step-96', '@step-103', '@gate'] }, async ({ otty, world }) => {
  await otty.control((c) => c.shiftClock(-10 * 60_000))
  const scheduled: Later = { ...RAIL, question: 'Check the rail pass price in 3 minutes', at: (await appNow(otty)) + 3 * MIN }
  const running = { question: 'Compare hotel prices in Kyoto across several sites', title: 'Kyoto hotels', brief: 'Compare prices of three Kyoto ryokan across booking sites.', after: 'I’ll look into the hotels.' }
  world.reply(running.brief, { say: 'Report: the ryokan cost about the same everywhere.' })
  world.reply(scheduled.brief, { say: 'Note: 1,500 yen.' })

  const panel = await otty.openPanel()
  const bubble = (await otty.view('bubble')).locator('.bubble')
  await scheduleLater(otty, world, panel, scheduled)

  // A look that's working but can't reach the model: started while the Mac slept, then woken with the Wi-Fi off.
  world.reply(running.question, { calls: [{ name: 'start_job', args: { title: running.title, brief: running.brief } }] }, { say: running.after })
  await otty.ask(panel, running.question)
  await otty.control((c) => c.power('suspend'))
  await panel.getByRole('button', { name: 'Yes, go ahead' }).last().click()
  await expect(panel.getByText(running.after)).toBeVisible()
  await expect.poll(() => world.modelRequests().filter((b) => !b.stream).length).toBeGreaterThan(0)
  await openActivity(panel)
  await otty.control((c) => c.offline(true))
  await otty.control((c) => c.power('resume'))
  await expect(rows(panel, running.title)).toContainText('Lost the connection. Trying again…', { timeout: 20_000 })

  expect(await otty.control((c) => c.clickTray('Pause everything Otty is doing'))).toBe(true)
  await expect(rows(panel, running.title)).toContainText('Paused until you let Otty carry on.')
  await expect(rows(panel, scheduled.title)).toContainText('Paused until you let Otty carry on.')
  expect(await otty.control((c) => c.tray())).toContain('Let Otty carry on')
  await expect(bubble.locator('.bubble__paused')).toBeVisible()
  await expect(bubble).toHaveAttribute('title', 'Otty is paused · Right-click to let it carry on')

  // Relaunched at the real time, the scheduled look is seven minutes overdue, and still nothing starts.
  await otty.relaunch()
  expect(await otty.control((c) => c.tray())).toContain('Let Otty carry on')
  const again = await otty.openPanel()
  await openActivity(again)
  await expect(again.getByRole('status')).toContainText('Otty is paused.')
  await expect(rows(again, running.title)).toContainText('Paused until you let Otty carry on.')
  await expect(rows(again, scheduled.title)).toContainText('Will look today at')
  expect(runsOf(world, scheduled.brief)).toBe(0)

  await rows(again, running.title).getByRole('button', { name: 'Let Otty carry on' }).click()
  await expect(rows(again, running.title)).toContainText('Done')
  await expect(rows(again, scheduled.title)).toContainText('Done')
  await expect(rows(again, scheduled.title)).toContainText('Looked a little late')
  expect(await otty.control((c) => c.tray())).toContain('Pause everything Otty is doing')
  // The running look carried on from its saved steps: its brief went once as the first message, never twice.
  expect(runsOf(world, running.brief)).toBe(1)
})

test('Activity: Coming up first, soonest at the top, then Recent; Pause everything at the top agrees with the menu bar', { tag: ['@step-106'] }, async ({ otty, world }) => {
  const nearer: Later = { ...RAIL, at: nineTomorrow() }
  const farther: Later = { question: 'Check the museum hours the day after tomorrow at 9', title: 'Museum hours', brief: 'Find the opening hours of the Ghibli Museum.', at: nineTomorrow() + DAY, after: 'I’ll check the museum then.' }
  const now = { question: 'Look into the best otter cafés across several sites', title: 'Otter cafés', brief: 'Compare otter cafés in Tokyo across review sites.', after: 'Looking into the cafés.' }
  world.reply(now.brief, { say: 'Report: three cafés.' })

  const panel = await otty.openPanel()
  await scheduleLater(otty, world, panel, farther)
  await scheduleLater(otty, world, panel, nearer)
  world.reply(now.question, { calls: [{ name: 'start_job', args: { title: now.title, brief: now.brief } }] }, { say: now.after })
  await otty.ask(panel, now.question)
  await panel.getByRole('button', { name: 'Yes, go ahead' }).last().click()
  await expect(panel.getByText(now.after)).toBeVisible()

  await openActivity(panel)
  await expect(rows(panel, now.title)).toContainText('Done')
  await expect(panel.locator('.activity__heading')).toHaveText(['Coming up', 'Recent'])
  const coming = panel.locator('.activity__list').first().locator('li')
  await expect(coming).toHaveCount(2)
  await expect(coming.nth(0)).toContainText(nearer.title)
  await expect(coming.nth(1)).toContainText(farther.title)
  await expect(panel.locator('.activity__list').nth(1)).toContainText(now.title)

  await panel.getByRole('button', { name: 'Pause everything' }).click()
  await expect(panel.getByRole('status')).toContainText('Otty is paused. Nothing runs on its own until you let it carry on.')
  expect(await otty.control((c) => c.tray())).toContain('Let Otty carry on')
  await panel.getByRole('status').getByRole('button', { name: 'Let Otty carry on' }).click()
  await expect(panel.getByRole('button', { name: 'Pause everything' })).toBeVisible()
  expect(await otty.control((c) => c.tray())).toContain('Pause everything Otty is doing')
  await backToChat(panel)
})

test('every Monday at 9: the card says so and about 4 looks a month; Coming up shows ↻, next, and Stop repeating', { tag: ['@step-120'] }, async ({ otty, world }) => {
  const d = new Date()
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7))
  d.setHours(9, 0, 0, 0)
  const look: Later = { ...RAIL, question: 'Check the Tokyo rail pass price every Monday at 9', at: d.getTime(), repeat: 'weekly', after: 'I’ll check it every Monday.' }
  const panel = await otty.openPanel()
  await offerLater(otty, world, panel, look, look.after)
  const card = panel.locator('.confirm-card')
  await expect(card).toContainText(new RegExp(`Every Monday at ${timeRe(look.at)}, starting`))
  await expect(card).toContainText('about 4 looks a month')
  await panel.getByRole('button', { name: 'Yes, go ahead' }).click()
  await expect(panel.getByText(look.after)).toBeVisible()

  await openActivity(panel)
  const row = rows(panel, look.title)
  await expect(panel.locator('.activity__heading')).toHaveText(['Coming up'])
  await expect(row.locator('.fi-rr-arrows-repeat')).toBeVisible()
  await expect(row).toContainText(new RegExp(`Every Monday at ${timeRe(look.at)} · next`))
  await expect(row.getByRole('button', { name: 'Stop repeating' })).toBeVisible()
})

test('a daily look runs and moves to tomorrow; asleep across two times it runs once; Stop repeating keeps the notes', { tag: ['@step-121'] }, async ({ otty, world }) => {
  const look: Later = { ...RAIL, question: 'Check the rail pass price every day, starting in two minutes', at: (await appNow(otty)) + 2 * MIN, repeat: 'daily', after: 'I’ll check it every day.' }
  world.reply(look.brief, { say: 'Note: 1,500 yen today.' }, { say: 'Note: 1,600 yen two days on.' })
  const panel = await otty.openPanel()
  await scheduleLater(otty, world, panel, look)
  await openActivity(panel)
  const series = panel.locator('.activity__list').first().locator('li').filter({ hasText: look.title })
  await expect(series).toContainText(new RegExp(`Every day at ${timeRe(look.at)} · next today`))

  await otty.control((c) => c.shiftClock(3 * 60_000))
  await otty.control((c) => c.power('resume'))
  const done = rows(panel, look.title).filter({ hasText: 'Done' })
  await expect(done).toHaveCount(1, { timeout: 20_000 })
  await expect(series).toContainText(new RegExp(`next tomorrow at ${timeRe(look.at)}`))

  // Asleep across two due times: one run, not two. Over a day late, it asks first.
  await otty.control((c) => c.power('suspend'))
  await otty.control((c) => c.shiftClock(2 * 24 * 3_600_000))
  await otty.control((c) => c.power('resume'))
  const late = rows(panel, look.title).filter({ hasText: 'Look into it now?' })
  await expect(late).toHaveCount(1, { timeout: 20_000 })
  await expect(rows(panel, look.title)).toHaveCount(3) // the series, the first note, the late run
  await late.getByRole('button', { name: 'Keep going' }).click()
  await expect(done).toHaveCount(2)
  expect(runsOf(world, look.brief)).toBe(2)

  await series.getByRole('button', { name: 'Stop repeating' }).click()
  await expect(panel.locator('.activity__heading').filter({ hasText: 'Coming up' })).toHaveCount(0)
  await expect(rows(panel, look.title)).toHaveCount(2)
  await expect(done).toHaveCount(2)
})

test.fixme('Activity’s pause bar follows Pause everything from the menu bar, and Let Otty carry on from a row', { tag: ['@step-96', '@step-106'] }, async ({ otty, world }) => {
  // Panel.tsx reads settings once when it mounts, and neither the menu bar's Pause everything nor a row's
  // Let Otty carry on (Activity.tsx calls saveSettings directly) updates it, so the bar disagrees until a relaunch.
  const panel = await otty.openPanel()
  await scheduleLater(otty, world, panel, { ...RAIL, at: nineTomorrow() })
  await openActivity(panel)
  await otty.control((c) => c.clickTray('Pause everything Otty is doing'))
  await expect(panel.getByRole('status')).toContainText('Otty is paused.')
  await otty.control((c) => c.clickTray('Let Otty carry on'))
  await expect(panel.getByRole('button', { name: 'Pause everything' })).toBeVisible()
})
