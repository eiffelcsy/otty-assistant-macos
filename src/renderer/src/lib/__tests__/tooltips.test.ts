// @vitest-environment jsdom
// W11: Otty's own tooltip for every title, after 500 ms, then instant for a while; the title comes back after.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELAY_MS, installTooltips, WARM_MS } from '../tooltips'

let uninstall = () => {}
beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<button id="a" title="New chat ⌘N"></button><button id="b" title="Logbook ⌘3">Log</button><p id="c">text</p>'
  uninstall = installTooltips()
})
afterEach(() => {
  uninstall()
  vi.useRealTimers()
})

const tip = () => document.querySelector<HTMLElement>('.tooltip')!
const hover = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
const leave = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.getElementById('c') }))

describe('tooltips', () => {
  it('waits, shows the title in place of the system’s, and puts it back', () => {
    hover('a')
    const a = document.getElementById('a')!
    expect(a.hasAttribute('title')).toBe(false)
    expect(a.getAttribute('aria-label')).toBe('New chat ⌘N')
    vi.advanceTimersByTime(DELAY_MS - 1)
    expect(tip().hidden).toBe(true)
    vi.advanceTimersByTime(1)
    expect(tip().hidden).toBe(false)
    expect(tip().textContent).toBe('New chat ⌘N')
    leave('a')
    expect(tip().hidden).toBe(true)
    expect(a.getAttribute('title')).toBe('New chat ⌘N')
    expect(a.hasAttribute('aria-label')).toBe(false)
  })

  it('adds the shortcut from data-keys after the name (D-85)', () => {
    document.getElementById('a')!.dataset.keys = '⇧⌘C'
    hover('a')
    vi.advanceTimersByTime(DELAY_MS)
    expect(tip().querySelector('.tooltip__keys')?.textContent).toBe('⇧⌘C')
  })

  it('keeps a title the window changed while it showed', () => {
    hover('a')
    const a = document.getElementById('a')!
    a.setAttribute('title', 'Use this again')
    leave('a')
    expect(a.getAttribute('title')).toBe('Use this again')
    expect(a.hasAttribute('aria-label')).toBe(false)
  })

  it('is instant on the next one for a moment, then waits again', () => {
    hover('a')
    vi.advanceTimersByTime(DELAY_MS)
    leave('a')
    hover('b')
    vi.advanceTimersByTime(0)
    expect(tip().textContent).toBe('Logbook ⌘3')
    expect(document.getElementById('b')!.hasAttribute('aria-label')).toBe(false)
    leave('b')
    vi.advanceTimersByTime(WARM_MS + 1)
    hover('a')
    vi.advanceTimersByTime(0)
    expect(tip().hidden).toBe(true)
  })

  it('goes on a click or a key', () => {
    hover('a')
    vi.advanceTimersByTime(DELAY_MS)
    document.dispatchEvent(new KeyboardEvent('keydown'))
    expect(tip().hidden).toBe(true)
  })
})
