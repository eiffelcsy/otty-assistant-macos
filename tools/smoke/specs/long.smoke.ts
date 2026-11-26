// Long chats and long jobs (D-78): a request the model says is too long makes room once, shows a chip, and the answer
// comes; the chat keeps the room for its next turn, and a background look keeps its steps whole.
import { expect, test } from '../fixtures'
import { openEntry, openLogbook, lookEntry } from '../logbook'
import { textOf, type ModelBody, type World } from '../world/server'

const TOO_LONG = "This model's maximum context length is 131072 tokens. However, you requested 140000 tokens."
const LONG = 'https://long.example.com/report'
const BIG = 'Otter facts. '.repeat(1600)

/** The model requests whose newest user message holds `needle`, oldest first. */
const askedWith = (world: World, needle: string): ModelBody[] =>
  world.turnRequests().filter((b) => (b.messages ?? []).some((m) => m.role === 'user' && textOf(m.content).includes(needle)))

/** The tool results a request was given. */
const toolsOf = (body: ModelBody | undefined): string => (body?.messages ?? []).filter((m) => m.role === 'tool').map((m) => textOf(m.content)).join('\n')

test('a chat too long for the model makes room once and answers, with a chip; the next turn keeps the room', { tag: ['@step-200'] }, async ({ otty, world }) => {
  world.read(LONG, { title: 'Long report', content: BIG })
  world.reply('Read https://long.example.com/report', { calls: [{ name: 'read_page', args: { url: LONG } }] }, { say: 'The report is about otters.' })
  world.reply('Thanks for reading', { say: 'You are welcome.' })
  world.reply('How many otters are in it', { status: 400, error: TOO_LONG }, { say: 'About a hundred.' })
  world.reply('And rivers?', { say: 'Rivers too.' })

  const panel = await otty.openPanel()
  await otty.ask(panel, 'Read https://long.example.com/report')
  await expect(panel.getByText('The report is about otters.')).toBeVisible()
  await otty.ask(panel, 'Thanks for reading')
  await expect(panel.getByText('You are welcome.')).toBeVisible()
  await otty.ask(panel, 'How many otters are in it')
  await expect(panel.getByText('About a hundred.')).toBeVisible()
  await expect(panel.getByText('Made room in this chat')).toBeVisible()
  await expect(panel.getByText('This chat has grown too long')).toHaveCount(0)

  // The retried request was sent with the page read set aside, and the request before it was the full one.
  const [failed, retried] = askedWith(world, 'How many otters are in it')
  expect(toolsOf(failed)).toContain(BIG.slice(0, 20))
  expect(toolsOf(retried)).toContain('was set aside to fit the chat')

  // A follow-up in the same chat carries the set-aside page too.
  await otty.ask(panel, 'And rivers?')
  await expect(panel.getByText('Rivers too.')).toBeVisible()
  expect(toolsOf(askedWith(world, 'And rivers?')[0])).toContain('was set aside to fit the chat')
})

test('a background look too long for the model makes room and finishes with its report', { tag: ['@step-201'] }, async ({ otty, world }) => {
  const title = 'Japan rail passes'
  const brief = 'Find the current prices of the Japan Rail Pass on several sites and compare them.'
  const prices = 'https://jrpass.example/prices'
  const report = 'Report: the 7-day pass is 50,000 yen everywhere.'
  world.reply('Compare the Japan rail passes for me across several sites', { calls: [{ name: 'start_job', args: { title, brief } }] }, { say: 'I’ll look into the rail passes in the background.' })
  world.search('rail pass', [{ title: 'JR Pass prices', url: prices, summary: '7 days: 50,000 yen' }])
  world.read(prices, { title: 'JR Pass prices', content: 'The 7-day pass is 50,000 yen. '.repeat(900) })
  world.reply(
    brief,
    { calls: [{ name: 'search_web', args: { query: 'Japan rail pass price' } }] },
    { calls: [{ name: 'read_page', args: { url: prices } }] },
    { calls: [{ name: 'search_web', args: { query: 'Japan rail pass rules' } }] },
    { status: 400, error: TOO_LONG },
    { say: report }
  )

  const panel = await otty.openPanel()
  await otty.ask(panel, 'Compare the Japan rail passes for me across several sites')
  await expect(panel.getByText('Look into this in the background?', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: 'Start it' }).click()

  await openLogbook(panel)
  await expect(lookEntry(panel, title)).toContainText(`Looked into “${title}”`, { timeout: 30_000 })
  await (await openEntry(lookEntry(panel, title))).getByRole('button', { name: 'Open the report' }).click()
  await expect(panel.getByText(report)).toBeVisible()
  // The request after the failure carried the page read set aside; the job's own steps still hold the full page.
  const jobs = askedWith(world, brief)
  expect(toolsOf(jobs.at(-1))).toContain('was set aside to fit the chat')
  expect(toolsOf(jobs.at(-2))).toContain('The 7-day pass is 50,000 yen.')
})
