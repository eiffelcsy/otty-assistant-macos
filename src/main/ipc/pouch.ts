import { cleanShelf } from '../pebbles'
import { forgetPouch, pebbles, pouch, putBack, undoPutBack } from '../core'
import { handle } from './check'

// D-77: the Pouch screen. Main looks every Pebble up by its answer and place; a window sends only those.
export function registerPouch(): void {
  handle('pouch:list', () => pouch())
  handle('pouch:shelf', (_e, answerId: string, index: number, shelf: unknown) => {
    const name = cleanShelf(shelf)
    if (name === undefined) return pouch()
    pebbles().setShelf(answerId, index, name)
    return pouch()
  })
  handle('pouch:drop', (_e, answerId: string, index: number) => putBack(answerId, index))
  handle('pouch:undo-drop', (_e, answerId: string, index: number) => undoPutBack(answerId, index))
  handle('pouch:forget', () => forgetPouch())
}
