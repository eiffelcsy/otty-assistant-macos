// Drawings (D-30): mermaid, svg and slides blocks become cards, with a bigger view and exports through the save dialog.
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Page } from '@playwright/test'
import type { ModelBody } from '../world/server'
import { expect, test, type Otty } from '../fixtures'

/** Only streamed answers: a background call (the chat's title) quotes the question too, and mustn't use up its reply. */
const streamed = (words: string) => (text: string, body: ModelBody) => body.stream === true && text.includes(words)

const FLOWCHART = ['flowchart TD', '  A["Someone writes a bill"] --> B["A committee reads it"]', '  B --> C["Both houses vote"]', '  C --> D["The president signs it"]'].join('\n')

const fence = (lang: string, code: string) => `\`\`\`${lang}\n${code}\n\`\`\``

/** A PNG's width, from its header. Null if the file isn't a PNG. */
function pngWidth(path: string): number | null {
  const b = readFileSync(path)
  if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null
  return b.readUInt32BE(16)
}

/** A PDF's pages, as [width, height] in points. Null if the file isn't a PDF. */
function pdfPages(path: string): [number, number][] | null {
  const text = readFileSync(path).toString('latin1')
  if (!text.startsWith('%PDF-')) return null
  const pages: [number, number][] = []
  for (const m of text.matchAll(/\/Type\s*\/Page\b(?!s)[\s\S]*?\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)) {
    pages.push([Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])])
  }
  // Some writers put the MediaBox before /Type; count the pages either way.
  const count = text.match(/\/Type\s*\/Page\b(?!s)/g)?.length ?? 0
  return pages.length === count ? pages : Array.from({ length: count }, () => pages[0] ?? [0, 0])
}

/** What the real clipboard holds, as macOS lists it. */
function clipboardInfo(): string {
  return execFileSync('osascript', ['-e', 'clipboard info'], { encoding: 'utf8' })
}

async function saveTo(otty: Otty, name: string): Promise<string> {
  const path = join(otty.home, name)
  await otty.control((c, p) => c.nextSave(p), path)
  return path
}

const lastAnswer = (panel: Page) => panel.locator('.msg--otty').last()

test('a flowchart card opens big, copies as a picture and saves as PNG and PDF', { tag: ['@step-112'] }, async ({ otty, world }) => {
  world.reply(streamed('how a bill becomes a law'), { say: `A bill goes through a few rounds of reading and voting before it becomes law.\n\n${fence('mermaid', FLOWCHART)}` })
  world.backgroundReply = 'How a bill becomes law'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'draw how a bill becomes a law')

  const card = lastAnswer(panel).locator('.drawing-card')
  const diagram = card.getByRole('img', { name: 'Diagram drawn by Otty' })
  await expect(diagram).toBeVisible()
  // The one-sentence summary sits above the card.
  await expect(lastAnswer(panel).getByText('A bill goes through a few rounds')).toBeVisible()

  // Show big opens its own window; Esc closes it.
  await card.getByRole('button', { name: 'Show big' }).click()
  const viewer = await otty.view('viewer')
  await expect(viewer.getByRole('img', { name: 'Drawing by Otty' })).toBeVisible()
  // Only the key going down: the window closes on it, so there's no page left for the key coming up.
  await viewer.keyboard.down('Escape')
  await expect.poll(() => otty.app.windows().some((w) => !w.isClosed() && w.url().includes('view=viewer'))).toBe(false)

  // Copy as picture puts a PNG on the clipboard (pasting into Keynote stays by hand).
  await card.getByRole('button', { name: 'Copy as picture' }).click()
  await expect(card.getByText('Copied', { exact: true })).toBeVisible()
  expect(clipboardInfo()).toMatch(/PNGf/)

  // Save PNG: a picture drawn at twice its size.
  const pngPath = await saveTo(otty, 'bill.png')
  await card.getByRole('button', { name: 'Save PNG' }).click()
  await expect(card.getByText('Saved', { exact: true })).toBeVisible()
  await expect.poll(() => existsSync(pngPath)).toBe(true)
  const natural = await diagram.evaluate((img: HTMLImageElement) => img.naturalWidth)
  expect(pngWidth(pngPath)).toBeGreaterThanOrEqual(natural * 2 - 2)

  // Save PDF: one page.
  const pdfPath = await saveTo(otty, 'bill.pdf')
  await card.getByRole('button', { name: 'Save PDF' }).click()
  await expect.poll(() => existsSync(pdfPath) && pdfPages(pdfPath)?.length).toBe(1)

  // Both went through the Mac's save dialog, to where the user chose.
  const saves = (await otty.snapshot()).calls.filter((c) => c.kind === 'dialog').map((c) => c.detail)
  expect(saves).toEqual([
    ['save', pngPath],
    ['save', pdfPath]
  ])
})

