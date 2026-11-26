// @vitest-environment jsdom
// D-77, Spec 12: the Pouch's wall, search, stone card and Put back.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OttyApi, PouchItem } from '../../../../shared/types'
import { Pouch } from '../Pouch'

// Drawings are not loaded in tests (mermaid is heavy): every stone shows its glyph.
vi.mock('../../draw/render', () => ({ draw: vi.fn(async () => ({ kind: 'error', error: 'not drawn in tests' })) }))

const DAY = 86_400_000
const now = Date.now()
const items: PouchItem[] = [
  { answerId: 'a1', index: 0, kind: 'chart', title: 'Rainfall by month', drawing: 'mermaid', code: 'pie title R', shelf: 'Budget', chatId: 'c1', chatTitle: 'Trip budget', chatAt: now, kept: now - 2 * DAY },
  { answerId: 'a2', index: 0, kind: 'deck', title: 'Otters together', drawing: 'slides', code: '# Otters', shelf: 'Class', chatId: 'c2', chatTitle: 'Otter talk', chatAt: now, kept: now - DAY },
  { answerId: 'a3', index: 0, kind: 'diagram', title: 'Idea to law', drawing: 'mermaid', code: 'flowchart LR', chatId: 'c3', chatTitle: 'Civics', chatAt: now, kept: now },
  { answerId: 'a4', index: 0, kind: 'picture', title: 'Little house', drawing: 'svg', code: '<svg/>', chatTitle: '', chatAt: now, kept: now - 3 * DAY }
]

const labels = (container: HTMLElement) => [...container.querySelectorAll('.set-group__label')].map((l) => l.textContent)
const stones = (container: HTMLElement) => [...container.querySelectorAll('.stone__title')].map((t) => t.textContent)

const putBack = vi.fn(async () => true)
const undoPutBack = vi.fn(async () => true)
const pouchList = vi.fn(async () => structuredClone(items))

beforeEach(() => {
  putBack.mockClear()
  undoPutBack.mockClear()
  window.otty = {
    pouch: pouchList,
    putBack,
    undoPutBack,
    setShelf: vi.fn(async () => structuredClone(items)),
    showDrawing: vi.fn(async () => undefined),
    openChat: vi.fn(async () => undefined)
  } as unknown as OttyApi
})

afterEach(() => {
  cleanup()
})

describe('the wall', () => {
  it('groups stones by shelf in the order shelves were first used, with loose ones last', async () => {
    const { container } = render(<Pouch band="wide" onOpenChat={() => {}} />)
    await screen.findByRole('button', { name: 'Rainfall by month, Chart, from Trip budget' })
    expect(labels(container)).toEqual(['Budget', 'Class', 'Not on a shelf'])
    expect(screen.getByRole('heading').textContent).toBe('Pouch · 4')
  })

  it('has no group labels when nothing is on a shelf', async () => {
    window.otty.pouch = vi.fn(async () => items.map((i) => ({ ...i, shelf: undefined })))
    const { container } = render(<Pouch band="wide" onOpenChat={() => {}} />)
    await screen.findByText('Idea to law')
    expect(labels(container)).toEqual([])
  })
})

describe('search', () => {
  it('filters by title, kind label, shelf and chat title', async () => {
    const { container } = render(<Pouch band="wide" onOpenChat={() => {}} />)
    await screen.findByText('Idea to law')
    const find = screen.getByLabelText('Find in your Pouch')
    fireEvent.change(find, { target: { value: 'rain' } })
    expect(stones(container)).toEqual(['Rainfall by month'])
    fireEvent.change(find, { target: { value: 'picture' } })
    expect(stones(container)).toEqual(['Little house'])
    fireEvent.change(find, { target: { value: 'class' } })
    expect(stones(container)).toEqual(['Otters together'])
    fireEvent.change(find, { target: { value: 'civics' } })
    expect(stones(container)).toEqual(['Idea to law'])
  })

  it('says so when nothing matches, and Esc clears the search', async () => {
    const { container } = render(<Pouch band="wide" onOpenChat={() => {}} />)
    await screen.findByText('Idea to law')
    const find = screen.getByLabelText('Find in your Pouch')
    fireEvent.change(find, { target: { value: 'kelp' } })
    expect(screen.getByText('Nothing in your Pouch matches “kelp”.')).toBeTruthy()
    fireEvent.keyDown(find, { key: 'Escape' })
    expect(stones(container)).toHaveLength(4)
  })
})

describe('the stone card', () => {
  it('says "From a deleted chat" and offers no way to the chat', async () => {
    render(<Pouch band="wide" onOpenChat={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Little house, Picture, from a deleted chat' }))
    expect(screen.getByRole('dialog', { name: 'Little house' }).textContent).toContain('From a deleted chat')
    expect(screen.queryByRole('button', { name: 'Go to the chat' })).toBeNull()
  })

  it('goes to the chat at its answer', async () => {
    const onOpenChat = vi.fn()
    render(<Pouch band="wide" onOpenChat={onOpenChat} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rainfall by month, Chart, from Trip budget' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to the chat' }))
    expect(onOpenChat).toHaveBeenCalledWith('c1', 'a1')
  })

  it('closes on Esc', async () => {
    render(<Pouch band="wide" onOpenChat={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Idea to law, Diagram, from Civics' }))
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Idea to law' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Put back', () => {
  it('takes the stone off the wall, shows the line, and Undo calls undoPutBack', async () => {
    const { container } = render(<Pouch band="wide" onOpenChat={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Rainfall by month, Chart, from Trip budget' }))
    fireEvent.click(screen.getByRole('button', { name: 'Put back' }))
    expect(await screen.findByText('Put back “Rainfall by month”')).toBeTruthy()
    expect(putBack).toHaveBeenCalledWith('a1', 0)
    expect(stones(container)).not.toContain('Rainfall by month')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undoPutBack).toHaveBeenCalledWith('a1', 0)
  })
})

describe('empty', () => {
  it('says what goes in the Pouch', async () => {
    window.otty.pouch = vi.fn(async () => [])
    render(<Pouch band="wide" onOpenChat={() => {}} />)
    expect(await screen.findByText('Keep a chart, a diagram or slides from any answer, and it lands here.')).toBeTruthy()
  })
})
