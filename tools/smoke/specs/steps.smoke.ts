// Step cards (D-28 and on): the model proposes steps, the user presses the buttons, and the fake Mac records what
// Otty's hands did. Anything the model wrote must reach osascript through argv, never inside a script's text.
import type { Page } from '@playwright/test'
import type { SmokeCall } from '../app/types'
import type { ModelBody } from '../world/server'
import { expect, pbcopy, pbpaste, test, type Otty } from '../fixtures'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

type StepArg = { text: string; action?: Record<string, unknown> }
const showSteps = (title: string, steps: StepArg[], replaces?: boolean) => ({ calls: [{ name: 'show_steps', args: { title, steps, ...(replaces ? { replaces } : {}) } }] })

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()

async function scripts(otty: Otty): Promise<SmokeCall[]> {
  return (await otty.snapshot()).calls.filter((c) => c.kind === 'osascript')
}

/** The text of a script's -e lines, and what came after `--` (its argv). */
function parts(call: SmokeCall): { text: string; argv: string[] } {
  const d = call.detail
  const end = d.indexOf('--')
  return { text: d.filter((_a, i) => d[i - 1] === '-e').join('\n'), argv: end >= 0 ? d.slice(end + 1) : [] }
}

/** The safety rule: no word the model wrote is ever inside a script's text. */
async function expectOnlyInArgv(otty: Otty, words: string[]): Promise<void> {
  for (const call of await scripts(otty)) {
    const { text } = parts(call)
    for (const w of words) expect(text, `model text inside an osascript -e line: ${w}`).not.toContain(w)
  }
}


/** Highlight something in an app and press ⌥Space, so the question knows which app the steps are for. */
async function askFrom(otty: Otty, app: { name: string; bundleId: string }, selection: string, question: string): Promise<Page> {
  await otty.mac({ selection, front: app })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  // The highlight lands first, then the box is ready for a question.
  await expect(quick.getByText('Highlighted')).toBeVisible()
  await otty.ask(quick, question)
  return quick
}

const EXCEL = { name: 'Microsoft Excel', bundleId: 'com.microsoft.Excel' }
const PAGES = { name: 'Pages', bundleId: 'com.apple.iWork.Pages' }

