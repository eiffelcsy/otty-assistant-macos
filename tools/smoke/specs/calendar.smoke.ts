// The calendar (D-73, Spec 11): Otty's own week, events added, moved, edited, removed and undone, planned from a chat,
// with a connected Apple calendar beside them, and today's event in Home.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import { openLogbook, entry } from '../logbook'
import type { ModelBody } from '../world/server'

const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

/** A local day `offset` days from today, as the model and the date fields write it: YYYY-MM-DD. */
function ymd(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local time on a day `offset` from today, as the Mac helper reports it. */
function at(offset: number, hour: number, minute = 0): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, hour, minute).toISOString()
}

const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The panel at the week's width, as a drag would set it (the same resize frame.smoke uses). */
async function wide(otty: Otty, panel: Page): Promise<void> {
  await otty.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))
    const [, h] = win!.getSize()
    win!.setSize(1000, Math.max(h, 600))
  })
  await expect.poll(() => panel.evaluate(() => window.innerWidth)).toBe(1000)
}

/** The panel at the width the Logbook's header menu needs (frame.smoke's narrow case). */
async function narrow(otty: Otty, panel: Page): Promise<void> {
  await otty.app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes('view=panel'))
    const [, h] = win!.getSize()
    win!.setSize(420, Math.max(h, 600))
  })
  await expect.poll(() => panel.evaluate(() => window.innerWidth)).toBe(420)
  // Narrow, the rail becomes the screen menu; wait for that before anything reaches for the rail.
  await expect(panel.getByRole('button', { name: /, switch screen/ })).toBeVisible()
}

async function openCalendar(panel: Page): Promise<void> {
  await panel.keyboard.press('Meta+5')
  await expect(panel.getByRole('button', { name: 'Add an event' })).toBeVisible()
  // Sunday's "tomorrow" is in next week, which the grid opens without.
  if (new Date().getDay() === 0) await panel.getByRole('button', { name: 'Later' }).click()
}

/** Adds an event through the card, Save included. */
async function addEvent(panel: Page, f: { title: string; day: string; from: string; to: string }): Promise<void> {
  await panel.getByRole('button', { name: 'Add an event' }).click()
  const card = panel.getByRole('dialog', { name: 'New event' })
  await card.getByLabel('What', { exact: true }).fill(f.title)
  await card.getByLabel('Day', { exact: true }).fill(f.day)
  await card.getByLabel('From', { exact: true }).fill(f.from)
  await card.getByLabel('To', { exact: true }).fill(f.to)
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card).toHaveCount(0)
}

/** A timed block by its title and its time range, as its accessible name reads. */
const block = (panel: Page, title: string, range: string) => panel.getByRole('button', { name: new RegExp(`^${title}, .*${range}$`) })

test('add, persist, edit, delete with undo, and delete for good', { tag: ['@step-191'] }, async ({ otty }) => {
  let panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  const tomorrow = ymd(1)
  await addEvent(panel, { title: 'Swim practice', day: tomorrow, from: '07:00', to: '08:00' })
  await expect(block(panel, 'Swim practice', '07:00 to 08:00')).toBeVisible()

  await otty.relaunch()
  panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  await expect(block(panel, 'Swim practice', '07:00 to 08:00')).toBeVisible()

  await block(panel, 'Swim practice', '07:00 to 08:00').click()
  const card = panel.getByRole('dialog', { name: 'Edit event' })
  await card.getByLabel('To', { exact: true }).fill('08:30')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(block(panel, 'Swim practice', '07:00 to 08:30')).toBeVisible()

  await block(panel, 'Swim practice', '07:00 to 08:30').click()
  await panel.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Delete' }).click()
  const ok = panel.locator('.cal-ok')
  await expect(ok).toContainText('Deleted “Swim practice”')
  await ok.getByRole('button', { name: 'Undo' }).click()
  await expect(block(panel, 'Swim practice', '07:00 to 08:30')).toBeVisible()

  await block(panel, 'Swim practice', '07:00 to 08:30').click()
  await panel.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Delete' }).click()
  await expect(panel.locator('.cal-ok')).toContainText('Deleted “Swim practice”')

  await otty.relaunch()
  panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  await expect(panel.getByRole('button', { name: /^Swim practice,/ })).toHaveCount(0)
})

