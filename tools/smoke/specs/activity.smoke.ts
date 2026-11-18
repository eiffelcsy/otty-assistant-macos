// What Otty has used, the monthly limit (D-33), notifications and the login-item toggle, in the real app (D-47).
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, test, type Otty } from '../fixtures'
import { lastUserText, type World } from '../world/server'

interface Look {
  question: string
  title: string
  brief: string
  after: string
}

const look = (n: number, extra: Partial<Look> = {}): Look => ({
  question: `Look into otter sanctuaries number ${n} across several sites`,
  title: `Otter sanctuaries ${n}`,
  brief: `Compare otter sanctuary number ${n} across review sites.`,
  after: `I’ll look into sanctuary ${n}.`,
  ...extra
})

async function offer(otty: Otty, world: World, panel: Page, l: Look): Promise<void> {
  world.reply(l.question, { calls: [{ name: 'start_job', args: { title: l.title, brief: l.brief } }] }, { say: l.after })
  await otty.ask(panel, l.question)
  await expect(panel.locator('.confirm-card').last()).toContainText('Look into this in the background?')
}

async function openActivity(panel: Page): Promise<void> {
  if ((await panel.locator('.panel__title').textContent()) === 'Activity') return
  await panel.getByRole('button', { name: 'Activity' }).click()
  await expect(panel.locator('.panel__title')).toHaveText('Activity')
}

const row = (panel: Page, title: string) => panel.locator('li.activity-row').filter({ hasText: title })

async function answered(otty: Otty, world: World, panel: Page, question: string, say: string): Promise<void> {
  world.reply(question, { say })
  await otty.ask(panel, question)
  await expect(panel.getByText(say)).toBeVisible()
}

const notices = async (otty: Otty) => (await otty.snapshot()).calls.filter((c) => c.kind === 'notify').map((c) => c.detail[1])

/** Settings › Usage & limit: a limit in questions, saved as it's typed (D-61). */
async function setLimit(otty: Otty, panel: Page, limit: number): Promise<void> {
  await otty.settings(panel, 'Usage & limit')
  await panel.getByRole('checkbox', { name: /Set a monthly limit/ }).check()
  await panel.getByRole('textbox', { name: 'Limit' }).fill(String(limit))
  await panel.getByRole('textbox', { name: 'Limit' }).press('Enter')
  await expect(panel.locator('.meter__limit')).toHaveText(`of ${limit}`)
  await panel.getByRole('button', { name: 'Back to chat' }).click()
}