test('a deck card shows slide 1 and its count, and saves five 16:9 pages, in light and dark', { tag: ['@step-113'] }, async ({ otty, world }) => {
  const deck = [
    '# Sea otters',
    '- The smallest marine mammal',
    'Note: Start with a smile.',
    '---',
    '# Where they live',
    '- The North Pacific coast',
    '---',
    '# 1,000,000',
    '- Hairs per square inch',
    '---',
    '# What they eat',
    '::: columns',
    '- Urchins',
    '|||',
    '- Crabs',
    ':::',
    '---',
    '# Why they matter',
    '> Otters keep kelp forests healthy.'
  ].join('\n')
  world.reply(streamed('5 slides about otters'), { say: `Here's a short deck for a school talk.\n\n${fence('slides', deck)}` })
  world.backgroundReply = 'Otter slides'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'make 5 slides about otters for a school talk')

  const card = lastAnswer(panel).locator('.drawing-card--slides')
  await expect(card.getByText('5 slides')).toBeVisible()
  await expect(card.getByText('Sea otters')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Present' })).toBeVisible()

  for (const theme of ['dark', 'light'] as const) {
    // control.theme() doesn't reach the page's prefers-color-scheme in a smoke run, so the page is emulated instead.
    await panel.emulateMedia({ colorScheme: theme })
    expect(await panel.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(theme === 'dark')
    await expect(card.getByText('Sea otters')).toBeVisible()
    const pdfPath = await saveTo(otty, `otters-${theme}.pdf`)
    await card.getByRole('button', { name: 'Save PDF' }).click()
    await expect.poll(() => existsSync(pdfPath) && pdfPages(pdfPath)?.length).toBe(5)
    for (const [w, h] of pdfPages(pdfPath)!) expect(w / h).toBeCloseTo(16 / 9, 2)
  }
})

test('a pie chart and an SVG picture are drawn, and a plain question gets no drawing', { tag: ['@step-114'] }, async ({ otty, world }) => {
  world.reply(streamed('make a pie chart'), { say: `Rent is most of the month.\n\n${fence('mermaid', 'pie title "Monthly spending"\n  "Rent" : 1200\n  "Food" : 400\n  "Fun" : 250')}` })
  world.reply(streamed('draw a house'), {
    say: `A simple house.\n\n${fence('svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100"><rect x="20" y="45" width="80" height="50" fill="#c96"/><polygon points="10,50 60,10 110,50" fill="#a33"/><text x="60" y="80" text-anchor="middle" font-size="10">home</text></svg>')}`
  })
  world.reply(streamed('capital of France'), { say: 'The capital of France is **Paris**.' })
  world.backgroundReply = 'Drawings'
  const panel = await otty.openPanel()

  await otty.ask(panel, 'make a pie chart: rent 1200, food 400, fun 250')
  await expect(lastAnswer(panel).getByRole('img', { name: 'Diagram drawn by Otty' })).toBeVisible()
  // A chart, not a list.
  await expect(lastAnswer(panel).locator('li')).toHaveCount(0)

  await otty.ask(panel, 'draw a house as an SVG')
  await expect(lastAnswer(panel).getByRole('img', { name: 'Picture drawn by Otty' })).toBeVisible()

  await otty.ask(panel, "what's the capital of France?")
  await expect(lastAnswer(panel).getByText('The capital of France is')).toBeVisible()
  await expect(lastAnswer(panel).locator('.drawing-card')).toHaveCount(0)
  await expect(panel.locator('.drawing-card')).toHaveCount(2)
})

test('a drawing that does not parse says so kindly, and Try again draws the fixed one', { tag: ['@step-115'] }, async ({ otty, world }) => {
  world.reply(streamed('a broken mermaid diagram'), { say: `Here it is.\n\n${fence('mermaid', 'flowchart TD\n  A[["Start" --> ((B\n  }}} oops')}` })
  world.reply(streamed("didn't come out right"), { say: `Fixed.\n\n${fence('mermaid', 'flowchart LR\n  A["Start"] --> B["Finish"]')}` })
  world.backgroundReply = 'Broken diagram'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'draw a broken mermaid diagram')

  const broken = panel.locator('.drawing-card').first()
  await expect(broken.getByText('This drawing didn’t come out right.')).toBeVisible()
  await expect(broken.locator('img')).toHaveCount(0)

  await broken.getByRole('button', { name: 'Try again' }).click()
  await expect(lastAnswer(panel).getByRole('img', { name: 'Diagram drawn by Otty' })).toBeVisible()
  // The follow-up was an ordinary turn that told the model what went wrong.
  const followUp = world.modelRequests().at(-1)
  expect(JSON.stringify(followUp?.messages?.filter((m) => m.role === 'user').at(-1))).toContain("The drawing didn't come out right")
})

// Math lives with drawings: both are things Otty draws in an answer.
test('inline and block formulas are all drawn, and prices stay text', { tag: ['@step-89'] }, async ({ otty, world }) => {
  const answer = String.raw`The matrix $$A = \begin{pmatrix} 3 & 1 \\ 0 & 4 \end{pmatrix}$$ has its diagonal $$3$$ and $$4$$.

$$\operatorname{tr}(A) = 3 + 4 = 7$$

Check: $$\text{trace} = 7$$. A notebook costs $5 and a pen $10.`
  world.reply(streamed('trace of a matrix'), { say: answer })
  world.backgroundReply = 'Trace'
  const panel = await otty.openPanel()
  await otty.ask(panel, 'what is the trace of a matrix? check: trace = 7')
  const md = lastAnswer(panel).locator('.md')
  await expect(md.locator('.katex').first()).toBeVisible()
  expect(await md.locator('.katex').count()).toBeGreaterThanOrEqual(5)
  await expect(md.locator('.katex-error')).toHaveCount(0)
  // No formula shows its dollars; the prices keep theirs.
  const words = await md.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.katex').forEach((k) => k.remove())
    return copy.textContent ?? ''
  })
  expect(words).not.toContain('$$')
  expect(words).not.toContain('\\')
  expect(words).toContain('$5 and a pen $10')
})
