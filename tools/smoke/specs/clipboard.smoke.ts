// Copy formats (copyFormats.ts): a table goes on the clipboard as HTML for Word, Pages and Mail, and as tab-separated
// text for spreadsheets and plain editors. Pasting into those apps stays by hand; what's on the clipboard is checked here.
import { readFileSync } from 'fs'
import { join } from 'path'
import { expect, test, type Otty } from '../fixtures'
import type { ModelBody } from '../world/server'

const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)

/** The real clipboard's text and HTML, read in main. */
function clipboardNow(otty: Otty): Promise<{ text: string; html: string }> {
  return otty.app.evaluate(async ({ clipboard }) => {
    const text = await clipboard.readText()
    let html = ''
    for (const item of await clipboard.read()) {
      if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text()
    }
    return { text, html }
  })
}

const TABLE = ['| Otter | Weight (kg) | Notes |', '| --- | --- | --- |', '| Sea otter | 30 | |', '| River otter | 11 | Lives in rivers |'].join('\n')
const CHINESE = ['| 名稱 | 體重 |', '| --- | --- |', '| 海獺 | 30 公斤 |', '| 水獺 | 11 公斤 |'].join('\n')

test('a snipped table copied by the tool is a bordered HTML table with every cell, and tab-separated text', { tag: ['@step-52', '@step-53'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Otter table'
  world.reply(turn('copy this table to my clipboard exactly as it is'), { calls: [{ name: 'copy_to_clipboard', args: { text: TABLE } }] }, { say: 'Copied it as a table.' })
  world.reply(turn('now the Chinese one'), { calls: [{ name: 'copy_to_clipboard', args: { text: CHINESE } }] }, { say: '已複製。' })

  await otty.mac({ snip: `data:image/png;base64,${readFileSync(join(__dirname, 'files', 'kelp.png')).toString('base64')}` })
  const panel = await otty.openPanel()
  await panel.getByTitle('Snap part of my screen').click()
  await expect(panel.locator('.context-card img').first()).toBeVisible()
  await otty.ask(panel, 'copy this table to my clipboard exactly as it is')
  await expect(panel.getByText('Copied it as a table.')).toBeVisible()
  await expect(panel.getByText('Copied to your clipboard')).toBeVisible()

  const { text, html } = await clipboardNow(otty)
  // Word: a real table, with borders and a shaded header row.
  expect(html).toMatch(/<table[^>]*border="1"/)
  expect(html).toMatch(/<th[^>]*background:#f2f2f2[^>]*>Otter<\/th>/)
  expect(html.match(/<td\b/g)).toHaveLength(6) // the empty cell is kept
  expect(html).toMatch(/<td[^>]*><\/td>/)
  expect(html).toContain('Lives in rivers')
  // Spreadsheets and plain text: tab-separated rows, no pipes.
  expect(text).toBe('Otter\tWeight (kg)\tNotes\nSea otter\t30\t\nRiver otter\t11\tLives in rivers')
  expect(text).not.toContain('|')

  await otty.ask(panel, 'now the Chinese one')
  await expect(panel.getByText('已複製。')).toBeVisible()
  const zh = await clipboardNow(otty)
  expect(zh.html).toMatch(/<th[^>]*>名稱<\/th>/)
  expect(zh.html).toContain('30 公斤')
  expect(zh.text).toBe('名稱\t體重\n海獺\t30 公斤\n水獺\t11 公斤')
})

test('Copy under an answer puts its words and a real table; an answer with no table copies exactly as written', { tag: ['@step-54'] }, async ({ otty, world }) => {
  world.backgroundReply = 'Otter sizes'
  world.reply(turn('Compare otter sizes'), { say: `Here are the sizes:\n\n${TABLE}\n\nSea otters are the heaviest.` })
  world.reply(turn('Say something short'), { say: 'Otters **love** kelp.' })
  const panel = await otty.openPanel()

  await otty.ask(panel, 'Compare otter sizes')
  await expect(panel.getByText('Sea otters are the heaviest.')).toBeVisible()
  await panel.locator('.msg--otty').last().getByRole('button', { name: 'Copy' }).click()
  await expect.poll(async () => (await clipboardNow(otty)).html).toContain('<table')
  const withTable = await clipboardNow(otty)
  expect(withTable.html).toContain('Here are the sizes:')
  expect(withTable.html).toContain('Sea otters are the heaviest.')
  expect(withTable.text).toContain('Sea otter\t30\t')

  await otty.ask(panel, 'Say something short')
  await expect(panel.getByText('kelp.', { exact: false }).last()).toBeVisible()
  await panel.locator('.msg--otty').last().getByRole('button', { name: 'Copy' }).click()
  await expect.poll(async () => (await clipboardNow(otty)).text).toBe('Otters **love** kelp.')
  expect((await clipboardNow(otty)).html).toBe('')
})
