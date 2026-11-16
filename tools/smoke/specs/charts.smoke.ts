// Charts of the user's own tables (D-35): the model only names columns; main adds up the rows and writes the chart.
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import { textOf, type ModelBody } from '../world/server'
import { expect, test, type Otty } from '../fixtures'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

const SALES = ['Date,Region,Sales', '2026-01-04,North,100', '2026-01-19,South,50', '2026-02-02,North,70', '2026-02-20,South,30', '2026-03-09,North,200'].join('\n')

const lastAnswer = (page: Page) => page.locator('.msg--otty').last()

/** What a tool call handed back to the model, in the latest request that has it. */
function toolResult(bodies: ModelBody[]): string {
  const tool = bodies.flatMap((b) => b.messages ?? []).filter((m) => m.role === 'tool').at(-1)
  return textOf(tool?.content)
}

async function attach(otty: Otty, panel: Page, name: string, text: string): Promise<void> {
  const path = join(otty.home, name)
  writeFileSync(path, text)
  await otty.control((c, p) => c.nextOpen(p), [path])
  await panel.getByRole('button', { name: 'Attach files' }).click()
  await expect(panel.getByText(name)).toBeVisible()
  // Read: the tray's quick actions only show once the file is ready, and a question can't go before that.
  await expect(panel.getByRole('button', { name: /^Summarize/ })).toBeVisible()
}

test('an attached CSV becomes a bar chart by month, with the numbers Otty worked out', { tag: ['@step-122', '@step-124'] }, async ({ otty, world }) => {
  world.reply(
    streamed('chart sales by month'),
    { calls: [{ name: 'make_chart', args: { chart: 'bar', x: 'Date', y: 'Sales', by: 'month', title: 'Sales by month' } }] },
    { say: 'March was the best month, with 200 in sales.' }
  )
  world.backgroundReply = 'Sales chart'
  const panel = await otty.openPanel()
  await attach(otty, panel, 'sales.csv', SALES)
  await otty.ask(panel, 'chart sales by month')

  const answer = lastAnswer(panel)
  await expect(answer.getByText('Worked out the chart')).toBeVisible()
  const card = answer.locator('.drawing-card')
  await expect(card.getByRole('img', { name: 'Diagram drawn by Otty' })).toBeVisible()
  await card.getByRole('button', { name: 'See the numbers' }).click()
  const numbers = card.locator('.drawing-card__code')
  // January is 100 + 50, worked out by Otty, not the model.
  await expect(numbers).toContainText('Jan')
  await expect(numbers).toContainText('150')
  await expect(numbers).toContainText('100') // February: 70 + 30
  await expect(numbers).toContainText('200')

  // The model was handed the same numbers to write about.
  const result = toolResult(world.modelRequests())
  expect(result).toContain('150')
  expect(result).toContain('All together: 450.')

  // Step 124: the chart is still there after a relaunch, but the table isn't kept, so a new chart asks for the file.
  await otty.relaunch()
  world.reply(streamed('another chart by region'), { calls: [{ name: 'make_chart', args: { chart: 'pie', x: 'Region', y: 'Sales' } }] }, { say: 'Could you attach the CSV again?' })
  const again = await otty.openPanel()
  await again.getByRole('button', { name: 'Recent chats' }).click()
  await again.getByRole('button', { name: /Sales chart/ }).click()
  await expect(again.locator('.drawing-card').getByRole('img', { name: 'Diagram drawn by Otty' })).toBeVisible()
  await otty.ask(again, 'another chart by region')
  await expect(lastAnswer(again).getByText('Could you attach the CSV again?')).toBeVisible()
  expect(toolResult(world.modelRequests())).toContain('There’s no table in this chat')
  await expect(again.locator('.drawing-card')).toHaveCount(1)
})

test('a highlighted table becomes a pie chart, and general data stays an ordinary diagram', { tag: ['@step-123'] }, async ({ otty, world }) => {
  const table = ['Region\tSales', 'North\t300', 'South\t120', 'East\t80'].join('\n')
  world.reply(streamed('pie chart of this by region'), { calls: [{ name: 'make_chart', args: { chart: 'pie', x: 'Region', y: 'Sales' } }] }, { say: 'North has most of the sales.' })
  world.backgroundReply = 'Regions'
  await otty.mac({ selection: table, front: { name: 'Numbers', bundleId: 'com.apple.iWork.Numbers' } })
  await otty.press('Alt+Space')
  const quick = await otty.view('quick')
  // The highlight lands first, then the box is ready for a question.
  await expect(quick.getByText('Highlighted')).toBeVisible()
  await otty.ask(quick, 'make a pie chart of this by region')
  const card = lastAnswer(quick).locator('.drawing-card')
  await expect(card.getByRole('img', { name: 'Diagram drawn by Otty' })).toBeVisible()
  await card.getByRole('button', { name: 'See the numbers' }).click()
  await expect(card.locator('.drawing-card__code')).toContainText('North')
  expect(toolResult(world.modelRequests())).toContain('300')
  await quick.keyboard.down('Escape')

  // No file and nothing highlighted: no chart hint goes to the model, and its drawing is an ordinary one.
  world.reply(streamed('planets by number of moons'), { say: `Saturn and Jupiter have the most moons.\n\n\`\`\`mermaid\npie title "Moons"\n  "Saturn" : 274\n  "Jupiter" : 95\n\`\`\`` })
  const panel = await otty.openPanel()
  await panel.getByRole('button', { name: 'New chat' }).click()
  await otty.ask(panel, 'make a chart of the planets by number of moons')
  const diagram = lastAnswer(panel).locator('.drawing-card')
  await expect(diagram.getByRole('img', { name: 'Diagram drawn by Otty' })).toBeVisible()
  await expect(diagram.getByRole('button', { name: 'See the text' })).toBeVisible()
  const asked = world.modelRequests().at(-1)!
  expect(JSON.stringify(asked.messages?.at(-1))).not.toContain('make_chart')
})