test('a paste step replaces in Excel through the clipboard, gives the clipboard back and never presses Return', { tag: ['@step-77', '@step-81', '@step-79'] }, async ({ otty, world }) => {
  const command = 'echo "otters" > ~/otters.txt'
  world.reply(
    streamed('add up column B'),
    showSteps('Add up column B', [
      { text: 'Click the cell under your numbers' },
      { text: 'Put in the sum', action: { kind: 'paste', text: '=SUM(B:B)', mode: 'replace' } },
      { text: 'Paste the command', action: { kind: 'paste', text: command, mode: 'insert' } }
    ]),
    { say: 'Press the button when the cell is selected.' }
  )
  world.reply(streamed('what about column C'), { say: 'Same again, with C: =SUM(C:C).' })
  world.backgroundReply = 'Adding up column B'
  const quick = await askFrom(otty, EXCEL, '12\n30\n7', 'add up column B')

  // A step card, not a numbered list in the answer.
  const card = lastAnswer(quick).locator('.step-card')
  await expect(card.getByText('Add up column B')).toBeVisible()
  await expect(lastAnswer(quick).locator('.md ol')).toHaveCount(0)

  pbcopy('what the user had copied')
  await card.getByRole('button', { name: 'Replace in Microsoft Excel' }).click()
  await expect(card.getByRole('checkbox', { name: 'Step 2: done' })).toBeVisible()
  await expect.poll(pbpaste).toBe('what the user had copied')

  const calls = (await scripts(otty)).map(parts)
  // Activate Excel by its bundle id (argv), check for a password field, then ⌘V.
  expect(calls[0]).toEqual({ text: expect.stringContaining('tell application id (item 1 of argv) to activate'), argv: [EXCEL.bundleId] })
  expect(calls[1]).toEqual({ text: expect.stringContaining('AXSubrole'), argv: [EXCEL.name] })
  expect(calls[2].text).toContain('keystroke "v" using {command down}')

  // A Terminal-style command is pasted, never run: no Return anywhere.
  await card.getByRole('button', { name: 'Paste into Microsoft Excel' }).click()
  await expect(card.getByRole('checkbox', { name: 'Step 3: done' })).toBeVisible()
  const all = (await scripts(otty)).map(parts)
  expect(all.at(-1)!.text).toContain('key code 124') // insert collapses the selection first
  for (const c of all) expect(c.text).not.toMatch(/key code (36|76)|keystroke return|keystroke "\\r"/)
  await expectOnlyInArgv(otty, ['=SUM(B:B)', command, 'otters'])

  // Step 81: the quick view stayed open through the steps; a follow-up stays in the same chat.
  await expect(quick.locator('.step-card')).toBeVisible()
  await quick.getByRole('textbox', { name: 'Ask a follow-up' }).fill('what about column C')
  await quick.getByRole('textbox', { name: 'Ask a follow-up' }).press('Enter')
  await expect(lastAnswer(quick).getByText('Same again, with C')).toBeVisible()
  const followUp = world.modelRequests().at(-1)!
  expect(JSON.stringify(followUp.messages)).toContain('add up column B')

  // ↵ on the empty box still goes to the full chat, with the card and its ticks.
  await quick.getByRole('textbox', { name: 'Ask a follow-up' }).press('Enter')
  const panel = await otty.view('panel')
  await expect(panel.locator('.step-card').getByRole('checkbox', { name: 'Step 2: done' })).toBeVisible()

  // Step 79: tick step 1 by hand; it's still ticked after a relaunch.
  await panel.locator('.step-card').getByRole('checkbox', { name: 'Step 1: not done' }).click()
  await expect(panel.locator('.step-card').getByText('3 of 3')).toBeVisible()
  await otty.relaunch()
  const again = await otty.openPanel()
  await again.getByRole('button', { name: 'Recent chats' }).click()
  await again.getByRole('button', { name: /Adding up column B/ }).click()
  await expect(again.locator('.step-card').getByRole('checkbox', { name: 'Step 1: done' })).toBeVisible()
  await expect(again.locator('.step-card').getByText('3 of 3')).toBeVisible()
})

test('Open lands on Screen Recording, a menu step clicks through argv, and a missing menu becomes a step by hand', { tag: ['@step-78'] }, async ({ otty, world }) => {
  const pane = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
  world.reply(streamed('let Otty read my screen'), showSteps('Let Otty see your screen', [{ text: 'Open Screen Recording', action: { kind: 'open', target: pane } }, { text: 'Turn on Otty' }]), { say: 'Then come back here.' })
  world.backgroundReply = 'Screen Recording'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'How do I let Otty read my screen?')
  const settingsCard = lastAnswer(panel).locator('.step-card')
  await settingsCard.getByRole('button', { name: 'Open' }).click()
  await expect(settingsCard.getByRole('checkbox', { name: 'Step 1: done' })).toBeVisible()
  expect((await otty.snapshot()).calls.filter((c) => c.kind === 'open-external').map((c) => c.detail)).toEqual([[pane]])
  await panel.keyboard.down('Escape')

  world.reply(
    streamed('export a PDF'),
    showSteps('Export a PDF', [
      { text: 'Choose File › Export To › PDF…', action: { kind: 'menu', path: ['File', 'Export To', 'PDF…'] } },
      { text: 'Choose File › Print to Otter', action: { kind: 'menu', path: ['File', 'Print to Otter'] } }
    ]),
    { say: 'Then pick where to save it.' }
  )
  world.reply(streamed('which one now'), { say: 'Use File › Export To instead.' })
  const quick = await askFrom(otty, PAGES, 'My essay', 'how do I export a PDF?')
  const card = lastAnswer(quick).locator('.step-card')
  await card.getByRole('button', { name: 'Click File › Export To › PDF…' }).click()
  await expect(card.getByRole('checkbox', { name: 'Step 1: done' })).toBeVisible()
  const menu = (await scripts(otty)).map(parts).at(-1)!
  expect(menu.argv).toEqual(['Pages', 'File', 'Export To', 'PDF…'])
  expect(menu.text).toContain('click menu item (item -1 of argv) of current')

  // A menu that doesn't exist: both spellings fail, and the step is left to the user.
  await otty.mac({ script: { stdout: '', fail: 'Can’t get menu bar item' } })
  await card.getByRole('button', { name: 'Click File › Print to Otter' }).click()
  await expect(card.getByText('Otty couldn’t find that menu.')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Click File › Print to Otter' })).toHaveCount(0)
  await expectOnlyInArgv(otty, ['Export To', 'PDF…', 'Print to Otter'])

  // The next answer knows.
  await otty.mac({ script: { stdout: '' } })
  await quick.getByRole('textbox', { name: 'Ask a follow-up' }).fill('which one now')
  await quick.getByRole('textbox', { name: 'Ask a follow-up' }).press('Enter')
  await expect(lastAnswer(quick).getByText('Use File › Export To instead.')).toBeVisible()
  expect(JSON.stringify(world.modelRequests().at(-1)!.messages?.at(-1))).toContain('didn\'t work: Otty couldn’t find that menu.')
})