test('drag an event down two hours: it lands on the new time and stays there after a relaunch', { tag: ['@step-192'] }, async ({ otty }) => {
  let panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  await addEvent(panel, { title: 'Reading', day: ymd(1), from: '10:00', to: '11:00' })
  const moved = block(panel, 'Reading', '10:00 to 11:00')
  await expect(moved).toBeVisible()

  // 48 px is an hour of the grid, so two hours is 96 px. The pointer moves in steps, so it's a drag, not a click.
  const box = (await moved.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await panel.mouse.move(x, y)
  await panel.mouse.down()
  await panel.mouse.move(x, y + 20, { steps: 4 })
  await panel.mouse.move(x, y + 96, { steps: 12 })
  await panel.mouse.up()
  await expect(block(panel, 'Reading', '12:00 to 13:00')).toBeVisible()

  await otty.relaunch()
  panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  await expect(block(panel, 'Reading', '12:00 to 13:00')).toBeVisible()
})

test('a plan from a chat: the card adds it, the calendar shows Otty’s paw, and undo in the Logbook takes it off', { tag: ['@step-193'] }, async ({ otty, world }) => {
  const tomorrow = ymd(1)
  world.reply(streamed('Block two hours for my essay'), { calls: [{ name: 'plan_event', args: { title: 'Essay', start: `${tomorrow}T14:00`, end: `${tomorrow}T16:00` } }] }, { say: 'Blocked it for you.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'Block two hours for my essay tomorrow afternoon.')

  const card = panel.locator('.confirm-card')
  await expect(card).toContainText('Add this to your calendar?')
  await expect(card).toContainText('Essay')
  await expect(card).toContainText(/14:00–16:00/)
  // The card arms after a moment (D-60): a click before then does nothing, so it's retried.
  await expect(async () => {
    await card.getByRole('button', { name: /^Add it/ }).click()
    await expect(panel.locator('.receipt', { hasText: 'Added to your calendar' })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(panel.locator('.msg--otty').last()).toContainText('Blocked it for you.')

  await openCalendar(panel)
  await wide(otty, panel)
  const essay = panel.getByRole('button', { name: /^Essay,/ })
  await expect(essay).toHaveAttribute('title', 'Otty added this')

  await narrow(otty, panel)
  await openLogbook(panel, 'What Otty changed')
  const row = entry(panel, 'Essay')
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(row).toContainText('Undone')

  await wide(otty, panel)
  await openCalendar(panel)
  await expect(panel.getByRole('button', { name: /^Essay,/ })).toHaveCount(0)

  // The question is in What left my Mac; nothing there is about the calendar.
  await narrow(otty, panel)
  await openLogbook(panel, 'What left my Mac')
  // Rows hold names and counts, not the question's words, so the check is that rows exist and none names the calendar.
  await expect(panel.locator('li.log-entry').first()).toBeVisible()
  await expect(panel.locator('li.log-entry').filter({ hasText: /calendar/i })).toHaveCount(0)
})

test('connected Apple calendar beside Otty’s: read-only, with no Save', { tag: ['@step-194'] }, async ({ otty }) => {
  await otty.mac({ calendar: { allowed: true, events: [{ title: 'Club swim', start: at(1, 9), end: at(1, 10), allDay: false, calendar: 'Home' }], reminders: [] } })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await panel.getByRole('button', { name: /^Apple Calendar and Reminders/ }).click()
  await panel.getByRole('button', { name: 'Allow access' }).click()
  await expect(panel.getByText('Connected. Ask “what’s on tomorrow?” to try it.')).toBeVisible()

  await otty.go(panel, 'Chat')
  await wide(otty, panel)
  await openCalendar(panel)
  const club = block(panel, 'Club swim', '09:00 to 10:00')
  await expect(club).toBeVisible()
  await club.click()
  const dialog = panel.getByRole('dialog', { name: 'Club swim' })
  // The spec's line is “From {calendar}”: the calendar's own name (here “Home”), so the test takes whatever it names.
  await expect(dialog).toContainText(/From .+\. Change it there\./)
  await expect(dialog.getByRole('button', { name: 'Save' })).toHaveCount(0)
})

test('an event added today shows as the current tick in Home’s Today', { tag: ['@step-195'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  const now = Date.now()
  await addEvent(panel, { title: 'Standup', day: ymd(0), from: hhmm(now - 10 * 60_000), to: hhmm(now + 50 * 60_000) })

  await panel.keyboard.press('Meta+1')
  const home = panel.getByRole('main', { name: 'Home' })
  await expect(home.getByRole('region', { name: 'Today' })).toBeVisible()
  await expect(home.getByRole('button', { name: /, now, Standup$/ })).toBeVisible()
})

test('the month: six weeks of days, Otty’s event on its day, and a day opens its week', { tag: ['@step-208'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await wide(otty, panel)
  await openCalendar(panel)
  await addEvent(panel, { title: 'Swim practice', day: ymd(0), from: '07:00', to: '08:00' })
  await panel.getByRole('button', { name: 'Month', exact: true }).click()
  const now = new Date()
  await expect(panel.getByRole('heading', { name: `${now.toLocaleString('en-GB', { month: 'long' })} ${now.getFullYear()}` })).toBeVisible()
  await expect(panel.locator('.cal-mday')).toHaveCount(42)
  await expect(panel.locator('.cal-mday--today').getByRole('button', { name: /^Swim practice,/ })).toBeVisible()
  await panel.locator('.cal-mday--today .cal-mday__open').click()
  await expect(block(panel, 'Swim practice', '07:00 to 08:00')).toBeVisible()
})
