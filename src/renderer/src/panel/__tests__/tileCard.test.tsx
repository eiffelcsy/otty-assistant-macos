// @vitest-environment jsdom
// D-56: a tile the model drafts is only a card; nothing is kept until the user presses Save tile.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Markdown, ProofreadContext } from '../Markdown'

const draft = '```tile\n{"name":"Make flashcards","icon":"layers","prompt":"Turn this into five flashcards.","when":"text"}\n```'
const otty = {
  getSettings: vi.fn(async () => ({ myTiles: [{ id: 'old', name: 'Reply', icon: 'envelope', prompt: 'Reply politely.', when: 'any' }] })),
  setSetting: vi.fn(async () => ({}))
}
Object.assign(window, { otty })
afterEach(cleanup)

const show = (text: string, done = true) =>
  render(
    <ProofreadContext.Provider value={{ source: '', done }}>
      <Markdown text={text} />
    </ProofreadContext.Provider>
  )

describe('a drafted tile (D-56)', () => {
  it('waits for the answer, shows the draft to edit, and saves only from the button', async () => {
    show(draft, false)
    expect(screen.queryByText('Save tile')).toBeNull()
    cleanup()
    show(draft)
    expect(screen.getByDisplayValue('Make flashcards')).toBeTruthy()
    expect(otty.setSetting).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Save tile'))
    await waitFor(() => expect(otty.setSetting).toHaveBeenCalled())
    const [key, tiles] = otty.setSetting.mock.calls[0] as unknown as [string, { name: string; prompt: string; when: string }[]]
    expect(key).toBe('myTiles')
    expect(tiles.map((t) => t.name)).toEqual(['Reply', 'Make flashcards'])
    expect(tiles[1]).toMatchObject({ prompt: 'Turn this into five flashcards.', when: 'text' })
    await screen.findByText(/Saved “Make flashcards” to My tiles/)
  })

  it('shows nothing for a draft that isn’t one, and tames an odd icon', () => {
    show('```tile\nnot json\n```')
    expect(screen.queryByText('Save tile')).toBeNull()
    cleanup()
    show('```tile\n{"name":"X","icon":"https://evil.example/i.png","prompt":"p","when":"everything"}\n```')
    expect(screen.getByRole('radio', { name: 'sparkles' }).getAttribute('aria-checked')).toBe('true')
  })
})
