// Memory (D-20 to D-24): the `remember` and `forget` tools with their Noted lines and Undo, the guard that never takes
// the model's word, "don't learn" per chat, the Settings list, habits counted on the Mac, and the Used line.
// The model is scripted, so these check Otty's side; whether a real model leans on a memory is the eval's.
import type { Page } from '@playwright/test'
import { expect, test, type Otty } from '../fixtures'
import { textOf, type ModelBody } from '../world/server'

const MEMORY_NOTE = '[What you know about the user'

/** Chat requests only: titles and explain warm-ups aren't streamed. */
const chats = (otty: Otty): ModelBody[] => otty.world.modelRequests().filter((b) => b.stream)

/** The latest question's words, as the model got them, note included. */
function lastQuestion(otty: Otty): string {
  const user = [...(chats(otty).at(-1)?.messages ?? [])].reverse().find((m) => m.role === 'user')
  return textOf(user?.content)
}

/** What the latest tool call told the model. */
function lastToolResult(otty: Otty): string {
  const tool = [...(chats(otty).at(-1)?.messages ?? [])].reverse().find((m) => m.role === 'tool')
  return textOf(tool?.content)
}

const offersRemember = (body: ModelBody | undefined) => Boolean(body?.tools?.some((t) => t.function?.name === 'remember'))

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()
const notedLines = (page: Page) => page.locator('.memory-line')

/** Asks, then waits for that question's answer to finish (its Copy button only shows once it has). */
async function askAndWait(otty: Otty, page: Page, text: string): Promise<void> {
  const before = await page.locator('.msg--otty').count()
  await otty.ask(page, text)
  await expect(page.locator('.msg--otty')).toHaveCount(before + 1)
  await expect(lastAnswer(page).getByRole('button', { name: 'Copy' })).toBeVisible()
}

/** A chat question's words. Titles quote the question too, so a plain string would let a title request use up a turn. */
const asked = (words: string) => (text: string, body: ModelBody) => Boolean(body.stream) && text.includes(words)

/** Scripts one answer that calls `name` with `args`, then says `say`. */
function replyWithTool(otty: Otty, match: string, name: 'remember' | 'forget', args: Record<string, unknown>, say: string): void {
  otty.world.reply(asked(match), { calls: [{ name, args }] }, { say })
}

async function newChat(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New chat' }).click()
  await expect(page.locator('.msg--otty')).toHaveCount(0)
}

async function openSettings(page: Page): Promise<void> {
  const heading = page.getByRole('heading', { name: 'What Otty knows about you' })
  // The panel reopens on the view it was closed in, where the header button reads "Back to chat".
  if (!(await heading.isVisible())) await page.getByRole('button', { name: 'Settings' }).click()
  await expect(heading).toBeVisible()
}

const memoryRows = (page: Page) => page.locator('li.memory')

