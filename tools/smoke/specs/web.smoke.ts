// Searching the web and reading pages, on each kind of service (D-47): DeepSeek's search, the keyless lookup on
// other services, Claude's own search, and pages read from the Mac with its public-only check.
import { expect, ONBOARDED, SMOKE_KEY, test } from '../fixtures'
import { textOf, type ModelBody } from '../world/server'

const plain = (key: string) => ({ enc: Buffer.from(key).toString('base64'), plain: true })

/** What the tools told the model, in the latest request: OpenAI's `tool` messages, or Anthropic's `tool_result` blocks. */
function toolResults(body: ModelBody | undefined): string {
  return (body?.messages ?? [])
    .flatMap((m) => {
      if (m.role === 'tool') return [textOf(m.content)]
      if (!Array.isArray(m.content)) return []
      return (m.content as { type?: string; content?: unknown }[]).filter((b) => b.type === 'tool_result').map((b) => textOf(b.content))
    })
    .join('\n')
}

test('DeepSeek searches the web, and the answer cites dated sources that open in the browser', { tag: ['@step-46', '@gate'] }, async ({ otty, world }) => {
  const source = 'https://www.apple.com/newsroom/2026/11/macos-27-1-is-here/'
  world.search('macOS', [
    { title: 'macOS 27.1 is here', url: source, summary: 'Live captions and a new Otter wallpaper.', site: 'Apple Newsroom', date: '2026-11-10T09:00:00Z' },
    { title: 'macOS 27.2 beta 2', url: 'https://9to5mac.com/2026/11/12/macos-27-2-beta-2/', site: '9to5Mac', date: '2026-11-12' }
  ])
  world.reply(
    'What’s new in macOS this month?',
    { calls: [{ name: 'search_web', args: { query: 'macOS news November 2026' } }] },
    { say: `macOS 27.1 came out on 10 November with live captions ([Apple Newsroom, 10 Nov](${source})).` }
  )
  world.backgroundReply = 'macOS this month'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'What’s new in macOS this month?')

  await expect(panel.locator('.tool-chips').getByText('Looking up “macOS news November 2026”')).toBeVisible()
  const link = panel.getByRole('link', { name: 'Apple Newsroom, 10 Nov' })
  await expect(link).toBeVisible()

  // The model was given each source with its site and date to cite.
  const after = world.turnRequests().at(-1)
  expect(toolResults(after)).toContain(`[1] macOS 27.1 is here (Apple Newsroom, 2026-11-10)\n${source}`)
  expect(toolResults(after)).toContain('(9to5Mac, 2026-11-12)')
  expect(world.requests.find((r) => r.url === 'https://api.deepseek.com/v1/tools/search')?.authorization).toBe(`Bearer ${SMOKE_KEY}`)

  await link.click()
  await expect.poll(async () => (await otty.snapshot()).calls.filter((c) => c.kind === 'open-external').map((c) => c.detail[0])).toEqual([source])
})

