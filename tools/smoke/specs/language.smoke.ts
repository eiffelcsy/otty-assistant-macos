// Home language and answer language (D-2), and the cache-friendly request shape DeepSeek needs (CLAUDE.md): the
// system prompt depends only on settings, per-turn words go at the end of the user's message, and a follow-up repeats
// the last request byte for byte. Whether a real model answers in Traditional characters with HK words is the eval's.
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, test, type Otty } from '../fixtures'
import { textOf, type ModelBody } from '../world/server'

const HOME = { ...ONBOARDED, homeLanguage: 'zh-HK' }
const SAFARI = { name: 'Safari', bundleId: 'com.apple.Safari', title: 'News', url: 'https://example.com/news' }

const ASK_ENGLISH = '(Please reply in English'
const ASK_CHINESE = '(Please reply in Traditional Chinese as written in Hong Kong'

/** Chat requests only: titles and explain warm-ups aren't streamed. */
const chats = (otty: Otty): ModelBody[] => otty.world.modelRequests().filter((b) => b.stream)

/** The latest question's words, as the model got them. */
function lastQuestion(otty: Otty): string {
  const user = [...(chats(otty).at(-1)?.messages ?? [])].reverse().find((m) => m.role === 'user')
  return textOf(user?.content)
}

const systemOf = (body: ModelBody | undefined) => textOf(body?.messages?.find((m) => m.role === 'system')?.content)

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()

/** Asks, then waits for that question's answer to finish (its Copy button only shows once it has). */
async function askAndWait(otty: Otty, page: Page, text: string): Promise<void> {
  const before = await page.locator('.msg--otty').count()
  await otty.ask(page, text)
  await expect(page.locator('.msg--otty')).toHaveCount(before + 1)
  await expect(lastAnswer(page).getByRole('button', { name: 'Copy' })).toBeVisible()
}

const pill = (page: Page) => page.getByRole('group', { name: 'Answer language for this message' })

