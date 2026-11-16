// The quick view (D-47): collecting captures from other apps, an answer finishing while nobody looks, and a long
// answer with an explain card that still fits.
import type { Page } from '@playwright/test'
import type { ServerResponse } from 'http'
import { expect, test, type Otty } from '../fixtures'
import type { ModelBody, World } from '../world/server'

const SAFARI = { name: 'Safari', bundleId: 'com.apple.Safari', title: 'Otters', url: 'https://example.com/otters' }
const NOTES = { name: 'Notes', bundleId: 'com.apple.Notes', title: 'Weasels' }

type View = 'panel' | 'quick' | 'bubble'

function windowState(otty: Otty, view: View) {
  return otty.app.evaluate(({ BrowserWindow }, v) => {
    const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes(`view=${v}`))
    return w ? { visible: w.isVisible(), focused: w.isFocused(), bounds: w.getBounds() } : null
  }, view)
}

/** Focus moves to `view` (`on`) or away from it to another app. */
function focusWindow(otty: Otty, view: View, on: boolean) {
  return otty.app.evaluate(
    ({ BrowserWindow }, [v, f]) => {
      const w = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().includes(`view=${v}`))
      if (f) w?.focus()
      else w?.blur()
    },
    [view, on] as const
  )
}

const shown = (otty: Otty, view: View) => async () => (await windowState(otty, view))?.visible

/** The quick view, once its page listens (a capture sent while it's still loading at launch is lost). */
async function quickReady(otty: Otty): Promise<Page> {
  const quick = await otty.view('quick')
  await expect(quick.locator('textarea')).toBeAttached()
  return quick
}

/** Highlight `text` in `front`, press ⌥Space, and wait for the quick view. */
async function highlight(otty: Otty, text: string, front: typeof SAFARI | typeof NOTES = SAFARI): Promise<Page> {
  const quick = await quickReady(otty)
  await otty.mac({ selection: text, front })
  await otty.press('Alt+Space')
  await expect.poll(shown(otty, 'quick')).toBe(true)
  await expect(quick.getByText(text)).toBeVisible()
  return quick
}

/**
 * Holds every streamed answer until the returned function is called, so a spec can act while one is under way.
 * The world is shared by the worker, so the hold is always lifted (call it in `finally`).
 */
function holdAnswers(world: World): () => void {
  type Model = (res: ServerResponse, body: ModelBody) => void
  const w = world as unknown as { model: Model }
  const real = w.model
  let release = () => {}
  const gate = new Promise<void>((r) => (release = r))
  w.model = (res, body) => {
    if (body.stream) void gate.then(() => real.call(world, res, body))
    else real.call(world, res, body)
  }
  return () => {
    release()
    delete (w as Partial<typeof w>).model // back to the class's own
  }
}

test('an answer that finishes after a click elsewhere puts a dot on the otter; clicking it shows the answer', { tag: ['@step-18'] }, async ({ otty, world }) => {
  const quick = await highlight(otty, 'Otters sleep holding hands.')
  const bubble = await otty.view('bubble')
  world.reply('Why do they hold hands?', { say: 'So they don’t drift apart while they sleep.' })

  const release = holdAnswers(world)
  try {
    await otty.ask(quick, 'Why do they hold hands?')
    await expect(quick.getByText('Otty is thinking')).toBeVisible()
    await focusWindow(otty, 'quick', false)
    await expect.poll(shown(otty, 'quick')).toBe(false)
  } finally {
    release()
  }

  await expect(bubble.getByTitle('Otty has an answer for you · Click to see it')).toBeVisible()
  await otty.mac({ selection: null, front: null })
  await bubble.getByTitle('Otty has an answer for you · Click to see it').click()
  const panel = await otty.view('panel')
  await expect.poll(shown(otty, 'panel')).toBe(true)
  await expect(panel.getByText('drift apart while they sleep')).toBeVisible()
  await expect(bubble.getByTitle('Click to ask Otty · Right-click for more')).toBeVisible()
})

