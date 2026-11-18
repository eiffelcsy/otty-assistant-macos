// Choosing Otty's brain (D-47): Claude set up from Settings, and switching services in the middle of a chat.
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, SMOKE_KEY, test, type Otty } from '../fixtures'
import type { ModelBody } from '../world/server'

/** Settings › Connection › Change service or key: the one place with an explicit Check and save (D-61). */
async function changeService(otty: Otty, panel: Page): Promise<void> {
  await otty.settings(panel, 'Connection')
  await panel.getByRole('button', { name: 'Change service or key' }).click()
}

const plain = (key: string) => ({ enc: Buffer.from(key).toString('base64'), plain: true })

/** The assistant blocks Claude's requests sent back, flattened. */
const sentBack = (body: ModelBody | undefined) =>
  (body?.messages ?? []).filter((m) => m.role === 'assistant').flatMap((m) => (Array.isArray(m.content) ? (m.content as Record<string, unknown>[]) : []))

test('Claude, set up from Settings: the test names the model, tools work, and the chat carries on after reopening', { tag: ['@step-59'] }, async ({ otty, world }) => {
  const panel = await otty.openPanel()
  await changeService(otty, panel)
  await panel.getByRole('radio', { name: /^Claude/ }).check()
  await panel.getByLabel('API key').fill('sk-ant-smoke-0000')
  await panel.getByRole('button', { name: 'Check and save' }).click()
  await expect(panel.getByText('Connected to claude-sonnet-5-5! Otty is ready to help.')).toBeVisible()
  expect(world.requests.filter((r) => r.url.startsWith('https://api.anthropic.com/')).map((r) => r.authorization)).toContain('Bearer sk-ant-smoke-0000')

  // Not a sum: those are worked out on the Mac without asking the model at all.
  world.page('https://example.com/otters', '<title>Otters</title><p>Sea otters hold hands while they sleep.</p>')
  world.reply(
    'Summarise https://example.com/otters',
    { think: 'The user gave the address, so read it.', calls: [{ name: 'read_page', args: { url: 'https://example.com/otters' } }] },
    { say: 'Sea otters **hold hands** as they sleep.' }
  )
  world.backgroundReply = 'Otters holding hands'
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await otty.ask(panel, 'Summarise https://example.com/otters')
  await expect(panel.getByText('Reading example.com')).toBeVisible()
  await expect(panel.getByRole('strong').filter({ hasText: 'hold hands' })).toBeVisible()

  world.reply('Why do they do that?', { say: 'So they don’t drift apart.' })
  await otty.ask(panel, 'Why do they do that?')
  await expect(panel.getByText('So they don’t drift apart.')).toBeVisible()
  // Claude's earlier reply went back exactly as it came, signed thinking included.
  expect(sentBack(world.turnRequests('anthropic').at(-1))).toContainEqual(expect.objectContaining({ type: 'thinking', thinking: 'The user gave the address, so read it.' }))

  await panel.getByRole('button', { name: 'New chat' }).click()
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.getByRole('button', { name: /Otters holding hands/ }).click()
  await expect(panel.getByText('So they don’t drift apart.')).toBeVisible()
  world.reply('Do river otters too?', { say: 'River otters rarely do.' })
  await otty.ask(panel, 'Do river otters too?')
  await expect(panel.getByText('River otters rarely do.')).toBeVisible()
  const last = world.turnRequests('anthropic').at(-1)
  expect(JSON.stringify(last?.messages)).toContain('Why do they do that?')
  expect(sentBack(last)).toContainEqual(expect.objectContaining({ type: 'thinking', thinking: 'The user gave the address, so read it.' }))
})

test.describe('on OpenAI, with a DeepSeek key saved too', () => {
  const openAiKey = 'sk-openai-smoke-0000'
  test.use({ seed: { ...ONBOARDED, baseUrl: 'https://api.openai.com/v1', model: 'gpt-5', apiKeys: { ...(ONBOARDED.apiKeys as object), openai: plain(openAiKey) } } })

  test('switching services mid-chat carries the chat on, and switching back keeps each key', { tag: ['@step-61'] }, async ({ otty, world }) => {
    world.backgroundReply = 'Switching'
    world.reply('Hello from OpenAI', { say: 'Hi, OpenAI here.' })
    const panel = await otty.openPanel()
    await otty.ask(panel, 'Hello from OpenAI')
    await expect(panel.getByText('Hi, OpenAI here.')).toBeVisible()

    await changeService(otty, panel)
    await panel.getByRole('radio', { name: /^DeepSeek/ }).check()
    await expect(panel.getByPlaceholder('Saved (paste to replace)')).toBeVisible()
    await panel.getByRole('button', { name: 'Check and save' }).click()
    await expect(panel.getByText(/Connected to deepseek-flash!/)).toBeVisible()
    world.reply('Still there?', { say: 'Yes, DeepSeek now.' })
    await panel.getByRole('button', { name: 'Back to chat' }).click()
    await otty.ask(panel, 'Still there?')
    await expect(panel.getByText('Yes, DeepSeek now.')).toBeVisible()

    await changeService(otty, panel)
    await panel.getByRole('radio', { name: /^OpenAI/ }).check()
    await expect(panel.getByPlaceholder('Saved (paste to replace)')).toBeVisible()
    await panel.getByLabel('Model').fill('gpt-5')
    await panel.getByRole('button', { name: 'Check and save' }).click()
    await expect(panel.getByText(/Connected to gpt-5!/)).toBeVisible()
    world.reply('And back again?', { say: 'OpenAI again.' })
    await panel.getByRole('button', { name: 'Back to chat' }).click()
    await otty.ask(panel, 'And back again?')
    await expect(panel.getByText('OpenAI again.')).toBeVisible()

    const turns = world.requests.filter((r) => (r.body as ModelBody | undefined)?.stream)
    expect(turns.map((r) => [r.url, r.authorization])).toEqual([
      ['https://api.openai.com/v1/chat/completions', `Bearer ${openAiKey}`],
      ['https://api.deepseek.com/chat/completions', `Bearer ${SMOKE_KEY}`],
      ['https://api.openai.com/v1/chat/completions', `Bearer ${openAiKey}`]
    ])
    // Each service got the whole conversation so far.
    expect(JSON.stringify(turns[1].body)).toContain('Hi, OpenAI here.')
    expect(JSON.stringify(turns[2].body)).toContain('Yes, DeepSeek now.')
  })
})

