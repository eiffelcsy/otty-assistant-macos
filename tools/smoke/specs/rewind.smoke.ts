// Try again and Edit question (D-36): only the latest turn, what it can take back is listed first, and Try again
// resends the stored question.
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import { textOf, type ModelBody } from '../world/server'
import { expect, test, type Otty } from '../fixtures'
import { openLogbook } from '../logbook'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()

/** The copy-and-look question, its card answered yes, with the look paused on a page it must ask about. */
async function copyAndLook(otty: Otty, panel: Page, title: string): Promise<void> {
  await otty.ask(panel, 'copy hello and look into laptops')
  await panel.getByRole('button', { name: 'Start it' }).click()
  await expect(lastAnswer(panel).getByText(`Copied, and I’m looking into ${title}.`)).toBeVisible()
  await expect(lastAnswer(panel).getByRole('button', { name: 'Try again' })).toBeVisible()
}

/** The looks the Logbook lists as still to do or waiting: its Needs you and Coming up, and what's running. */
async function activityTitles(panel: Page): Promise<string> {
  await openLogbook(panel, 'Needs you')
  const text = await panel.locator('.logbook__main').innerText()
  await panel.getByRole('button', { name: 'Back to chat' }).click()
  return text
}

test('Try again lists what it can undo; unticked the look carries on, ticked it goes', { tag: ['@step-125', '@gate'] }, async ({ otty, world }) => {
  const look = (title: string) => ({
    calls: [
      { name: 'copy_to_clipboard', args: { text: 'hello' } },
      { name: 'start_job', args: { title, brief: `Find the best ${title.toLowerCase()} of 2026 across several review sites.` } }
    ]
  })
  world.reply(
    streamed('copy hello and look into laptops'),
    look('Budget laptops'),
    { say: 'Copied, and I’m looking into Budget laptops.' },
    { say: 'Here is a fresh answer.' },
    look('Gaming laptops'),
    { say: 'Copied, and I’m looking into Gaming laptops.' },
    { say: 'Here is another fresh answer.' }
  )
  // Each look stops at a page nobody has given it, so it waits in the Logbook until someone answers.
  world.reply(streamed('best budget laptops of 2026'), { calls: [{ name: 'read_page', args: { url: 'https://laptops.example/budget' } }] })
  world.reply(streamed('best gaming laptops of 2026'), { calls: [{ name: 'read_page', args: { url: 'https://laptops.example/gaming' } }] })
  world.backgroundReply = 'Laptops'
  const panel = await otty.openPanel()

  await copyAndLook(otty, panel, 'Budget laptops')
  await expect.poll(() => activityTitles(panel)).toContain('Budget laptops')

  // Try again: the card lists the look, ticked, and the copy under what can't be undone.
  await lastAnswer(panel).getByRole('button', { name: 'Try again' }).click()
  const card = panel.locator('.rewind-card')
  const stop = card.getByRole('checkbox', { name: 'Stop looking into “Budget laptops”' })
  await expect(stop).toBeChecked()
  await expect(card.getByText('Can’t be undone')).toBeVisible()
  await expect(card.locator('.rewind-card__item--lasting')).toContainText('Copied.')

  // Unticked: a new answer, and the look carries on.
  await stop.uncheck()
  await card.getByRole('button', { name: 'Try again' }).click()
  await expect(lastAnswer(panel).getByText('Here is a fresh answer.')).toBeVisible()
  await expect(panel.getByText('Copied, and I’m looking into Budget laptops.')).toHaveCount(0)
  // The resent question is the stored one, byte for byte.
  const asked = world.modelRequests().filter((b) => b.stream && textOf(b.messages?.at(-1)?.content).includes('copy hello and look into laptops'))
  expect(textOf(asked.at(-1)!.messages!.at(-1)!.content)).toBe(textOf(asked[0].messages!.at(-1)!.content))
  expect(await activityTitles(panel)).toContain('Budget laptops')

  // Again, ticked: the look stops.
  await panel.getByRole('button', { name: 'New chat' }).click()
  await copyAndLook(otty, panel, 'Gaming laptops')
  await expect.poll(() => activityTitles(panel)).toContain('Gaming laptops')
  await lastAnswer(panel).getByRole('button', { name: 'Try again' }).click()
  await expect(card.getByRole('checkbox', { name: 'Stop looking into “Gaming laptops”' })).toBeChecked()
  await card.getByRole('button', { name: 'Try again' }).click()
  await expect(lastAnswer(panel).getByText('Here is another fresh answer.')).toBeVisible()
  // Withdrawing drops a look that hadn't started, and stops one under way, keeping its row so its work isn't lost.
  await expect
    .poll(async () => {
      const text = await activityTitles(panel)
      return !text.includes('Gaming laptops') || /Gaming laptops[\s\S]{0,40}You stopped this/.test(text)
    })
    .toBe(true)
  expect(await activityTitles(panel)).toContain('Budget laptops')
})