test.describe('with 繁體中文（香港） as the other language', () => {
  test.use({ seed: HOME })

  test('English only in Settings takes away every Chinese choice, and Chinese questions get English', { tag: ['@step-19'] }, async ({ otty, world }) => {
    const panel = await otty.openPanel()
    await expect(pill(panel)).toBeVisible()
    await otty.settings(panel, 'You & Otty')
    await panel.getByRole('combobox', { name: 'Help in my own language' }).selectOption('none')
    await expect(panel.getByText('Saved')).toBeVisible()
    await panel.getByRole('button', { name: 'Back to chat' }).click()
    await expect(pill(panel)).toHaveCount(0)

    world.reply('這是什麼意思', { say: 'It means “what does this mean?”.' })
    await askAndWait(otty, panel, '這是什麼意思？')
    await expect(lastAnswer(panel).getByRole('button', { name: /^In / })).toHaveCount(0)
    const q = lastQuestion(otty)
    expect(q).not.toContain(ASK_CHINESE)
    // English-only users get no language line at all, and no Hong Kong guide.
    expect(q).not.toContain(ASK_ENGLISH)
    expect(systemOf(chats(otty).at(-1))).not.toContain('Hong Kong')

    // No EN / 中 pill on a highlight either.
    await panel.getByRole('button', { name: 'Close (Esc)' }).click()
    await otty.mac({ selection: 'Sea otters hold hands while they sleep.', front: SAFARI })
    await otty.press('Alt+Space')
    const quick = await otty.view('quick')
    await expect(quick.getByText('Sea otters hold hands while they sleep.')).toBeVisible()
    await expect(pill(quick)).toHaveCount(0)
  })

  test('a highlight answers in English, a question typed in Chinese answers in Chinese, with the HK guide', { tag: ['@step-20', '@step-23'] }, async ({ otty, world }) => {
    await otty.mac({ selection: 'The quarterly report is due on Friday.', front: SAFARI })
    await otty.press('Alt+Space')
    const quick = await otty.view('quick')
    await expect(pill(quick)).toBeVisible()
    world.reply('Explain this simply.', { say: 'Your report has to be in by Friday.' })
    await quick.locator('textarea').press('Enter')
    await expect(quick.getByText('in by Friday')).toBeVisible()
    expect(lastQuestion(otty)).toContain(ASK_ENGLISH)

    const panel = await otty.openPanel()
    world.reply('這是什麼意思', { say: '意思是報告要在星期五前交。' })
    world.reply('PDF', { say: '按「File」（檔案）→「Print」（打印），然後選「Save as PDF」（另存為 PDF）。' })
    await askAndWait(otty, panel, '這是什麼意思？')
    expect(lastQuestion(otty)).toContain(ASK_CHINESE)
    await askAndWait(otty, panel, '我怎樣把這個存成 PDF？')
    expect(lastQuestion(otty)).toContain(ASK_CHINESE)
    // The rules for menu names and HK words travel in the system prompt; following them is the eval's job.
    const system = systemOf(chats(otty).at(-1))
    expect(system).toContain('打印 (not 列印)')
    expect(system).toContain('Keep the screen\'s words in English')
    await expect(lastAnswer(panel)).toContainText('「Print」（打印）')
  })

  test('中 on the pill answers one English question in Chinese, then it goes back to Auto', { tag: ['@step-21'] }, async ({ otty, world }) => {
    world.reply('What is a mortgage?', { say: '按揭是向銀行借錢買樓。' })
    world.reply('And a deposit?', { say: 'A deposit is the part you pay up front.' })
    const panel = await otty.openPanel()
    await pill(panel).getByRole('button', { name: '中' }).click()
    await expect(pill(panel).getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'true')
    await askAndWait(otty, panel, 'What is a mortgage?')
    expect(lastQuestion(otty)).toContain(ASK_CHINESE)
    await expect(pill(panel).getByRole('button', { name: '中' })).toHaveAttribute('aria-pressed', 'false')
    await askAndWait(otty, panel, 'And a deposit?')
    expect(lastQuestion(otty)).toContain(ASK_ENGLISH)
  })

  test('In 中文 asks for the same answer in Chinese, and still works after reopening the chat', { tag: ['@step-22'] }, async ({ otty, world }) => {
    world.backgroundReply = 'Otter facts'
    world.reply('Why do otters hold hands?', { say: 'So they don’t drift apart while they sleep.' })
    world.reply('Please give your previous answer again, in Traditional Chinese', { say: '這樣睡覺時就不會漂散。' })
    world.reply('Please give your previous answer again, in English', { say: 'So they stay together while sleeping.' })
    const panel = await otty.openPanel()
    await askAndWait(otty, panel, 'Why do otters hold hands?')
    await lastAnswer(panel).getByRole('button', { name: 'In 中文' }).click()
    await expect(lastAnswer(panel)).toContainText('這樣睡覺時就不會漂散')
    await expect(panel.getByText('In 中文, please')).toBeVisible()
    // Only the latest answer offers it, and now the other way.
    await expect(panel.getByRole('button', { name: 'In 中文' })).toHaveCount(0)
    await expect(lastAnswer(panel).getByRole('button', { name: 'In English' })).toBeVisible()

    await panel.getByRole('button', { name: 'New chat' }).click()
    await panel.getByRole('button', { name: 'Recent chats' }).click()
    await panel.getByRole('button', { name: /Otter facts/ }).click()
    await expect(lastAnswer(panel)).toContainText('這樣睡覺時就不會漂散')
    await lastAnswer(panel).getByRole('button', { name: 'In English' }).click()
    await expect(lastAnswer(panel)).toContainText('stay together while sleeping')
    expect(lastQuestion(otty)).toContain('in English')
  })

  test('a single highlighted word gets its meaning with a 中文 line', { tag: ['@step-24'] }, async ({ otty, world }) => {
    await otty.mac({ selection: 'ubiquitous', front: SAFARI })
    await otty.press('Alt+Space')
    const quick = await otty.view('quick')
    await expect(quick.getByPlaceholder('Ask about this, or press ↵ for its meaning')).toBeVisible()
    world.reply('Tell me what this word or phrase means', { say: '**Meaning:** found everywhere.\n**中文:** 無處不在\n**Example:** Phones are ubiquitous.' })
    await quick.locator('textarea').press('Enter')
    await expect(quick.getByText('無處不在')).toBeVisible()
    expect(lastQuestion(otty)).toContain('**中文:** the Traditional Chinese')
  })
})

