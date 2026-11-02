import { useRef, useState } from 'react'
import type { FileAttachment, PendingFile } from '../../../shared/types'

const MAX_FILES = 5

/** A file in the composer's tray: being read, ready to send, or turned away with a friendly reason. */
export interface Chip {
  id: string
  name: string
  state: 'reading' | 'ready' | 'error'
  file?: FileAttachment
  message?: string
}

/** Files waiting to go with the next message. Main reads them; this only tracks what to show. */
export function useAttachments() {
  const [chips, setChips] = useState<Chip[]>([])
  const current = useRef<Chip[]>([])
  const update = (fn: (cs: Chip[]) => Chip[]) => {
    current.current = fn(current.current)
    setChips(current.current)
  }

  const add = async (pending: Promise<PendingFile[]>) => {
    const files = await pending
    if (!files.length) return
    const room = Math.max(0, MAX_FILES - current.current.filter((c) => c.state !== 'error').length)
    const accepted = files.slice(0, room)
    const extra = files.slice(room)
    extra.forEach((f) => window.otty.discardFile(f.id))
    const tooMany: Chip[] = extra.length
      ? [
          {
            id: extra[0].id,
            name: extra.length === 1 ? extra[0].name : `${extra.length} more files`,
            state: 'error',
            message: `Otty can take up to ${MAX_FILES} files at a time.`
          }
        ]
      : []
    update((cs) => [...cs, ...accepted.map((f): Chip => ({ id: f.id, name: f.name, state: 'reading' })), ...tooMany])
    await Promise.all(
      accepted.map(async (f) => {
        const r = await window.otty.readFile(f.id)
        update((cs) =>
          cs.map((c) =>
            c.id !== f.id ? c : r.ok ? { ...c, state: 'ready', file: r.file } : { ...c, state: 'error', message: r.message }
          )
        )
      })
    )
  }

  const remove = (id: string) => {
    window.otty.discardFile(id)
    update((cs) => cs.filter((c) => c.id !== id))
  }

  /** The ready files for this message; empties the tray. */
  const take = (): FileAttachment[] => {
    const ready = current.current.flatMap((c) => (c.state === 'ready' && c.file ? [c.file] : []))
    current.current.filter((c) => c.state === 'error').forEach((c) => window.otty.discardFile(c.id))
    update(() => [])
    return ready
  }

  return {
    chips,
    ready: chips.flatMap((c) => (c.state === 'ready' && c.file ? [c.file] : [])),
    reading: chips.some((c) => c.state === 'reading'),
    pick: () => add(window.otty.pickFiles()),
    drop: (files: File[]) => add(window.otty.dropFiles(files)),
    remove,
    take
  }
}