test('What Otty has used counts questions, look-ups, searches and pages; the next card compares a look with questions; forgetting memories leaves the counts', { tag: ['@step-100', '@step-101'] }, async ({ otty, world }) => {
  const SOURCE = 'https://otters.example/facts'
  world.search('otter', [{ title: 'Otter facts', url: SOURCE, summary: 'Otters hold hands.' }])
  world.read(SOURCE, { title: 'Otter facts', content: 'Sea otters hold hands while they sleep.' })
  const panel = await otty.openPanel()

  await answered(otty, world, panel, 'How long do otters live?', 'About 10 to 15 years.')
  world.reply('Why do otters hold hands?', { calls: [{ name: 'search_web', args: { query: 'otter hold hands' } }] }, { calls: [{ name: 'read_page', args: { url: SOURCE } }] }, { say: 'So they don’t drift apart while sleeping.' })
  await otty.ask(panel, 'Why do otters hold hands?')
  await expect(panel.getByText('So they don’t drift apart while sleeping.')).toBeVisible()

  const first = look(1)
  world.reply(first.brief, { say: 'Report: sanctuary 1 is lovely.' })
  await offer(otty, world, panel, first)
  await panel.getByRole('button', { name: 'Start it' }).click()
  await openActivity(panel)
  await expect(row(panel, first.title)).toContainText('Done')
  await panel.getByRole('button', { name: 'Back to chat' }).click()

  await otty.settings(panel, 'Usage & limit')
  const usage = panel.locator('.meter')
  await expect(usage.locator('.meter__count')).toHaveText('3')
  await expect(usage).toContainText('In the last 30 days, also 1 look-up on its own, 1 search and 1 page.')
  const summary = await usage.innerText()

  await panel.getByRole('button', { name: /See what it cost on DeepSeek/ }).click()
  await expect.poll(async () => (await otty.snapshot()).calls.filter((c) => c.kind === 'open-external').map((c) => c.detail[0])).toEqual(['https://platform.deepseek.com/usage'])

  await otty.settings(panel, 'Privacy')
  await panel.getByRole('button', { name: 'Open the Notebook' }).click()
  await panel.getByLabel('Add something Otty should know').fill('I’m a marine biologist')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText('I’m a marine biologist')).toBeVisible()
  await otty.settings(panel, 'Privacy')
  await otty.hold(panel.getByRole('button', { name: 'Hold to forget: Forget everything in the Notebook' }))
  await expect(panel.getByRole('group', { name: 'Can’t be undone' })).toContainText('Forgotten')
  await otty.settings(panel, 'Usage & limit')
  await expect(panel.locator('.meter')).toHaveText(summary)
  await panel.getByRole('button', { name: 'Back to chat' }).click()

  // Five questions and a finished look in, the next card says what a look has cost so far.
  await answered(otty, world, panel, 'Do otters have pockets?', 'Yes, a skin pouch under each arm.')
  await answered(otty, world, panel, 'What do baby otters eat?', 'Their mother’s milk at first.')
  const second = look(2)
  await offer(otty, world, panel, second)
  const card = panel.locator('.confirm-card').last()
  await expect(card.locator('.ask__long')).toContainText(/It stops after \d+ searches or pages, or \d+ minutes, whichever comes first\. Looks like this have used about as much as \d+ of your questions\.$/)
  await card.getByRole('button', { name: 'Skip' }).click()
  await expect(panel.getByText(second.after)).toBeVisible()
})

test.describe('notifications', () => {
  test.use({ seed: { ...ONBOARDED, notifyDone: true } })

  test('a finished look with the panel closed notifies, and the click opens Activity; with it open, none; waiting for an OK notifies', { tag: ['@step-102'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    const first = look(1)
    world.reply(first.brief, { say: 'Report: sanctuary 1.' })
    await offer(otty, world, panel, first)
    await otty.control((c) => c.power('suspend'))
    await panel.getByRole('button', { name: 'Start it' }).click()
    await expect(panel.getByText(first.after)).toBeVisible()
    await panel.getByRole('button', { name: 'Close (Esc)' }).click()
    await otty.control((c) => c.power('resume'))
    await expect.poll(() => notices(otty), { timeout: 20_000 }).toEqual([`Ready: ${first.title}`])

    await otty.control((c) => c.clickNotification(0))
    await expect(panel.locator('.panel__title')).toHaveText('Activity')
    await expect(row(panel, first.title)).toContainText('Done')

    // The panel is open: the next look finishes quietly.
    await panel.getByRole('button', { name: 'Back to chat' }).click()
    const second = look(2)
    world.reply(second.brief, { say: 'Report: sanctuary 2.' })
    await offer(otty, world, panel, second)
    await panel.getByRole('button', { name: 'Start it' }).last().click()
    await openActivity(panel)
    await expect(row(panel, second.title)).toContainText('Done')
    expect(await notices(otty)).toEqual([`Ready: ${first.title}`])

    // A look that needs an OK, with the panel closed.
    await panel.getByRole('button', { name: 'Back to chat' }).click()
    const third = look(3)
    world.reply(third.brief, { calls: [{ name: 'read_page', args: { url: 'https://unknown-otters.example/' } }] })
    await offer(otty, world, panel, third)
    await otty.control((c) => c.power('suspend'))
    await panel.getByRole('button', { name: 'Start it' }).last().click()
    await expect(panel.getByText(third.after)).toBeVisible()
    await panel.getByRole('button', { name: 'Close (Esc)' }).click()
    await otty.control((c) => c.power('resume'))
    await expect.poll(() => notices(otty), { timeout: 20_000 }).toEqual([`Ready: ${first.title}`, `${third.title} needs your OK to read a page.`])
  })
})

test('Open Otty when I log in is greyed out outside the installed app', { tag: ['@step-104'] }, async ({ otty }) => {
  const panel = await otty.openPanel()
  await otty.settings(panel, 'You & Otty')
  const toggle = panel.getByRole('checkbox', { name: /Open Otty when I log in/ })
  await expect(toggle).toBeDisabled()
  await expect(panel.getByText('Only in the installed app.')).toBeVisible()
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'login-item')).toEqual([])
})

