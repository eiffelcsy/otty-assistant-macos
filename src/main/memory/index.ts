import { database } from '../store'
import { MemoryStore } from './store'

export { MEMORY_NOTE, MemoryStore } from './store'
export { forget, remember, undo } from './learn'
export { observe } from './observe'
export type { LearnTurn } from './guard'

let store: MemoryStore | null = null

export function memoryStore(): MemoryStore {
  return (store ??= new MemoryStore(database()))
}