test('＋ add more keeps the quick view open while another app adds a capture, then Compare runs', { tag: ['@step-41'] }, async ({ otty, world }) => {
  const quick = await highlight(otty, 'Otters are mustelids.')
  await quick.getByRole('button', { name: 'add more' }).click()
  await expect(quick.getByText(/Highlight or snip more, then press/)).toBeVisible()
  const before = (await windowState(otty, 'quick'))!.bounds

  // Into another app: it stays open, and the next highlight lands without moving it or taking focus.
  await focusWindow(otty, 'quick', false)
  await otty.mac({ selection: 'Weasels are mustelids too.', front: NOTES })
  await otty.press('Alt+Space')
  await expect(quick.getByText('Weasels are mustelids too.')).toBeVisible()
  await expect(quick.getByRole('button', { name: 'Remove' })).toHaveCount(2)
  const after = (await windowState(otty, 'quick'))!
  expect(after.visible).toBe(true)
  expect(after.focused, 'adding a capture must not take focus').toBe(false)
  // It stays put: same left edge, and it grows down from the same top, or slides up only as far as the screen's bottom edge needs.
  expect(after.bounds.x, 'the card stays put').toBe(before.x)
  const sameTop = after.bounds.y === before.y
  const bottom = await otty.app.evaluate(({ screen }, b) => {
    const a = screen.getDisplayMatching(b).workArea
    return a.y + a.height
  }, after.bounds)
  const atScreenBottom = after.bounds.y < before.y && bottom - (after.bounds.y + after.bounds.height) <= 24
  expect(sameTop || atScreenBottom, `the card moved: ${JSON.stringify(before)} → ${JSON.stringify(after.bounds)}`).toBe(true)

  world.reply('collected 2 things', { say: 'Both are **mustelids**: one lives in water, one on land.' })
  await quick.locator('textarea').press('Enter')
  await expect(quick.getByText('one lives in water')).toBeVisible()
  await expect(quick.getByText('Compare these')).toBeVisible()

  // Once asked, a click elsewhere puts it away.
  await focusWindow(otty, 'quick', true)
  await focusWindow(otty, 'quick', false)
  await expect.poll(shown(otty, 'quick')).toBe(false)
})

test('esc close puts the quick view away', { tag: ['@step-42'] }, async ({ otty }) => {
  const quick = await highlight(otty, 'River otters live in burrows called holts.')
  await quick.getByRole('button', { name: 'esc close' }).click()
  await expect.poll(shown(otty, 'quick')).toBe(false)

  // Esc does the same.
  await highlight(otty, 'A group of otters in water is a raft.')
  await quick.keyboard.press('Escape')
  await expect.poll(shown(otty, 'quick')).toBe(false)
})

test('a long answer with an explain card keeps the card, the esc / ↵ row and scrolling', { tag: ['@step-25'] }, async ({ otty, world }) => {
  const quick = await highlight(otty, 'Kelp forests shelter sea otters.')
  const paragraphs = Array.from({ length: 24 }, (_, i) => `Point ${i + 1}: otters and kelp help each other in many small ways.`)
  world.reply('Tell me everything', { say: `${paragraphs.join('\n\n')}\n\nAll of this happens in the [kelp forest](#explain).` })
  world.backgroundReply = 'An underwater forest of tall seaweed.'
  await otty.ask(quick, 'Tell me everything')
  await expect(quick.getByText('Point 24:')).toBeVisible()

  const answer = quick.locator('.quick__answer')
  expect(await answer.evaluate((el) => el.scrollHeight > el.clientHeight), 'the long answer scrolls').toBe(true)

  await quick.getByRole('button', { name: 'kelp forest' }).click()
  const card = quick.getByRole('dialog')
  await expect(card.getByText('An underwater forest of tall seaweed.')).toBeVisible()
  await expect(card).toBeInViewport({ ratio: 1 })
  await expect(quick.getByRole('button', { name: 'esc close' })).toBeInViewport({ ratio: 1 })
  await expect(quick.getByRole('button', { name: /continue in chat/ })).toBeInViewport({ ratio: 1 })

  // A click outside closes the card (Esc doesn't yet: see the fixme below), then the quick view is closed.
  await quick.locator('.quick__question').click()
  await expect(card).toBeHidden()
  await quick.getByRole('button', { name: 'esc close' }).click()
  await expect.poll(shown(otty, 'quick')).toBe(false)

  // A longer passage elsewhere: the whole card shows, box and row included.
  const passage = Array.from({ length: 12 }, (_, i) => `Line ${i + 1} of a longer passage about otters and the kelp they live in.`).join(' ')
  await otty.mac({ selection: passage, front: NOTES })
  await otty.press('Alt+Space')
  await expect.poll(shown(otty, 'quick')).toBe(true)
  await expect(quick.getByText(/Line 1 of a longer passage/)).toBeVisible()
  await expect(quick.locator('textarea')).toBeInViewport({ ratio: 1 })
  await expect(quick.getByRole('button', { name: 'esc close' })).toBeInViewport({ ratio: 1 })
  await expect(quick.getByRole('button', { name: /ask Otty/ })).toBeInViewport({ ratio: 1 })
})

test('Esc closes an open explain card in the quick view', { tag: ['@step-25'] }, async ({ otty, world }) => {
  const quick = await highlight(otty, 'Kelp forests shelter sea otters.')
  world.reply('What shelters them?', { say: 'The [kelp forest](#explain) does.' })
  world.backgroundReply = 'An underwater forest of tall seaweed.'
  await otty.ask(quick, 'What shelters them?')
  await quick.getByRole('button', { name: 'kelp forest' }).click()
  await expect(quick.getByRole('dialog')).toBeVisible()
  await quick.keyboard.press('Escape')
  await expect(quick.getByRole('dialog')).toBeHidden()
  await expect.poll(shown(otty, 'quick')).toBe(true)
})