test('a noted fact shows with Undo and Edit, is used in a new chat, and Undo takes it back for good', { tag: ['@step-67', '@gate'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Spanish for a trip'
  replyWithTool(otty, 'learning Spanish for a trip', 'remember', { text: 'Is learning Spanish', kind: 'goal', confidence: 0.9 }, '¡Qué bien! Have a great trip.')
  world.reply(asked('how do I say thank you?'), { say: '“Gracias.”' }, { say: '“Thank you.”' })
  const panel = await otty.openPanel()
  await askAndWait(otty, panel, 'I’m learning Spanish for a trip')
  const line = notedLines(panel)
  await expect(line).toHaveCount(1)
  await expect(line).toContainText('Noted: Is learning Spanish')
  await expect(line.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(line.getByRole('button', { name: 'Edit' })).toBeVisible()
  await expect(panel.locator('.confirm-card'), 'no card: the Noted line is the control').toHaveCount(0)

  await newChat(panel)
  await askAndWait(otty, panel, 'how do I say thank you?')
  expect(lastQuestion(otty)).toContain(MEMORY_NOTE)
  expect(lastQuestion(otty)).toContain('Is learning Spanish')

  await panel.getByRole('button', { name: 'Recent chats' }).click()
  // Every chat gets the same scripted title; Recent chats is newest first, so the first chat is the last row.
  await panel.getByRole('button', { name: /Spanish for a trip/ }).last().click()
  await notedLines(panel).getByRole('button', { name: 'Undo' }).click()
  await expect(notedLines(panel)).toContainText('Undone')
  await expect(notedLines(panel).getByRole('button', { name: 'Undo' })).toHaveCount(0)

  await newChat(panel)
  await askAndWait(otty, panel, 'how do I say thank you?')
  expect(lastQuestion(otty)).not.toContain('Is learning Spanish')

  await panel.getByRole('button', { name: 'Recent chats' }).click()
  // Every chat gets the same scripted title; Recent chats is newest first, so the first chat is the last row.
  await panel.getByRole('button', { name: /Spanish for a trip/ }).last().click()
  await expect(notedLines(panel)).toContainText('Noted: Is learning Spanish')
  await expect(notedLines(panel)).toContainText('Undone')
})

test('health in passing and passwords are never noted, and "remember" keeps the health detail', { tag: ['@step-68'] }, async ({ otty }) => {
  replyWithTool(otty, 'I have diabetes', 'remember', { text: 'Has diabetes', kind: 'about' }, 'Plenty of vegetables, beans and whole grains.')
  replyWithTool(otty, 'remember I’m diabetic', 'remember', { text: 'Is diabetic', kind: 'about' }, 'Got it.')
  replyWithTool(otty, 'wifi password', 'remember', { text: 'Wifi password is otter123', kind: 'about' }, 'Sorry, I don’t keep passwords — a password manager is the safe place for it.')
  const panel = await otty.openPanel()

  await askAndWait(otty, panel, 'I have diabetes, what can I eat?')
  await expect(notedLines(panel)).toHaveCount(0)
  expect(lastToolResult(otty)).toContain('Not saved')

  await askAndWait(otty, panel, 'remember I’m diabetic')
  await expect(notedLines(panel)).toHaveCount(1)
  await expect(lastAnswer(panel).locator('.memory-line')).toContainText('Noted: Is diabetic')

  await askAndWait(otty, panel, 'remember my wifi password is otter123')
  await expect(lastAnswer(panel).locator('.memory-line')).toHaveCount(0)
  expect(lastToolResult(otty)).toContain('never keeps passwords')
  await expect(lastAnswer(panel)).toContainText('I don’t keep passwords')

  await openSettings(panel)
  await expect(memoryRows(panel)).toHaveCount(1)
  await expect(memoryRows(panel)).toContainText('Is diabetic')
})

test('someone else’s email isn’t noted, and forget shows Forgotten with an Undo', { tag: ['@step-69'] }, async ({ otty, world }) => {
  const email = 'Hi team, I’m moving to Berlin next month and starting at a new bank. Best, Priya'
  await otty.mac({ selection: email, front: { name: 'Mail', bundleId: 'com.apple.mail', title: 'Inbox' } })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  await expect(quick.getByText('Hi team, I’m moving to Berlin')).toBeVisible()
  world.reply(asked('Summarize this'), { calls: [{ name: 'remember', args: { text: 'Is moving to Berlin next month', kind: 'about' } }] }, { say: 'Priya is moving to Berlin and changing jobs.' })
  await quick.locator('textarea').fill('Summarize this')
  await quick.locator('textarea').press('Enter')
  await expect(quick.getByText('Priya is moving to Berlin')).toBeVisible()
  expect(lastToolResult(otty)).toContain('Not saved')
  await expect(quick.locator('.memory-line')).toHaveCount(0)

  // A memory of their own, then they ask for it to go.
  const panel = await otty.openPanel()
  replyWithTool(otty, 'remember I’m learning Spanish', 'remember', { text: 'Is learning Spanish', kind: 'goal' }, 'Noted!')
  await askAndWait(otty, panel, 'remember I’m learning Spanish')
  await expect(lastAnswer(panel).locator('.memory-line')).toContainText('Noted: Is learning Spanish')
  const id = Number(/Saved as #(\d+)/.exec(lastToolResult(otty))?.[1])
  expect(id).toBeGreaterThan(0)

  replyWithTool(otty, 'forget that I’m learning Spanish', 'forget', { id }, 'Done, I’ve forgotten it.')
  await askAndWait(otty, panel, 'forget that I’m learning Spanish')
  const forgotten = lastAnswer(panel).locator('.memory-line')
  await expect(forgotten).toContainText('Forgotten: Is learning Spanish')
  await expect(forgotten.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(forgotten.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await openSettings(panel)
  await expect(memoryRows(panel)).toHaveCount(0)
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await forgotten.getByRole('button', { name: 'Undo' }).click()
  await expect(forgotten).toContainText('Undone')
  await openSettings(panel)
  await expect(memoryRows(panel)).toContainText('Is learning Spanish')
})

test('"don’t learn" on a chat stops noting, Otty is told so, and it stays off after reopening', { tag: ['@step-70'] }, async ({ otty, world }) => {
  world.backgroundReply = 'About my dog'
  world.reply(asked('Hello there'), { say: 'Hi!' })
  replyWithTool(otty, 'remember I have a dog', 'remember', { text: 'Has a dog', kind: 'about' }, 'Dogs are lovely.')
  const panel = await otty.openPanel()
  await askAndWait(otty, panel, 'Hello there')
  const brain = panel.getByRole('button', { name: 'Don’t learn from this chat' })
  await brain.click()
  const off = panel.getByRole('button', { name: /Otty isn’t learning from this chat/ })
  await expect(off).toHaveAttribute('aria-pressed', 'true')

  await askAndWait(otty, panel, 'remember I have a dog')
  await expect(notedLines(panel)).toHaveCount(0)
  expect(lastToolResult(otty)).toContain('Don’t say it was saved')

  await newChat(panel)
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.getByRole('button', { name: /About my dog/ }).click()
  await expect(panel.getByRole('button', { name: /Otty isn’t learning from this chat/ })).toHaveAttribute('aria-pressed', 'true')
  await openSettings(panel)
  await expect(memoryRows(panel)).toHaveCount(0)
})

test('the Settings list: edit, pause, add, refuse a password, open the source chat, forget all, and turn learning off', { tag: ['@step-71'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Tea at home'
  replyWithTool(otty, 'remember I like green tea', 'remember', { text: 'Likes green tea', kind: 'preference' }, 'Noted, green tea it is.')
  world.reply(asked('What should I drink?'), { say: 'Some tea?' }, { say: 'Maybe water.' })
  const panel = await otty.openPanel()
  await askAndWait(otty, panel, 'remember I like green tea')

  await openSettings(panel)
  const row = memoryRows(panel).filter({ hasText: 'Likes green tea' })
  await row.getByRole('button', { name: 'Edit' }).click()
  await panel.getByLabel('Edit what Otty knows').fill('Likes jasmine tea')
  await panel.getByLabel('Edit what Otty knows').press('Enter')
  await expect(memoryRows(panel).filter({ hasText: 'Likes jasmine tea' })).toBeVisible()
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await newChat(panel)
  await askAndWait(otty, panel, 'What should I drink?')
  expect(lastQuestion(otty)).toContain('Likes jasmine tea')
  expect(lastQuestion(otty)).not.toContain('green tea')

  await openSettings(panel)
  await memoryRows(panel).getByRole('button', { name: 'Pause: keep it, but don’t use it' }).click()
  await expect(memoryRows(panel).getByRole('button', { name: 'Use this again' })).toBeVisible()
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await askAndWait(otty, panel, 'What should I drink?')
  expect(lastQuestion(otty)).not.toContain('jasmine')

  await openSettings(panel)
  const add = panel.getByLabel('Add something Otty should know')
  await add.fill('I’m a nurse')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(memoryRows(panel).filter({ hasText: 'I’m a nurse' })).toBeVisible()
  await expect(memoryRows(panel).filter({ hasText: 'I’m a nurse' })).toContainText('Added by you')
  await add.fill('my password is x')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByText('Otty never keeps passwords, keys or codes.')).toBeVisible()
  await expect(memoryRows(panel)).toHaveCount(2)

  // From a chat on… opens the chat it came from.
  await memoryRows(panel).filter({ hasText: 'jasmine' }).getByRole('button', { name: /From a chat on/ }).click()
  await expect(panel.getByText('remember I like green tea')).toBeVisible()

  await openSettings(panel)
  await panel.getByRole('button', { name: 'Forget everything Otty knows' }).click()
  await expect(memoryRows(panel)).toHaveCount(2)
  await panel.getByRole('button', { name: 'Yes, forget all of it' }).click()
  await expect(memoryRows(panel)).toHaveCount(0)
  await expect(panel.getByText('Nothing yet.')).toBeVisible()

  // Learning off: the tools aren't offered, nothing is sent, and no Noted lines.
  await panel.getByRole('checkbox', { name: /Let Otty learn about me/ }).uncheck()
  await panel.getByRole('button', { name: 'Save' }).click()
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  world.reply(asked('remember I like coffee'), { say: 'Coffee is nice.' })
  await newChat(panel)
  await askAndWait(otty, panel, 'remember I like coffee')
  expect(offersRemember(chats(otty).at(-1))).toBe(false)
  expect(lastQuestion(otty)).not.toContain(MEMORY_NOTE)
  await expect(notedLines(panel)).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Don’t learn from this chat' })).toHaveCount(0)
})

const EXCEL = { name: 'Microsoft Excel', bundleId: 'com.microsoft.Excel', title: 'Budget' }

/** Whether the quick view is on screen. */
const quickShown = (otty: Otty) =>
  otty.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('view=quick') && w.isVisible()))

/** One question from Excel through the quick view. A typed sum is answered on the Mac, so no model is needed. */
async function sumFromExcel(otty: Otty): Promise<Page> {
  await otty.mac({ selection: null, front: EXCEL })
  await otty.press('Alt+Space')
  await expect.poll(() => quickShown(otty)).toBe(true)
  const quick = await otty.view('quick')
  const box = quick.getByPlaceholder('Ask Otty anything…')
  await expect(box).toBeVisible()
  await expect(quick.locator('.app-tag').filter({ hasText: 'Microsoft Excel' })).toBeVisible()
  await box.fill('12 * 3')
  await box.press('Enter')
  await expect(quick.locator('.calc-card__result')).toHaveText('= 36')
  return quick
}

async function closeQuick(otty: Otty, quick: Page): Promise<void> {
  await quick.keyboard.press('Escape')
  await expect.poll(() => quickShown(otty)).toBe(false)
}

test('days of use mostly in one app become a habit, and a deleted habit doesn’t come back', { tag: ['@step-72'] }, async ({ otty }) => {
  const DAY = 86_400_000
  let quick: Page | null = null
  for (let day = 0; day < 3; day++) {
    if (day) await otty.control((c, ms) => c.shiftClock(ms), DAY)
    for (let i = 0; i < 4; i++) {
      quick = await sumFromExcel(otty)
      if (await quick.locator('.memory-line').count()) break
      await closeQuick(otty, quick)
    }
    if (quick && (await quick.locator('.memory-line').count())) break
  }
  await expect(quick!.locator('.memory-line')).toContainText('Noted: Mostly works in Microsoft Excel')
  await closeQuick(otty, quick!)

  const panel = await otty.openPanel()
  await openSettings(panel)
  const habit = memoryRows(panel).filter({ hasText: 'Mostly works in Microsoft Excel' })
  await expect(habit).toContainText('Noticed from how you use Otty')
  await habit.getByRole('button', { name: 'Delete' }).click()
  await expect(memoryRows(panel)).toHaveCount(0)
  await panel.getByRole('button', { name: 'Close (Esc)' }).click()

  await otty.control((c, ms) => c.shiftClock(ms), 2 * DAY)
  for (let i = 0; i < 3; i++) {
    quick = await sumFromExcel(otty)
    await expect(quick.locator('.memory-line')).toHaveCount(0)
    await closeQuick(otty, quick)
  }
  const again = await otty.openPanel()
  await openSettings(again)
  await expect(memoryRows(again)).toHaveCount(0)
  expect(otty.world.requests, 'habits are counted on the Mac').toEqual([])
})

test('a memory that matched shows a Used line, kept on reopen, that opens the list; learning off hides it', { tag: ['@step-92'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Thank you in Spanish'
  world.reply(asked('thank you in Spanish'), { say: '“Gracias.”' }, { say: '“Gracias.”' })
  world.reply(asked('capital of France'), { say: 'Paris.' })
  const panel = await otty.openPanel()
  await openSettings(panel)
  await panel.getByLabel('Add something Otty should know').fill('Is learning Spanish')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(memoryRows(panel)).toHaveCount(1)
  await panel.getByRole('button', { name: 'Back to chat' }).click()

  await askAndWait(otty, panel, 'how do I say thank you in Spanish?')
  await expect(lastAnswer(panel).getByRole('button', { name: 'Used: Is learning Spanish' })).toBeVisible()
  await askAndWait(otty, panel, 'what’s the capital of France?')
  await expect(lastAnswer(panel).locator('.used-line')).toHaveCount(0)
  // Being sent isn't being used: the memory went with the question, but didn't match it.
  expect(lastQuestion(otty)).toContain('Is learning Spanish')

  await newChat(panel)
  await panel.getByRole('button', { name: 'Recent chats' }).click()
  await panel.getByRole('button', { name: /Thank you in Spanish/ }).click()
  const used = panel.locator('.msg--otty').first().getByRole('button', { name: 'Used: Is learning Spanish' })
  await expect(used).toBeVisible()
  await used.click()
  await expect(panel.getByRole('heading', { name: 'What Otty knows about you' })).toBeVisible()
  await expect(memoryRows(panel)).toContainText('Is learning Spanish')

  await panel.getByRole('checkbox', { name: /Let Otty learn about me/ }).uncheck()
  await panel.getByRole('button', { name: 'Save' }).click()
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  await newChat(panel)
  await askAndWait(otty, panel, 'how do I say thank you in Spanish?')
  await expect(lastAnswer(panel).locator('.used-line')).toHaveCount(0)
  expect(lastQuestion(otty)).not.toContain('Is learning Spanish')
})