test('a step that deletes asks Sure? first, and a password field is never pasted into', { tag: ['@step-79'] }, async ({ otty, world }) => {
  world.reply(
    streamed('clear out old files'),
    showSteps('Clear out old files', [
      { text: 'Empty the Trash', action: { kind: 'menu', path: ['Finder', 'Empty Trash…'] } },
      { text: 'Paste your password', action: { kind: 'paste', text: 'hunter-two-otter', mode: 'replace' } }
    ]),
    { say: 'Careful: this can’t be undone.' }
  )
  world.backgroundReply = 'Old files'
  const quick = await askFrom(otty, { name: 'Finder', bundleId: 'com.apple.finder' }, 'Old files', 'clear out old files')
  const card = lastAnswer(quick).locator('.step-card')
  const risky = card.getByRole('button', { name: 'Click Finder › Empty Trash…' })
  await expect(risky).toHaveClass(/btn--warn/)
  await risky.click()
  await expect(card.getByRole('button', { name: 'Sure?' })).toBeVisible()
  expect(await scripts(otty)).toEqual([]) // nothing ran yet
  await card.getByRole('button', { name: 'No' }).click()
  await expect(card.getByRole('button', { name: 'Sure?' })).toHaveCount(0)
  expect(await scripts(otty)).toEqual([])
  await risky.click()
  await card.getByRole('button', { name: 'Sure?' }).click()
  await expect(card.getByRole('checkbox', { name: 'Step 1: done' })).toBeVisible()
  expect((await scripts(otty)).map(parts).at(-1)!.argv).toEqual(['Finder', 'Finder', 'Empty Trash…'])

  // The focused field hides what's typed: Otty says so and doesn't press ⌘V.
  await otty.mac({ script: { stdout: 'AXSecureTextField\n' } })
  pbcopy('kept')
  await card.getByRole('button', { name: 'Replace in Finder' }).click()
  await expect(card.getByText('That’s a password field, so Otty won’t paste there. Copy it instead.')).toBeVisible()
  await expect(card.getByRole('checkbox', { name: 'Step 2: not done' })).toBeVisible()
  for (const c of (await scripts(otty)).map(parts)) expect(c.text).not.toContain('keystroke "v"')
  expect(pbpaste()).toBe('kept')
  await expectOnlyInArgv(otty, ['hunter-two-otter', 'Empty Trash'])
})