test('another service still searches (Wikipedia), and Privacy says where lookups go', { tag: ['@step-48'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Privacy')
  await expect(panel.getByText('the search words or the page address go to DeepSeek')).toBeVisible()

  await otty.settings(panel, 'Connection')
  await panel.getByRole('button', { name: 'Change service or key' }).click()
  await panel.getByRole('radio', { name: /Another service/ }).check()
  await panel.getByLabel('Server address').fill('https://models.example.com/v1')
  await panel.getByLabel('Model').fill('smoke-model')
  await panel.getByRole('button', { name: 'Check and save' }).click()
  await expect(panel.getByText(/Connected to smoke-model!/)).toBeVisible()
  await otty.settings(panel, 'Privacy')
  await expect(panel.getByText('the search words go to Wikipedia and DuckDuckGo')).toBeVisible()

  world.lookup('Ada Lovelace', {
    abstract: { text: 'Ada Lovelace was an English mathematician.', url: 'https://duckduckgo.com/Ada_Lovelace' },
    wiki: [{ title: 'Ada Lovelace', extract: 'Augusta Ada King, Countess of Lovelace, was an English mathematician and writer.' }]
  })
  world.reply('Who was Ada Lovelace?', { calls: [{ name: 'search_web', args: { query: 'Ada Lovelace' } }] }, { say: 'She wrote the first published computer program.' })
  world.backgroundReply = 'Ada Lovelace'
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await otty.ask(panel, 'Who was Ada Lovelace?')
  await expect(panel.locator('.tool-chips').getByText('Looking up “Ada Lovelace”')).toBeVisible()
  await expect(panel.getByText('She wrote the first published computer program.')).toBeVisible()

  const turns = world.turnRequests('openai')
  expect(toolResults(turns.at(-1))).toContain('Wikipedia — Ada Lovelace: Augusta Ada King')
  expect(toolResults(turns.at(-1))).toContain('DuckDuckGo: Ada Lovelace was an English mathematician.')
  // Every question went to the new address, and DeepSeek's key and search stayed out of it.
  const sent = world.requests.filter((r) => r.url.startsWith('https://models.example.com/'))
  expect(sent.length).toBeGreaterThan(0)
  expect(sent.map((r) => r.authorization ?? null)).toEqual(sent.map(() => null))
  expect(world.requests.filter((r) => r.url.startsWith('https://api.deepseek.com/'))).toEqual([])
})

test.describe('on Claude', () => {
  test.use({ seed: { ...ONBOARDED, baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', apiKeys: { claude: plain('sk-ant-smoke-0000') } } })

  test('Claude searches by itself; its sources read without a card, an address nobody gave asks first', { tag: ['@step-60'] }, async ({ otty, world }) => {
    const found = 'https://9to5mac.com/2026/11/12/macos-27-2-beta-2/'
    world.reply('What’s new in macOS this month?', {
      searches: [
        {
          query: 'macOS news November 2026',
          results: [
            { title: 'macOS 27.1 is here', url: 'https://www.apple.com/newsroom/2026/11/macos-27-1-is-here/', age: 'November 10, 2026' },
            { title: 'macOS 27.2 beta 2', url: found, age: 'November 12, 2026' }
          ]
        }
      ],
      say: 'macOS 27.1 came out on 10 November ([Apple Newsroom](https://www.apple.com/newsroom/2026/11/macos-27-1-is-here/)), and a 27.2 beta followed.'
    })
    world.backgroundReply = 'macOS this month'
    const panel = await otty.openPanel()
    await otty.ask(panel, 'What’s new in macOS this month?')
    await expect(panel.locator('.tool-chips').getByText('Searching the web')).toBeVisible()
    await expect(panel.getByRole('link', { name: 'Apple Newsroom' })).toBeVisible()
    // Claude's own search was offered, so Otty's isn't.
    const first = world.turnRequests('anthropic')[0]
    expect(first.tools).toContainEqual(expect.objectContaining({ name: 'web_search', type: expect.stringMatching(/^web_search_/) }))
    expect(first.tools?.map((t) => t.name)).not.toContain('search_web')

    // A source from Claude's search is known, so it's read straight away.
    world.page(found, '<title>macOS 27.2 beta 2</title><p>Beta 2 adds otter stickers to Messages.</p>')
    world.reply('Read the second one', { calls: [{ name: 'read_page', args: { url: found } }] }, { say: 'Beta 2 adds otter stickers.' })
    await otty.ask(panel, 'Read the second one')
    await expect(panel.locator('.tool-chips').getByText('Reading 9to5mac.com')).toBeVisible()
    await expect(panel.getByText('Beta 2 adds otter stickers.')).toBeVisible()
    await expect(panel.getByText('Read this page?')).toHaveCount(0)
    expect(toolResults(world.turnRequests('anthropic').at(-1))).toContain('Beta 2 adds otter stickers to Messages.')

    // An address the model came up with by itself needs the user's OK.
    const madeUp = 'https://otters.example/notes'
    world.reply('Now read my otter notes', { calls: [{ name: 'read_page', args: { url: madeUp } }] }, { say: 'Okay, I won’t open it.' })
    await otty.ask(panel, 'Now read my otter notes')
    await expect(panel.getByText('Read this page?')).toBeVisible()
    // The host on its own line, then the rest of the address (D-60).
    await expect(panel.locator('.confirm-card')).toContainText('otters.example')
    await expect(panel.locator('.confirm-card')).toContainText('/notes')
    await panel.getByRole('button', { name: 'Skip' }).click()
    await expect(panel.getByText('Okay, I won’t open it.')).toBeVisible()
    expect(world.requests.filter((r) => r.url.startsWith('https://otters.example/'))).toEqual([])
  })
})

test.describe('on OpenAI', () => {
  test.use({ seed: { ...ONBOARDED, baseUrl: 'https://api.openai.com/v1', model: 'gpt-5', apiKeys: { openai: plain('sk-openai-smoke-0000') } } })

  test('reads a public page from the Mac and refuses a private one', { tag: ['@step-61'] }, async ({ otty, world }) => {
    world.page('https://example.com/otters', '<title>Otters</title><p>Sea otters hold hands while they sleep.</p>')
    world.reply('Summarise https://example.com/otters', { calls: [{ name: 'read_page', args: { url: 'https://example.com/otters' } }] }, { say: 'Sea otters hold hands as they sleep.' })
    world.backgroundReply = 'Otters'
    const panel = await otty.openPanel()
    await otty.ask(panel, 'Summarise https://example.com/otters')
    await expect(panel.locator('.tool-chips').getByText('Reading example.com')).toBeVisible()
    await expect(panel.getByText('Sea otters hold hands as they sleep.')).toBeVisible()
    expect(toolResults(world.turnRequests('openai').at(-1))).toContain('# Otters\nSource: https://example.com/otters\n\nSea otters hold hands while they sleep.')

    // A private address is refused before anything is sent, even one the user typed.
    world.reply('What’s on http://192.168.1.1', { calls: [{ name: 'read_page', args: { url: 'http://192.168.1.1' } }] }, { say: 'I can only read public pages.' })
    await otty.ask(panel, 'What’s on http://192.168.1.1')
    await expect(panel.getByText('I can only read public pages.')).toBeVisible()
    await expect(panel.locator('.tool-chips').getByText('Reading 192.168.1.1 (didn’t work)')).toBeVisible()
    expect(toolResults(world.turnRequests('openai').at(-1))).toContain('Otty can only read public web pages.')

    // So is a public page that redirects to one.
    world.page('https://short.example/router', { location: 'http://192.168.1.1/admin' })
    world.reply('Summarise https://short.example/router', { calls: [{ name: 'read_page', args: { url: 'https://short.example/router' } }] }, { say: 'That link leads somewhere private.' })
    await otty.ask(panel, 'Summarise https://short.example/router')
    await expect(panel.getByText('That link leads somewhere private.')).toBeVisible()
    expect(toolResults(world.turnRequests('openai').at(-1)).match(/Otty can only read public web pages\./g)).toHaveLength(2)
    expect(world.requests.filter((r) => r.url.includes('192.168.1.1'))).toEqual([])
  })
})