test('Edit question puts the question and its highlight back; the quick view only offers Try again', { tag: ['@step-126', '@step-127'] }, async ({ otty, world }) => {
  world.reply(streamed('what does this mean'), { say: 'It means otters link paws while they sleep.' }, { say: 'Sea otters hold hands so they don’t drift apart.' })
  world.backgroundReply = 'Otters holding hands'
  await otty.mac({ selection: 'Otters hold hands.', front: { name: 'Safari', bundleId: 'com.apple.Safari' } })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  await expect(quick.getByText('Highlighted')).toBeVisible()
  await otty.ask(quick, 'what does this mean?')
  await expect(lastAnswer(quick).getByText('It means otters link paws')).toBeVisible()
  // Step 127: the quick view has Try again only.
  await expect(lastAnswer(quick).getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(quick.getByRole('button', { name: 'Edit question' })).toHaveCount(0)

  await quick.getByRole('button', { name: /continue in chat/ }).click()
  const panel = await otty.view('panel')
  await lastAnswer(panel).getByRole('button', { name: 'Edit question' }).click()
  // Nothing to undo, so no card: the turn goes and the question comes back with its highlight.
  await expect(panel.getByText('It means otters link paws')).toHaveCount(0)
  await expect(panel.getByPlaceholder(/Ask/)).toHaveValue('what does this mean?')
  await expect(panel.locator('footer, [role=contentinfo]').getByText('Otters hold hands.')).toBeVisible()
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(lastAnswer(panel).getByText('Sea otters hold hands so they')).toBeVisible()
  // The highlight went with it.
  expect(JSON.stringify(world.modelRequests().at(-1)!.messages?.at(-1))).toContain('Otters hold hands.')
})

test('Edit question with a file asks to attach it again', { tag: ['@step-126'] }, async ({ otty, world }) => {
  world.reply(streamed('summarize my notes'), { say: 'Your notes are about otters.' })
  world.backgroundReply = 'Notes'
  const panel = await otty.openPanel()
  const path = join(otty.home, 'notes.txt')
  writeFileSync(path, 'Otters eat urchins. Otters sleep in kelp.')
  await otty.control((c, p) => c.nextOpen(p), [path])
  await panel.getByRole('button', { name: 'Attach files' }).click()
  await expect(panel.getByRole('button', { name: /^Summarize/ })).toBeVisible()
  await otty.ask(panel, 'summarize my notes')
  await expect(lastAnswer(panel).getByText('Your notes are about otters.')).toBeVisible()
  await lastAnswer(panel).getByRole('button', { name: 'Edit question' }).click()
  await expect(panel.getByText('Attach your files again')).toBeVisible()
  await expect(panel.getByPlaceholder(/Ask/)).toHaveValue('summarize my notes')
})

test('Edit question after a remembered fact offers to forget it', { tag: ['@step-126'] }, async ({ otty, world }) => {
  world.reply(
    streamed('learning Spanish'),
    { calls: [{ name: 'remember', args: { text: 'Is learning Spanish' } }] },
    { say: 'In Spanish, hello is “hola”.' },
    { say: '“Buenos días” means good morning.' }
  )
  world.backgroundReply = 'Spanish'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'I’m learning Spanish. How do I say hello?')
  await expect(lastAnswer(panel).getByText('Noted: Is learning Spanish')).toBeVisible()
  await lastAnswer(panel).getByRole('button', { name: 'Edit question' }).click()
  const card = panel.locator('.rewind-card')
  await expect(card.getByRole('checkbox', { name: 'Forget “Is learning Spanish”' })).toBeChecked()
  await card.getByRole('button', { name: 'Edit question' }).click()
  await expect(panel.getByPlaceholder(/Ask/)).toHaveValue('I’m learning Spanish. How do I say hello?')
  await panel.getByPlaceholder(/Ask/).fill('I’m learning Spanish. How do I say good morning?')
  await panel.getByRole('button', { name: 'Send' }).click()
  await expect(lastAnswer(panel).getByText('Buenos días')).toBeVisible()
  // Forgotten: the new question's note no longer carries it.
  expect(JSON.stringify(world.modelRequests().at(-1)!.messages?.at(-1))).not.toContain('What you know about the user')
})

test('reopened from Recent chats, only the latest answer can be tried again or edited', { tag: ['@step-127'] }, async ({ otty, world }) => {
  world.reply(streamed('first question'), { say: 'First answer.' })
  world.reply(streamed('second question'), { say: 'Second answer.' })
  world.backgroundReply = 'Two questions'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'first question')
  await expect(panel.getByText('First answer.')).toBeVisible()
  await otty.ask(panel, 'second question')
  await expect(panel.getByText('Second answer.')).toBeVisible()

  await otty.relaunch()
  const again = await otty.openPanel()
  await again.getByRole('button', { name: 'Recent chats' }).click()
  await again.getByRole('button', { name: /Two questions/ }).click()
  await expect(again.getByText('First answer.')).toBeVisible()
  await expect(again.getByRole('button', { name: 'Try again' })).toHaveCount(1)
  await expect(again.getByRole('button', { name: 'Edit question' })).toHaveCount(1)
  await expect(lastAnswer(again).getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(again.locator('.msg--otty').first().getByText('First answer.')).toBeVisible()
})

test('Shorter asks the same question again with one line after it, and the new answer replaces the old', { tag: ['@step-148'] }, async ({ otty, world }) => {
  world.reply(streamed('What is a fjord?'), { say: 'A fjord is a long, deep, narrow inlet of the sea between high cliffs, carved by a glacier.' }, { say: 'A sea inlet carved by ice.' })
  const panel = await otty.openPanel()
  await otty.ask(panel, 'What is a fjord?')
  await expect(panel.getByText('carved by a glacier.')).toBeVisible()
  const first = world.modelRequests().filter((b) => b.stream).at(-1)!

  await lastAnswer(panel).getByRole('button', { name: 'Shorter' }).click()
  await expect(panel.getByText('A sea inlet carved by ice.')).toBeVisible()
  await expect(panel.getByText('carved by a glacier.')).toHaveCount(0)
  const again = world.modelRequests().filter((b) => b.stream).at(-1)!
  const question = first.messages!.at(-1)!
  expect(again.messages!.slice(0, -1)).toEqual(first.messages!.slice(0, -1))
  expect(again.messages!.at(-1)).toEqual({ ...question, content: `${String(question.content)}\n\nAnswer this again, shorter than last time.` })
})
