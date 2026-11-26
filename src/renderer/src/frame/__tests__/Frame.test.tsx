// @vitest-environment jsdom
// D-64: the frame puts each part where the width says, and the compact header switches screens or goes back.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Frame, type FrameProps } from '../Frame'
import { SIDES } from '../sides'

afterEach(cleanup)

function frame(over: Partial<FrameProps> = {}) {
  const onGo = vi.fn()
  const onBack = vi.fn()
  ;(window as unknown as { otty: object }).otty = { saveSettings: vi.fn(async () => ({})) }
  render(
    <Frame width={420} place="chat" title="Chat" pushed={false} onBack={onBack} onGo={onGo} needsYou={2} status="2 need you" busy={false} paused={false} onNewChat={() => {}} sides={SIDES} onSides={() => {}} list={<p>The list</p>} {...over}>
      <p>The chat</p>
    </Frame>
  )
  return { onGo, onBack }
}

describe('the frame (Spec 05)', () => {
  it('under 640: one screen, the list as a page, and a screen menu that opens every screen', () => {
    const { onGo } = frame()
    expect(screen.queryByText('The list')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chat, switch screen, 2 needs you' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Home⌘1', 'Chat⌘2', 'Chats⇧⌘F', 'Logbook2⌘3', 'Notebook⌘4', 'Calendar⌘5', 'Pouch⌘6', 'Settings⌘,'])
    fireEvent.click(screen.getByRole('menuitem', { name: /^Logbook/ }))
    expect(onGo).toHaveBeenCalledWith('logbook')
  })

  it('a pushed page has Back instead of the menu', () => {
    const { onBack } = frame({ pushed: true, title: 'Chats' })
    expect(screen.queryByRole('button', { name: /switch screen/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeTruthy()
  })

  it('keeps three icons when compact, with the needs-you count on the screen menu', () => {
    frame()
    // The Logbook is in the screen menu, so the header doesn't repeat it.
    expect(screen.queryByRole('button', { name: /^Logbook/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Chat, switch screen, 2 needs you' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pause everything' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy()
  })

  it('at 760: a rail, and the list as a column with its own header', () => {
    frame({ width: 760 })
    expect(screen.getByText('The list')).toBeTruthy()
    expect(document.querySelector('.frame__nav--rail')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Chats' })).toBeTruthy()
    // The nav has the Logbook now, so the header doesn't repeat it, and Pause sits at the rail's foot.
    expect(screen.getAllByRole('button', { name: /^Logbook/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Pause everything' })).toHaveLength(1)
  })

  it('from 980: the sidebar with Otty’s status and counts; folded by ⌃⌘S to the rail', () => {
    frame({ width: 1200 })
    expect(document.querySelector('.frame__nav--sidebar')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Otty: 2 need you' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Logbook, 2 needs you' }).textContent).toContain('2')
    cleanup()
    frame({ width: 1200, sides: { ...SIDES, navFolded: true } })
    expect(document.querySelector('.frame__nav--rail')).not.toBeNull()
  })

  it('the sidebar button folds the nav and hides the list together, and shows them again (Spec 09)', () => {
    const onSides = vi.fn()
    frame({ width: 1200, onSides })
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(onSides).toHaveBeenCalledWith({ ...SIDES, navFolded: true, listHidden: true })
    cleanup()
    frame({ width: 1200, sides: { ...SIDES, navFolded: true, listHidden: true } })
    // Shut, the list stays mounted at no width so it can open by its width again.
    expect(document.querySelector('.frame__list[data-shut]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Show sidebar' })).toBeTruthy()
  })

  it('leaves Chats out when chats aren’t remembered', () => {
    frame({ noChats: true })
    fireEvent.click(screen.getByRole('button', { name: 'Chat, switch screen, 2 needs you' }))
    expect(screen.queryByRole('menuitem', { name: /^Chats/ })).toBeNull()
  })
})
