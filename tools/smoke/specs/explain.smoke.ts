// Explain cards and titles: `[term](#explain)` links in an answer, warmed in main's cache before a tap, the 中文 line
// and toggle, and the short title written after a chat's first answer. How good an explanation or title a real model
// writes is the eval's.
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, test, type Otty } from '../fixtures'
import { lastUserText, textOf, type ModelBody } from '../world/server'

const SAFARI = { name: 'Safari', bundleId: 'com.apple.Safari', title: 'Otters', url: 'https://example.com/otters' }

/** An explain card's request for `term`, in English or in Chinese. */
const explainsTerm = (term: string) => (text: string, body: ModelBody) => !body.stream && (text.includes(`Explain "${term}"`) || text.includes(`解釋「${term}」`))
const explainRequests = (otty: Otty, term: string) => otty.world.modelRequests().filter((b) => explainsTerm(term)(lastUserText(b), b))
const isTitle = (text: string, body: ModelBody) => !body.stream && text.startsWith('Write a title for this chat')

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()
const card = (page: Page) => page.getByRole('dialog')
const term = (page: Page, name: string) => page.locator('.explain-term', { hasText: name })

const ANSWER = 'An [API](#explain) lets apps talk. It uses [JSON](#explain), [HTTP](#explain) and sometimes a [webhook](#explain).'