test('a monthly limit of 1 question: questions still go through with a line at the top; a look asks first and Run it anyway runs it; explain cards still open', { tag: ['@step-119', '@gate'] }, async ({ otty, world }) => {
  world.backgroundReply = 'A ticket for unlimited train rides.'
  const panel = await otty.openPanel()
  await setLimit(otty, panel, 1)

  world.reply('What is a JR pass?', { say: 'A [rail pass](#explain) for Japan’s JR trains.' })
  await otty.ask(panel, 'What is a JR pass?')
  await expect(panel.getByText('for Japan’s JR trains.')).toBeVisible()
  const banner = panel.locator('.health')
  await expect(banner).toContainText('You’ve passed this month’s limit')
  await expect(banner).toContainText('Your own questions still go through')
  await expect(banner.getByRole('button', { name: 'Change the limit' })).toBeVisible()

  await panel.getByRole('button', { name: 'rail pass' }).click()
  await expect(panel.getByText('A ticket for unlimited train rides.')).toBeVisible()

  const l = look(1)
  world.reply(l.brief, { say: 'Report: past the limit, on purpose.' })
  await offer(otty, world, panel, l)
  await panel.getByRole('button', { name: 'Start it' }).click()
  await openActivity(panel)
  const job = row(panel, l.title)
  await expect(job).toContainText('You’ve reached this month’s limit')
  await expect(job).toContainText('Run it anyway?')
  // The chat's own follow-up carries the start_job call in its history; a job's request is the one asking the brief.
  expect(world.turnRequests().some((b) => lastUserText(b).includes(l.brief)), 'the look waits for Run it anyway').toBe(false)
  await job.getByRole('button', { name: 'Run it anyway' }).click()
  await expect(job).toContainText('Done')

  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await banner.getByRole('button', { name: 'Change the limit' }).click()
  await expect(panel.getByRole('checkbox', { name: 'Set a monthly limit' })).toBeChecked()
})

test('the limit line counts one question in the singular', { tag: ['@step-119'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await setLimit(otty, panel, 1)
  await answered(otty, world, panel, 'Hello?', 'Hi!')
  await expect(panel.locator('.health')).toContainText('limit of 1 question.')
})

test.describe('with a monthly limit of 5 questions', () => {
  test.use({ seed: { ...ONBOARDED, monthlyCap: { unit: 'questions', limit: 5 } } })

  test('at 80% the health line says so once; Not now keeps it away for the month', { tag: ['@step-147'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    const banner = panel.locator('.health')
    for (const [i, q] of ['One?', 'Two?', 'Three?'].entries()) await answered(otty, world, panel, q, `Answer ${i + 1}.`)
    await expect(banner).toHaveCount(0)
    await answered(otty, world, panel, 'Four?', 'Answer 4.')
    await expect(banner).toContainText('You’ve used 80% of this month’s limit of 5 questions.')
    await expect(banner.getByRole('button', { name: 'Change the limit' })).toBeVisible()
    await banner.getByTitle('Not now').click()
    await expect(banner).toHaveCount(0)

    await otty.relaunch()
    const again = await otty.openPanel()
    await expect(again.getByRole('textbox')).toBeVisible()
    await expect(again.locator('.health')).toHaveCount(0)
  })
})
