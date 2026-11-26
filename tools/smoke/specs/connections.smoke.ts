// Settings › Connections (D-54, docs/design/specs/10-connections.md): Canvas, Notion, Apple Calendar and Reminders,
// Google Calendar, and the user's own MCP connections, by key and by browser sign-in. Their tools stay off until turned
// on, and a tool that changes on the server turns itself off.
import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { textOf, toolNames, type ModelBody, type World } from '../world/server'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)
const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code}\n\`\`\``

/** A local day `offset` days from today, as the model writes dates: YYYY-MM-DD. */
function ymd(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local time on a day `offset` from today, as an ISO string the helpers would report. */
function at(offset: number, hour: number, minute = 0): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, hour, minute).toISOString()
}

/** What the tools told the model in the latest request: OpenAI's `tool` messages, or Anthropic's `tool_result` blocks. */
function toolResults(body: ModelBody | undefined): string {
  return (body?.messages ?? [])
    .flatMap((m) => {
      if (m.role === 'tool') return [textOf(m.content)]
      if (!Array.isArray(m.content)) return []
      return (m.content as { type?: string; content?: unknown }[]).filter((b) => b.type === 'tool_result').map((b) => textOf(b.content))
    })
    .join('\n')
}

/** No token or key the user typed ever reaches a model request. */
function expectNoSecrets(world: World): void {
  const sent = JSON.stringify(world.modelRequests())
  for (const secret of ['canvas-token', 'notion-token', 'mcp-key', 'google-access', 'google-refresh', 'mcp-access']) expect(sent, `${secret} reached a model`).not.toContain(secret)
}