test.describe('with Tell Otty which app I’m using off', () => {
  test.use({ seed: { onboarded: true, baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', homeLanguage: null, shareAppContext: false, apiKeys: { deepseek: { enc: Buffer.from('sk-smoke-0000000000000000').toString('base64'), plain: true } } } })

  test('paste buttons just copy, and menu and shortcut steps have no button', { tag: ['@step-79'] }, async ({ otty, world }) => {
    world.reply(
      streamed('make a total'),
      showSteps('Make a total', [
        { text: 'Put in the sum', action: { kind: 'paste', text: '=SUM(A:A)', mode: 'replace' } },
        { text: 'Choose Format › Cells', action: { kind: 'menu', path: ['Format', 'Cells…'] } },
        { text: 'Save it', action: { kind: 'keys', combo: '⌘S' } }
      ]),
      { say: 'That’s it.' }
    )
    world.backgroundReply = 'A total'
    const quick = await askFrom(otty, EXCEL, '1\n2', 'make a total')
    const card = lastAnswer(quick).locator('.step-card')
    await expect(card.getByText('Make a total')).toBeVisible()
    await expect(card.getByRole('button', { name: /^Click / })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Press for me' })).toHaveCount(0)
    await card.getByRole('button', { name: 'Copy', exact: true }).click()
    await expect(card.getByRole('checkbox', { name: 'Step 1: done' })).toBeVisible()
    await expect.poll(pbpaste).toBe('=SUM(A:A)')
    expect(await scripts(otty)).toEqual([])
  })
})

/** A small picture, drawn in the page, for the whole-screen look. */
function screenPicture(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 40
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 64, 40)
    g.fillStyle = '#000'
    g.fillText('Export', 8, 24)
    return c.toDataURL('image/png')
  })
}

test('I’m stuck looks at the screen and puts the card right in place; Done ticks, and Done, check it asks', { tag: ['@step-80', '@step-90'] }, async ({ otty, world }) => {
  world.reply(streamed('turn on dark mode'), showSteps('Turn on dark mode', [{ text: 'Open Display settings' }, { text: 'Pick Dark' }, { text: 'Close the window' }]), { say: 'Done in a moment.' })
  world.reply(streamed('and I’m stuck'), showSteps('Turn on dark mode', [{ text: 'Open Appearance settings instead' }, { text: 'Pick Dark' }, { text: 'Close the window' }], true), { say: 'It moved to Appearance.' })
  world.reply(streamed('Can you check it worked'), { say: 'Yes, dark mode is on. You’re all done.' })
  world.backgroundReply = 'Dark mode'
  const panel = await otty.openPanel()
  await otty.mac({ screenImage: await screenPicture(panel) })
  await otty.ask(panel, 'How do I turn on dark mode?')

  const card = panel.locator('.step-card')
  await expect(card.getByText('Open Display settings')).toBeVisible()
  await card.getByRole('button', { name: 'I’m stuck' }).click()
  await expect(card.getByText('Open Appearance settings instead')).toBeVisible()
  // Updated in place: still one card, under the first answer.
  await expect(card).toHaveCount(1)
  await expect(panel.locator('.msg--otty').first().locator('.step-card')).toHaveCount(1)
  // The question carried what was on screen.
  const stuck = world.modelRequests().find((b) => JSON.stringify(b.messages?.at(-1)).includes('and I’m stuck'))!
  expect(JSON.stringify(stuck.messages?.at(-1))).toMatch(/image_url|data:image\/png/)

  // Done ticks step 1 and makes step 2 current.
  await card.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(card.getByRole('checkbox', { name: 'Step 1: done' })).toBeVisible()
  await expect(card.locator('.step--current')).toContainText('Pick Dark')

  // Done, check it ticks it too, and asks Otty to look.
  await card.getByRole('button', { name: 'Done, check it' }).click()
  await expect(card.getByRole('checkbox', { name: 'Step 2: done' })).toBeVisible()
  await expect(lastAnswer(panel).getByText('Yes, dark mode is on.')).toBeVisible()
  const check = JSON.stringify(world.modelRequests().at(-1)!.messages?.at(-1))
  expect(check).toContain('I’ve done step 2')
  expect(check).toMatch(/image_url|data:image\/png/)
})