test('a dotted term opens a warmed card, Ask more follows up, and a failed tap works again', { tag: ['@step-8', '@step-63'] }, async ({ otty, world }) => {
  world.reply('What is an API?', { say: ANSWER })
  world.reply(explainsTerm('API'), { say: 'An API is like a waiter taking your order to the kitchen.' })
  world.reply(explainsTerm('JSON'), { say: 'JSON is a tidy way to write lists of facts.' })
  world.reply(explainsTerm('HTTP'), { say: 'HTTP is the postal service of the web.' })
  world.reply(explainsTerm('webhook'), { say: 'A webhook is a doorbell one app rings for another.' })
  world.reply('Tell me more about "API".', { say: 'Sure — an API is a menu of things one program can ask another to do.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'What is an API?')
  await expect(term(panel, 'API')).toBeVisible()

  // The first three terms are fetched before any tap, once each; the fourth waits for one.
  await expect.poll(() => ['API', 'JSON', 'HTTP'].map((t) => explainRequests(otty, t).length)).toEqual([1, 1, 1])
  expect(explainRequests(otty, 'webhook')).toHaveLength(0)
  await term(panel, 'API').click()
  await expect(card(panel)).toContainText('like a waiter')
  expect(explainRequests(otty, 'API'), 'the tap used the warm-up').toHaveLength(1)

  await card(panel).getByRole('button', { name: /Ask more about this/ }).click()
  await expect(card(panel)).toHaveCount(0)
  await expect(panel.getByText('Tell me more about "API".')).toBeVisible()
  await expect(lastAnswer(panel)).toContainText('a menu of things')

  // Wi-Fi off: a friendly line, not an error. Back on, the next tap fetches it.
  await otty.control((c) => c.offline(true))
  await panel.locator('.msg--otty').first().locator('.explain-term', { hasText: 'webhook' }).click()
  await expect(card(panel)).toBeVisible()
  await expect(card(panel).locator('.explain-card__body')).toHaveText('Otty can’t reach the internet. Check your connection and try again.')
  await panel.locator('.msg--otty').first().locator('.explain-term', { hasText: 'webhook' }).click()
  await expect(card(panel)).toHaveCount(0)
  await otty.control((c) => c.offline(false))
  await panel.locator('.msg--otty').first().locator('.explain-term', { hasText: 'webhook' }).click()
  await expect(card(panel)).toContainText('doorbell')
})

test.describe('with Think deeper on', () => {
  test.use({ seed: { ...ONBOARDED, thinking: true } })

  test('cards still come back quickly, without thinking', { tag: ['@step-63'] }, async ({ otty, world }) => {
    world.reply('What is an API?', { think: 'Keep it simple.', say: 'An [API](#explain) lets apps talk.' })
    world.reply(explainsTerm('API'), { say: 'An API is like a waiter taking your order to the kitchen.' })
    const panel = await otty.openPanel()
    await otty.ask(panel, 'What is an API?')
    await term(panel, 'API').click()
    await expect(card(panel)).toContainText('like a waiter')
    const [chat] = world.modelRequests().filter((b) => b.stream) as { thinking?: { type: string } }[]
    expect(chat.thinking?.type).toBe('enabled')
    const [warm] = explainRequests(otty, 'API') as { thinking?: { type: string } }[]
    expect(warm.thinking?.type, 'an explain card never thinks').toBe('disabled')
  })
})

test.describe('with 繁體中文（香港） as the other language', () => {
  test.use({ seed: { ...ONBOARDED, homeLanguage: 'zh-HK' } })

  test('an explain card shows the 中文 line, and its EN / 中文 toggle switches the explanation', { tag: ['@step-24'] }, async ({ otty, world }) => {
    world.reply('What is an API?', { say: 'An [API](#explain) lets apps talk.' })
    world.reply((t, b) => !b.stream && t.includes('Explain "API"'), { say: '中文：應用程式介面\n\nAn API is like a waiter taking your order to the kitchen.' })
    world.reply((t, b) => !b.stream && t.includes('解釋「API」'), { say: 'API 就好像餐廳的侍應，幫你把點餐交給廚房。' })
    const panel = await otty.openPanel()
    await otty.ask(panel, 'What is an API?')
    await term(panel, 'API').click()
    await expect(card(panel).locator('.explain-card__gloss')).toHaveText('中文應用程式介面')
    await expect(card(panel).locator('.explain-card__body')).toHaveText('An API is like a waiter taking your order to the kitchen.')
    // The English prompt asked for the 中文 line first.
    expect(lastUserText(explainRequests(otty, 'API')[0])).toContain('Start with exactly one line "中文：')

    const toggle = card(panel).getByRole('group', { name: 'Explanation language' })
    await toggle.getByRole('button', { name: '中文' }).click()
    await expect(card(panel).locator('.explain-card__body')).toHaveText('API 就好像餐廳的侍應，幫你把點餐交給廚房。')
    await expect(card(panel).locator('.explain-card__gloss')).toHaveCount(0)
    await toggle.getByRole('button', { name: 'EN' }).click()
    await expect(card(panel).locator('.explain-card__body')).toContainText('like a waiter')
    // Each language was fetched once: switching back used the cache.
    expect(explainRequests(otty, 'API')).toHaveLength(2)
  })
})

test('a long highlight gets a short real title that search finds, and a Chinese question a Chinese title', { tag: ['@step-64'] }, async ({ otty, world }) => {
  const paragraph =
    'Sea otters spend most of their lives in the water. When they sleep, they float on their backs and often hold paws with another otter, or wrap themselves in kelp, so that they do not drift apart from the group while resting in the current.'
  world.reply('Explain this simply.', { say: 'Otters hold paws so they don’t float away while they sleep.' })
  world.reply(isTitle, { say: '"Why sea otters hold paws."' })
  await otty.mac({ selection: paragraph, front: SAFARI })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  // ↵ on an empty box explains the highlight, so wait until it has arrived, as a person would.
  await expect(quick.getByText(/Sea otters spend most of their lives/)).toBeVisible()
  await quick.locator('textarea').press('Enter')
  await expect(quick.getByText('float away while they sleep')).toBeVisible()
  // The title prompt got the highlight, not just the chip's label.
  await expect.poll(() => world.modelRequests().filter((b) => isTitle(lastUserText(b), b)).length).toBe(1)
  expect(lastUserText(world.modelRequests().find((b) => isTitle(lastUserText(b), b))!)).toContain('hold paws with another otter')

  const panel = await otty.openPanel()
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  // Quotes and the full stop are cleaned off.
  await expect(panel.getByRole('button', { name: /Why sea otters hold paws/ })).toBeVisible()
  await expect(panel.getByText('Why sea otters hold paws.')).toHaveCount(0)
  await expect(panel.getByText(/Sea otters spend most of their lives/)).toHaveCount(0)

  await panel.getByPlaceholder('Search your chats').fill('paws')
  await expect(panel.getByRole('button', { name: /Why sea otters hold paws/ })).toBeVisible()
  await panel.getByPlaceholder('Search your chats').fill('')

  // A Chinese question: the title prompt asks for the question's language, and the Chinese title shows.
  world.reply('水獺吃什麼', { say: '水獺主要吃魚和貝類。' })
  world.reply(isTitle, { say: '水獺的食物' })
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await panel.getByRole('button', { name: 'New chat' }).click()
  await otty.ask(panel, '水獺吃什麼？')
  await expect(panel.getByText('水獺主要吃魚和貝類。')).toBeVisible()
  await expect.poll(() => world.modelRequests().filter((b) => isTitle(lastUserText(b), b)).length).toBe(2)
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await expect(panel.getByRole('button', { name: /水獺的食物/ })).toBeVisible()
  expect(textOf(world.modelRequests().filter((b) => isTitle(lastUserText(b), b))[1].messages?.[0]?.content)).toContain('in the same language as the question')
})