/** Holds a confirm card's button until it has armed (D-60): a click before then does nothing, so it's retried. */
async function goAhead(panel: Page, service: string): Promise<void> {
  const go = panel.locator('.confirm-card').getByRole('button', { name: 'Go ahead' })
  await expect(panel.locator('.confirm-card')).toContainText(`Let ${service} do this?`)
  await expect(async () => {
    await go.click()
    await expect(panel.locator('.receipt', { hasText: service })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

/** Fills in and submits Settings › Connections' own-connection form. */
async function addOwn(panel: Page, f: { name: string; url: string; auth?: 'none' | 'token' | 'oauth'; key?: string }): Promise<void> {
  await panel.getByRole('button', { name: /^Your own connection/ }).click()
  await panel.getByLabel('Name', { exact: true }).fill(f.name)
  await panel.getByLabel('Address', { exact: true }).fill(f.url)
  if (f.auth) await panel.getByLabel('How it signs in').selectOption(f.auth)
  if (f.key) await panel.getByLabel('Key or token', { exact: true }).fill(f.key)
  await panel.getByRole('button', { name: 'Check and add' }).click()
}

/** Turns on one of a connection's tools. The switch is controlled, so its state follows the round trip, not the click. */
async function turnOn(panel: Page, name: RegExp): Promise<void> {
  const box = panel.getByRole('checkbox', { name })
  await box.click()
  await expect(box).toBeChecked()
}

/** Opens a connected row in Settings, which starts closed each time the section is shown. */
async function openRow(panel: Page, name: RegExp): Promise<void> {
  await panel.getByRole('button', { name }).click()
}

/** The chat's tool list in the latest streamed request, for the MCP tools that were offered. */
const offeredNow = (world: World) => toolNames(world.turnRequests().at(-1)!)

test('Canvas: a wrong token is refused and cleared, the right one connects, and what’s due reaches the model', { tag: ['@step-183'] }, async ({ otty, world }) => {
  world.reply(streamed('what’s due this week?'), { calls: [{ name: 'canvas_due', args: { from: ymd(0), to: ymd(6) } }] }, { say: 'The kelp essay is due in two days.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await panel.getByRole('button', { name: /^Canvas/ }).click()
  await panel.getByLabel('Your school’s Canvas address').fill('canvas.example.edu')
  await panel.getByLabel('Token', { exact: true }).fill('nope')
  await panel.getByRole('button', { name: 'Check and connect' }).click()
  await expect(panel.locator('.error-card')).toHaveText('Canvas didn’t accept that token. Check you copied all of it.')
  await expect(panel.getByLabel('Token', { exact: true })).toHaveValue('')

  await panel.getByLabel('Token', { exact: true }).fill('canvas-token')
  await panel.getByRole('button', { name: 'Check and connect' }).click()
  await expect(panel.getByText('Connected as Sam Otter')).toBeVisible()
  await expect(panel.getByRole('button', { name: /^Canvas/ })).toBeVisible()

  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'what’s due this week?')
  await expect(panel.locator('.msg--otty').last()).toContainText('The kelp essay is due in two days.')
  expect(toolResults(world.turnRequests().at(-1))).toContain('Essay on kelp forests')
  expectNoSecrets(world)
})

test('Notion: a page shared with Otty is found, with no card', { tag: ['@step-184'] }, async ({ otty, world }) => {
  world.reply(streamed('Find my field notes'), { calls: [{ name: 'notion_search', args: { query: 'field' } }] }, { say: 'Your page is “Field notes”.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await panel.getByRole('button', { name: /^Notion/ }).click()
  await panel.getByLabel('Token', { exact: true }).fill('notion-token')
  await panel.getByRole('button', { name: 'Check and connect' }).click()
  // viewOf() throws for a Notion connection (no URL), so the confirmation never shows; soft keeps the flow going.
  await expect(panel.getByText('Connected to Otty integration')).toBeVisible()

  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'Find my field notes')
  await expect(panel.locator('.msg--otty').last()).toContainText('Your page is “Field notes”.')
  expect(toolResults(world.turnRequests().at(-1))).toContain('Field notes')
  await expect(panel.locator('.confirm-card')).toHaveCount(0)
  expectNoSecrets(world)
})

test('Apple Calendar and Reminders: a refusal says so and offers System Settings, and then tomorrow’s events and reminders reach the model', { tag: ['@step-185'] }, async ({ otty, world }) => {
  world.reply(streamed('what’s on tomorrow?'), { calls: [{ name: 'calendar_events', args: { from: ymd(1), to: ymd(1) } }] }, { say: 'Swim practice at seven.' })
  world.reply(streamed('any reminders?'), { calls: [{ name: 'reminders_due', args: {} }] }, { say: 'Return the library books.' })
  await otty.mac({ calendar: { allowed: false, events: [], reminders: [] } })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await panel.getByRole('button', { name: /^Apple Calendar and Reminders/ }).click()
  await panel.getByRole('button', { name: 'Allow access' }).click()
  await expect(panel.locator('.error-card')).toContainText('Otty isn’t allowed to read your calendars')
  await panel.getByRole('button', { name: /^Open System Settings/ }).click()
  // shell:open passes only http(s) addresses on, so this never opens (app bug, see the report). Soft keeps the flow going.
  const opened = await expect
    .poll(async () => (await otty.snapshot()).calls.filter((c) => c.kind === 'open-external').map((c) => c.detail[0]))
    .toEqual(['x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars'])
    .then(() => true, () => false)
  expect(opened, 'Open System Settings opens the calendar privacy pane').toBe(true)

  await otty.mac({
    calendar: {
      allowed: true,
      events: [{ title: 'Swim practice', start: at(1, 7), end: at(1, 8), allDay: false, calendar: 'Home' }],
      reminders: [{ title: 'Return library books', list: 'Errands' }]
    }
  })
  await panel.getByRole('button', { name: 'Allow access' }).click()
  // viewOf() throws for an Apple connection (no URL): the saved connection is fine, its confirmation isn't.
  await expect(panel.getByText('Connected. Ask “what’s on tomorrow?” to try it.')).toBeVisible()

  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'what’s on tomorrow?')
  await expect(panel.locator('.msg--otty').last()).toContainText('Swim practice at seven.')
  expect(toolResults(world.turnRequests().at(-1))).toContain('Swim practice')
  await otty.ask(panel, 'any reminders?')
  await expect(panel.locator('.msg--otty').last()).toContainText('Return the library books.')
  expect(toolResults(world.turnRequests().at(-1))).toContain('Return library books')
})

test('Google Calendar: a browser sign-in connects, the model sees events without attendees or notes, and disconnecting revokes it', { tag: ['@step-186'] }, async ({ otty, world }) => {
  world.reply(streamed('what’s on tomorrow?'), { calls: [{ name: 'calendar_events', args: { from: ymd(1), to: ymd(1) } }] }, { say: 'You have the dentist at ten.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await panel.getByRole('button', { name: /^Google Calendar/ }).click()
  await panel.getByRole('button', { name: 'Sign in with Google', exact: true }).click()
  await expect(panel.getByText('Finish signing in in your browser')).toBeVisible()

  let authUrl = ''
  await expect
    .poll(async () => {
      authUrl = (await otty.snapshot()).calls.map((c) => c.detail[0]).find((u) => u?.startsWith('https://accounts.google.com/')) ?? ''
      return authUrl
    })
    .not.toBe('')
  const url = new URL(authUrl)
  expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth')
  expect(url.searchParams.get('client_id')).toBe('smoke-google-client')
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  const redirect = url.searchParams.get('redirect_uri') ?? ''
  expect(redirect).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
  // The browser comes back to Otty's catcher on this Mac, with the code Google would have sent.
  const back = await fetch(`${redirect}?code=smoke-code&state=${encodeURIComponent(url.searchParams.get('state') ?? '')}`)
  expect(back.status).toBe(200)
  // viewOf() throws for a Google connection too, so its confirmation never shows; soft keeps the flow going.
  await expect(panel.getByText('Connected. Ask “what’s on tomorrow?” to try it.')).toBeVisible()

  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'what’s on tomorrow?')
  await expect(panel.locator('.msg--otty').last()).toContainText('You have the dentist at ten.')
  const result = toolResults(world.turnRequests().at(-1))
  expect(result).toContain('Dentist')
  expect(result, 'an attendee’s address stays on this side').not.toContain('dr.jones@clinic.example')
  expect(result, 'an event’s notes stay on this side').not.toContain('insurance card')
  expectNoSecrets(world)

  await otty.settings(panel, 'Connections')
  await openRow(panel, /^Google Calendar/)
  await otty.hold(panel.getByRole('button', { name: /^Hold to disconnect/ }))
  await expect.poll(() => world.connections.revoked).toEqual(['google-refresh'])
  await expect(panel.getByRole('button', { name: /^Google Calendar/ })).toHaveCount(1)
})

test('your own connection by key: its tools stay off until turned on, and an action asks first', { tag: ['@step-187'] }, async ({ otty, world }) => {
  world.connections.mcpToken = 'mcp-key'
  world.reply(streamed('What can Linear do?'), { say: 'Ask me.' })
  world.reply(streamed('Which Linear tools'), { say: 'Two.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await addOwn(panel, { name: 'Linear', url: 'https://mcp.example.com/mcp', auth: 'token', key: 'mcp-key' })
  await expect(panel.getByText(/^List issues/), 'a tool is titled “List issues”, not its raw name').toBeVisible()
  await expect(panel.getByRole('checkbox', { name: /^List issues/ })).not.toBeChecked()
  await expect(panel.getByRole('checkbox', { name: /^Create issue/ })).not.toBeChecked()

  // Before any tool is turned on, the model is offered none of the connection's tools.
  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'What can Linear do?')
  await expect(panel.locator('.msg--otty').last()).toContainText('Ask me.')
  expect(offeredNow(world).filter((n) => n.startsWith('mcp_'))).toEqual([])

  await otty.settings(panel, 'Connections')
  await openRow(panel, /^Linear/)
  await turnOn(panel, /^List issues/)
  await turnOn(panel, /^Create issue/)
  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'Which Linear tools can you use?')
  await expect(panel.locator('.msg--otty').last()).toContainText('Two.')
  const list = offeredNow(world).find((n) => /^mcp_[0-9a-f]{6}_list_issues$/.test(n))
  const create = offeredNow(world).find((n) => /^mcp_[0-9a-f]{6}_create_issue$/.test(n))
  expect(list, 'list_issues is offered once turned on').toBeDefined()
  expect(create, 'create_issue is offered once turned on').toBeDefined()

  // A read-only tool runs with no card.
  world.reply(streamed('List my open issues'), { calls: [{ name: list!, args: { team: 'Otters' } }] }, { say: 'One open issue: kelp forests need water.' })
  await otty.ask(panel, 'List my open issues')
  await expect(panel.locator('.msg--otty').last()).toContainText('kelp forests need water')
  await expect(panel.locator('.confirm-card')).toHaveCount(0)
  await expect.poll(() => world.connections.mcpCalls.map((c) => c.name)).toEqual(['list_issues'])

  // A tool that changes something asks first, and runs once the user goes ahead.
  world.reply(streamed('File a bug about the kelp'), { calls: [{ name: create!, args: { title: 'Kelp bug' } }] }, { say: 'Filed it.' })
  await otty.ask(panel, 'File a bug about the kelp')
  await goAhead(panel, 'Linear')
  await expect(panel.locator('.msg--otty').last()).toContainText('Filed it.')
  await expect.poll(() => world.connections.mcpCalls.map((c) => c.name)).toEqual(['list_issues', 'create_issue'])
  expect(world.connections.mcpCalls[1].args).toEqual({ title: 'Kelp bug' })
  expectNoSecrets(world)
})

test('a tool that changed on the server turns itself off until it is checked again', { tag: ['@step-188'] }, async ({ otty, world }) => {
  world.connections.mcpToken = 'mcp-key'
  world.reply(streamed('Which Linear tools'), { say: 'Two.' })
  world.reply(streamed('Anything else for Linear?'), { say: 'Nothing else.' })
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await addOwn(panel, { name: 'Linear', url: 'https://mcp.example.com/mcp', auth: 'token', key: 'mcp-key' })
  await turnOn(panel, /^List issues/)
  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'Which Linear tools can you use?')
  await expect(panel.locator('.msg--otty').last()).toContainText('Two.')
  expect(offeredNow(world).some((n) => n.endsWith('_list_issues'))).toBe(true)

  // The server now describes list_issues differently, which is the change a spec can't pin on its own.
  world.connections.mcpTools = [
    { name: 'list_issues', description: 'Lists every issue, private ones too', inputSchema: { type: 'object', properties: { team: { type: 'string' } } }, annotations: { readOnlyHint: true } },
    { name: 'create_issue', description: 'Creates an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }
  ]
  await otty.settings(panel, 'Connections')
  await openRow(panel, /^Linear/)
  await panel.getByRole('button', { name: 'Check again' }).click()
  // The summary line is the spec's words; Connections.tsx shows a recheck's message only when it fails, so this is the gap.
  await expect(panel.getByText(/1 tool changed since you turned them on/)).toBeVisible()
  await expect(panel.getByText(/^Changed since you turned it on/)).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: /^List issues/ })).not.toBeChecked()

  await otty.go(panel, 'Chat')
  await otty.ask(panel, 'Anything else for Linear?')
  await expect(panel.locator('.msg--otty').last()).toContainText('Nothing else.')
  expect(offeredNow(world).some((n) => n.endsWith('_list_issues'))).toBe(false)
})

test('a model can offer a connection in a chat, and its card adds it on the button', { tag: ['@step-189'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Linear connection'
  const block = JSON.stringify({ service: 'mcp', name: 'Linear', url: 'https://mcp.example.com/mcp', auth: 'none' })
  world.reply(streamed('make Linear a connection'), { say: `Here’s Linear. Add it with the button.\n\n${fence('connection', block)}` })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'make Linear a connection')
  const card = panel.locator('.connect-card')
  await expect(card.getByText('Add “Linear”')).toBeVisible()
  await expect(card.getByText('mcp.example.com')).toBeVisible()
  await card.getByRole('button', { name: 'Check and add' }).click()
  await expect(card.getByText('Linear is connected')).toBeVisible()

  await otty.settings(panel, 'Connections')
  await expect(panel.getByRole('button', { name: /^Linear/ })).toBeVisible()
  expectNoSecrets(world)
  expect(JSON.stringify(world.modelRequests())).not.toContain('mcp-key')
})

test('your own connection that signs in in the browser is added, with its tools listed', { tag: ['@step-190'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await otty.settings(panel, 'Connections')
  await panel.getByRole('button', { name: /^Your own connection/ }).click()
  await panel.getByLabel('Name', { exact: true }).fill('Linear')
  await panel.getByLabel('Address', { exact: true }).fill('https://auth-mcp.example.com/mcp')
  await expect(panel.getByLabel('How it signs in')).toHaveValue('oauth')
  await panel.getByRole('button', { name: 'Check and add', exact: true }).click()
  await expect(panel.getByText('Finish signing in in your browser')).toBeVisible()

  let authUrl = ''
  await expect
    .poll(async () => {
      authUrl = (await otty.snapshot()).calls.map((c) => c.detail[0]).find((u) => u?.startsWith('https://auth-mcp.example.com/authorize')) ?? ''
      return authUrl
    })
    .not.toBe('')
  const url = new URL(authUrl)
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  const redirect = url.searchParams.get('redirect_uri') ?? ''
  const back = await fetch(`${redirect}?code=smoke-mcp-code&state=${encodeURIComponent(url.searchParams.get('state') ?? '')}`)
  expect(back.status).toBe(200)

  await expect(panel.getByText('Added. Turn on the tools you want Otty to use.')).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: /^List issues/ })).not.toBeChecked()
  await expect(panel.getByRole('checkbox', { name: /^Create issue/ })).not.toBeChecked()
  expectNoSecrets(world)
})
