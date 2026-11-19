// Attachments (D-47): the paperclip, the chips, what each kind of file sends, and the friendly refusals.
// Pickers are faked (`nextOpen`), so dragging from Finder and pasting a copied file stay by hand (step 30).
import { truncateSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import { expect, ONBOARDED, test, type Otty } from '../fixtures'
import type { ModelBody, World } from '../world/server'

const FILES = join(__dirname, 'files')
const fixture = (name: string) => join(FILES, name)

/** Picks these files in the next file picker, then presses the paperclip. */
async function attach(otty: Otty, panel: Page, paths: string[]): Promise<void> {
  await otty.control((c, p) => c.nextOpen(p), paths)
  await panel.getByTitle('Attach files').click()
}

/** A chip in the composer's tray, by file name. */
const trayChip = (panel: Page, name: string) => panel.locator('.file-tray:not(.file-tray--sent) .file-chip', { hasText: name })
/** A chip under a sent question, by file name. */
const sentChip = (panel: Page, name: string) => panel.locator('.file-tray--sent .file-chip', { hasText: name })

/** A user's turn (streamed), not a title or a warm-up, whose latest words hold `needle`. */
const turn = (needle: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(needle)

/** Everything the app sent to the model, as one string. */
const sentText = (world: World) => JSON.stringify(world.modelRequests())

/** The user's latest words in the newest turn. */
function lastUserContent(world: World): string {
  const body = world.modelRequests().filter((b) => b.stream).at(-1)
  const user = [...(body?.messages ?? [])].reverse().find((m) => m.role === 'user')
  return JSON.stringify(user?.content ?? '')
}

/** A plain PDF with `pages` pages of `chars` characters each, made here so the repo needn't hold a big file. */
function makePdf(path: string, pages: number, chars = 1000): void {
  const objs: string[] = []
  const kids = Array.from({ length: pages }, (_, i) => `${4 + 2 * i} 0 R`).join(' ')
  objs.push('<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  for (let i = 0; i < pages; i++) {
    const line = `Page ${i + 1} of the long otter study. `
    const lines = Array.from({ length: Math.ceil(chars / 80) }, () => line.repeat(3).slice(0, 80))
    const stream = `BT /F1 10 Tf 40 760 Td 12 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`)
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  writeFileSync(path, body, 'latin1')
}

test('a PDF, a Word document and a photo become chips, and ↵ summarizes them with pages cited', { tag: ['@step-29', '@step-51'] }, async ({ otty, world }) => {
  world.reply(turn('[File 1: otters.pdf · 3 pages]'), { say: 'Sea otters live in kelp forests (page 1) and hold hands while they sleep (page 3).' })
  world.backgroundReply = 'Otter files'
  const panel = await otty.openPanel()
  await attach(otty, panel, [fixture('otters.pdf'), fixture('enclosure.docx'), fixture('kelp.png')])

  await expect(trayChip(panel, 'otters.pdf')).toContainText('3 pages')
  await expect(trayChip(panel, 'enclosure.docx')).toContainText('Word document')
  const thumb = trayChip(panel, 'kelp.png').locator('img.file-chip__thumb')
  await expect(thumb).toBeVisible()
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await expect(panel.getByRole('button', { name: /Summarize/ })).toBeVisible()

  // ↵ with an empty box runs Summarize.
  await panel.locator('textarea').last().press('Enter')
  await expect(panel.getByText('hold hands while they sleep (page 3)')).toBeVisible()

  const user = lastUserContent(world)
  expect(user).toContain('--- page 2 ---')
  expect(user).toContain('Sea otters eat sea urchins')
  expect(user).toContain('The new otter enclosure opens on Monday at nine.')
  expect(user).toContain('[File 3: kelp.png · a picture, attached]')
  expect(user).toContain('data:image/')
  await expect(sentChip(panel, 'otters.pdf')).toBeVisible()
  // Step 51's other half: the painted otter still loads under the CSP.
  const otter = panel.locator('.panel__header img.otter-frame').first()
  expect(await otter.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('a 300-page PDF is read in part and says so; scans, odd kinds, huge files and a sixth file are turned away kindly', { tag: ['@step-31', '@step-33'] }, async ({ otty, world }) => {
  const long = join(otty.home, 'long-study.pdf')
  makePdf(long, 300)
  const huge = join(otty.home, 'huge.pdf')
  writeFileSync(huge, '')
  truncateSync(huge, 30 * 1024 * 1024)

  world.reply(turn('[File 1: long-study.pdf · 300 pages]'), { say: 'The study follows otters for a year.' })
  world.backgroundReply = 'Long study'
  const panel = await otty.openPanel()

  // Six at once: five are taken, and a chip says why the sixth isn't.
  await attach(otty, panel, ['otters.pdf', 'enclosure.docx', 'kelp.png', 'train.py', 'weights.ipynb', 'letter.rtf'].map(fixture))
  await expect(trayChip(panel, 'letter.rtf')).toContainText('Otty can take up to 5 files at a time.')
  for (const name of ['otters.pdf', 'enclosure.docx', 'kelp.png', 'train.py', 'weights.ipynb']) await expect(trayChip(panel, name)).not.toContainText('Reading')
  while ((await panel.locator('.file-tray .file-chip__x').count()) > 0) await panel.locator('.file-tray .file-chip__x').first().click()

  await attach(otty, panel, [fixture('scan.pdf'), fixture('budget.numbers'), huge])
  await expect(trayChip(panel, 'scan.pdf')).toContainText('looks like a scan')
  await expect(trayChip(panel, 'budget.numbers')).toContainText('can’t read this kind of file yet')
  await expect(trayChip(panel, 'huge.pdf')).toContainText('too big for Otty')
  while ((await panel.locator('.file-tray .file-chip__x').count()) > 0) await panel.locator('.file-tray .file-chip__x').first().click()

  // While the big one is read (in its own process), the box still takes typing.
  await attach(otty, panel, [long])
  const box = panel.locator('textarea').last()
  await box.fill('What is this study about?')
  await expect(box).toHaveValue('What is this study about?')
  await expect(trayChip(panel, 'long-study.pdf')).toContainText('300 pages')
  await box.press('Enter')
  await expect(panel.getByText('The study follows otters for a year.')).toBeVisible()
  await expect(sentChip(panel, 'long-study.pdf')).toContainText(/Otty read the first \d+ of 300 pages\./)
  expect(lastUserContent(world)).toContain('of 300 fit')
})

test('a reopened chat keeps its file chips, answers follow-ups about the file, and is found by the file’s name', { tag: ['@step-32'] }, async ({ otty, world }) => {
  world.reply(turn('[File 1: enclosure.docx]'), { say: 'The enclosure opens on Monday.' })
  world.reply(turn('What should I bring?'), { say: 'Bring towels.' })
  world.backgroundReply = 'Enclosure letter'
  const panel = await otty.openPanel()
  await attach(otty, panel, [fixture('enclosure.docx'), fixture('kelp.png')])
  await expect(trayChip(panel, 'enclosure.docx')).toContainText('Word document')
  await expect(trayChip(panel, 'kelp.png').locator('img')).toBeVisible()
  await otty.ask(panel, 'When does it open?')
  await expect(panel.getByText('The enclosure opens on Monday.')).toBeVisible()

  await otty.relaunch()
  const again = await otty.openPanel()
  await otty.go(again, 'Chats')
  await again.getByPlaceholder('Search your chats').fill('enclosure.docx')
  await again.getByRole('button', { name: /Enclosure letter/ }).click()
  await expect(sentChip(again, 'enclosure.docx')).toBeVisible()
  // Pictures are never saved: the chip comes back without its thumbnail.
  await expect(sentChip(again, 'kelp.png')).toBeVisible()
  await expect(sentChip(again, 'kelp.png').locator('img')).toHaveCount(0)

  await otty.ask(again, 'What should I bring?')
  await expect(again.getByText('Bring towels.')).toBeVisible()
  // The follow-up still carries the document's words from the saved history.
  const followUp = world.modelRequests().filter((b) => b.stream).at(-1)
  expect(JSON.stringify(followUp?.messages)).toContain('Please bring towels.')
})

test('code: the chip names the language and lines, the tiles are for code, and lines go numbered', { tag: ['@step-107', '@gate'] }, async ({ otty, world }) => {
  world.reply(turn('[File 1: train.py · Python · 14 lines]'), { say: 'Line 10 adds up the weights, and line 11 divides by the count.' }, { say: 'Line 11 fails when the file is empty.' }, { say: 'Here it is with comments.' })
  world.backgroundReply = 'Training script'
  const panel = await otty.openPanel()

  await attach(otty, panel, [fixture('train.py')])
  await expect(trayChip(panel, 'train.py')).toContainText('Python · 14 lines')
  for (const tile of ['Explain this code', 'Find problems', 'Add comments']) await expect(panel.getByRole('button', { name: tile })).toBeVisible()
  await panel.locator('textarea').last().press('Enter')
  await expect(panel.getByText('Line 10 adds up the weights')).toBeVisible()
  const user = lastUserContent(world)
  expect(user).toContain(' 1│ import csv')
  expect(user).toContain('10│     total = sum(float(r[\\"weight\\"]) for r in rows)')
  expect(user).toContain('14│ print(average_weight(load(\\"otters.csv\\")))')

  for (const [tile, answer] of [['Find problems', 'Line 11 fails when the file is empty.'], ['Add comments', 'Here it is with comments.']]) {
    await attach(otty, panel, [fixture('train.py')])
    await expect(trayChip(panel, 'train.py')).toContainText('14 lines')
    await panel.getByRole('button', { name: tile }).click()
    await expect(panel.getByText(answer)).toBeVisible()
    expect(lastUserContent(world)).toContain('11│     return total / len(rows)')
  }
})

test('a notebook is read by cell, with its chart named and its error kept', { tag: ['@step-108'] }, async ({ otty, world }) => {
  world.reply(turn('why does it fail?'), { say: 'Cell 3 divides by len(weights), which is 0: ZeroDivisionError.' })
  world.backgroundReply = 'Notebook error'
  const panel = await otty.openPanel()
  await attach(otty, panel, [fixture('weights.ipynb')])
  await expect(trayChip(panel, 'weights.ipynb')).toContainText('Notebook · 3 cells')
  await otty.ask(panel, 'why does it fail?')
  await expect(panel.getByText('Cell 3 divides by len(weights)')).toBeVisible()
  const user = lastUserContent(world)
  expect(user).toContain('Python notebook · 3 cells')
  expect(user).toContain('--- cell 3 · code [2] ---')
  expect(user).toContain('ZeroDivisionError: division by zero')
  expect(user).toContain('[a chart or picture output]')
  expect(user).not.toContain('\\u001b[') // colour codes are stripped
})

test.describe('with 繁體中文 as the other language', () => {
  test.use({ seed: { ...ONBOARDED, homeLanguage: 'zh-HK' } })

  test('a Chinese document is summarized in Chinese, an English one in English, and an .rtf sends its words', { tag: ['@step-111'] }, async ({ otty, world }) => {
    world.reply(turn('[File 1: 海獺.docx]'), { say: '海獺住在海藻林裡，睡覺時會手牽手。' })
    world.reply(turn('[File 1: otters.pdf'), { say: 'Sea otters live in kelp forests.' })
    world.reply(turn('[File 1: letter.rtf]'), { say: 'A thank-you note for the kelp.' })
    world.backgroundReply = 'Otters'
    const panel = await otty.openPanel()

    await attach(otty, panel, [fixture('海獺.docx')])
    await expect(trayChip(panel, '海獺.docx')).toContainText('Word document')
    await panel.getByRole('button', { name: /^Summarize/ }).click()
    await expect(panel.getByText('睡覺時會手牽手')).toBeVisible()
    expect(lastUserContent(world)).toContain('Please reply in')
    expect(lastUserContent(world)).not.toContain('Please reply in English')

    await panel.getByTitle('New chat').click()
    await attach(otty, panel, [fixture('otters.pdf')])
    await expect(trayChip(panel, 'otters.pdf')).toContainText('3 pages')
    await panel.getByRole('button', { name: /^Summarize/ }).click()
    await expect(panel.getByText('Sea otters live in kelp forests.')).toBeVisible()
    expect(lastUserContent(world)).toContain('Please reply in English')

    await panel.getByTitle('New chat').click()
    await attach(otty, panel, [fixture('letter.rtf')])
    await expect(trayChip(panel, 'letter.rtf')).toContainText('Document')
    await panel.getByRole('button', { name: /^Summarize/ }).click()
    await expect(panel.getByText('A thank-you note for the kelp.')).toBeVisible()
    const user = lastUserContent(world)
    expect(user).toContain('Thank you for the kelp you sent last week.')
    expect(user).not.toContain('rtf1')
    expect(sentText(world)).not.toContain('\\\\fonttbl')
  })
})