test('a follow-up repeats the last request byte for byte, with the turn note at the end of the question', { tag: ['@step-55'] }, async ({ otty, world }) => {
  world.reply('What do otters eat?', { say: 'Mostly fish and shellfish.' })
  world.reply('what time is it?', { say: 'It’s just past noon.' })
  const panel = await otty.openPanel()
  await askAndWait(otty, panel, 'What do otters eat?')
  await askAndWait(otty, panel, 'what time is it?')

  const [first, second] = chats(otty)
  expect(JSON.stringify(second.messages!.slice(0, first.messages!.length)), 'the follow-up starts with the first request, unchanged').toBe(JSON.stringify(first.messages))
  expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools))
  // The time is in the note, which closes the user's message, never the system prompt.
  const asked = lastQuestion(otty)
  expect(asked.startsWith('what time is it?')).toBe(true)
  expect(asked).toMatch(/\[Current local time: [^\]]+\(UTC[+-]\d\d:\d\d\)\]$/)
  const note = asked.slice(asked.lastIndexOf('[Current local time'))
  expect(systemOf(second)).not.toContain(note)
  expect(systemOf(second)).toBe(systemOf(first))
  // The chat shows only the user's own words.
  await expect(panel.getByText('Current local time')).toHaveCount(0)
  await expect(panel.getByText('what time is it?', { exact: true })).toBeVisible()
})

test.describe('the cache across languages', () => {
  test.use({ seed: HOME })

  test('switching 中 and English mid-chat only adds to the end', { tag: ['@step-55'] }, async ({ otty, world }) => {
    world.reply('What is a mortgage?', { say: '按揭是向銀行借錢買樓。' })
    world.reply('And a deposit?', { say: 'A deposit is the part you pay up front.' })
    const panel = await otty.openPanel()
    await pill(panel).getByRole('button', { name: '中' }).click()
    await askAndWait(otty, panel, 'What is a mortgage?')
    await pill(panel).getByRole('button', { name: 'EN' }).click()
    await askAndWait(otty, panel, 'And a deposit?')
    const [first, second] = chats(otty)
    expect(JSON.stringify(second.messages!.slice(0, first.messages!.length))).toBe(JSON.stringify(first.messages))
    expect(textOf(first.messages!.at(-1)!.content)).toContain(ASK_CHINESE)
    expect(textOf(second.messages!.at(-1)!.content)).toContain(ASK_ENGLISH)
    await expect(panel.getByText('Please reply in')).toHaveCount(0)
  })
})

test('the prefix holds after a tool call and with memories in the note', { tag: ['@step-76'] }, async ({ otty, world }) => {
  world.reply(
    'remember I keep sea otters',
    { calls: [{ name: 'remember', args: { text: 'Keeps sea otters', kind: 'about' } }] },
    { say: 'Noted — you keep sea otters.' }
  )
  world.reply('How much do my otters eat?', { calls: [{ name: 'calculate', args: { steps: ['2 * 25% * 30'] } }] }, { say: 'About **15 kg** a day for two.' })
  world.reply('And in a week?', { say: 'About 105 kg.' })
  const panel = await otty.openPanel()
  await askAndWait(otty, panel, 'Please remember I keep sea otters')
  await askAndWait(otty, panel, 'How much do my otters eat?')
  await askAndWait(otty, panel, 'And in a week?')

  const sent = chats(otty)
  expect(sent).toHaveLength(5)
  for (let i = 1; i < sent.length; i++) {
    const before = sent[i - 1].messages!
    expect(JSON.stringify(sent[i].messages!.slice(0, before.length)), `request ${i + 1} starts with request ${i}`).toBe(JSON.stringify(before))
    expect(systemOf(sent[i])).toBe(systemOf(sent[0]))
  }
  // The memory rides in the note at the end of the later questions.
  expect(textOf(sent[2].messages!.at(-1)!.content)).toContain('Keeps sea otters')
  expect(textOf(sent[4].messages!.at(-1)!.content)).toMatch(/^And in a week\?\n\n\[Current local time/)
})
