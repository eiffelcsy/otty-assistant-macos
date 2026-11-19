// The proofread card: the model sends a ```fixed block, and the marks come from shared/diff.ts comparing it with the
// highlighted text, never from the model.
import type { Page } from '@playwright/test'
import type { ModelBody } from '../world/server'
import { expect, ONBOARDED, pbpaste, test, type Otty } from '../fixtures'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

const DRAFT = 'Hi Sam, I has went to the shop yesterday and buyed some apples for the picnic.'
const FIXED = 'Hi Sam, I went to the shop yesterday and bought some apples for the picnic.'
const fixedReply = (reasons: string) => `\`\`\`fixed\n${FIXED}\n\`\`\`\n\n${reasons}`

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()

async function checkWriting(otty: Otty, text: string): Promise<Page> {
  await otty.mac({ selection: text, front: { name: 'Mail', bundleId: 'com.apple.mail' } })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  await expect(quick.getByText('Highlighted')).toBeVisible()
  await quick.getByRole('button', { name: 'check writing' }).click()
  return quick
}

test.describe('with a home language', () => {
  test.use({ seed: { ...ONBOARDED, homeLanguage: 'zh-HK' } })

  test('check writing marks each fix, copies clean text, keeps the block in 中文 and after a relaunch', { tag: ['@step-65'] }, async ({ otty, world }) => {
    world.reply(
      streamed('Check my writing. Reply in this shape'),
      { say: fixedReply('- **has went → went**: after “I”, the past tense is just “went”.\n- **buyed → bought**: “buy” has its own past tense.') },
      { say: 'It reads well. Nothing needs fixing.' }
    )
    world.reply(streamed('Please give your previous answer again'), { say: fixedReply('- **has went → went**：「I」之後，過去式只需用「went」。\n- **buyed → bought**：「buy」的過去式是「bought」。') })
    world.backgroundReply = 'Note to Sam'
    const quick = await checkWriting(otty, DRAFT)

    const card = lastAnswer(quick).locator('.fixed-card')
    await expect(card.locator('del').first()).toBeVisible()
    await expect(card.locator('del')).toContainText(['has'])
    await expect(card.locator('ins')).toContainText(['bought'])
    await expect(card).toContainText('picnic')
    // A reason for each fix.
    await expect(lastAnswer(quick).locator('li')).toHaveCount(2)

    // Copy fixed text: the corrected words, with no marks.
    await card.getByRole('button', { name: 'Copy fixed text' }).click()
    await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible()
    await expect.poll(pbpaste).toBe(FIXED)

    // In 中文: the reasons change, the fixed text doesn't.
    await lastAnswer(quick).getByRole('button', { name: 'In 中文' }).click()
    const panel = await otty.view('panel')
    await expect(lastAnswer(panel).getByText('過去式只需用')).toBeVisible()
    const again = lastAnswer(panel).locator('.fixed-card')
    await expect(again.locator('.fixed-card__text')).toHaveText(FIXED)

    // Dark mode keeps the marks (how legible they look stays by hand).
    await panel.emulateMedia({ colorScheme: 'dark' })
    await expect(panel.locator('.fixed-card').first().locator('ins').first()).toBeVisible()
    await panel.emulateMedia({ colorScheme: 'light' })

    // Reopened after a relaunch: the same card, still marked against what was highlighted.
    await otty.relaunch()
    const reopened = await otty.openPanel()
    await otty.go(reopened, 'Chats')
    await reopened.getByRole('button', { name: /Note to Sam/ }).click()
    const first = reopened.locator('.fixed-card').first()
    await expect(first.locator('del')).toContainText(['has'])
    await expect(first.locator('ins')).toContainText(['bought'])

    // A paragraph with nothing to fix just reads well: no card.
    await reopened.keyboard.down('Escape')
    const fine = await checkWriting(otty, 'Hi Sam, I went to the shop yesterday and bought some apples for the picnic.')
    await expect(lastAnswer(fine).getByText('It reads well.')).toBeVisible()
    await expect(lastAnswer(fine).locator('.fixed-card')).toHaveCount(0)
  })
})
