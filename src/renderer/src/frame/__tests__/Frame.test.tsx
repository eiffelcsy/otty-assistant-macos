// @vitest-environment jsdom
// D-64: the frame puts each part where the width says, and the compact header switches screens or goes back.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Frame, type FrameProps } from '../Frame'

afterEach(cleanup)

function frame(over: Partial<FrameProps> = {}) {
  const onGo = vi.fn()
  const onBack = vi.fn()
  ;(window as unknown as { otty: object }).otty = { saveSettings: vi.fn(async () => ({})) }
  render(
    <Frame width={420} place="chat" title="Chat" pushed={false} onBack={onBack} onGo={onGo} needsYou={2} status="2 need you" busy={false} paused={false} onNewChat={() => {}} sidebarHidden={false} list={<p>The list</p>} {...over}>
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
    fireEvent.click(screen.getByRole('button', { name: 'Chat, switch screen' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Chat⌘1', 'Chats⌘2', 'Logbook2⌘3', 'Notebook⌘4', 'Settings⌘,'])
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

  it('keeps four icons when compact, with the needs-you count in the Logbook’s name', () => {
    frame()
    expect(screen.getByRole('button', { name: 'Logbook, 2 needs you' })).toBeTruthy()
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
    frame({ width: 1200, sidebarHidden: true })
    expect(document.querySelector('.frame__nav--rail')).not.toBeNull()
  })

  it('leaves Chats out when chats aren’t remembered', () => {
    frame({ noChats: true })
    fireEvent.click(screen.getByRole('button', { name: 'Chat, switch screen' }))
    expect(screen.queryByRole('menuitem', { name: /^Chats/ })).toBeNull()
  })
})
