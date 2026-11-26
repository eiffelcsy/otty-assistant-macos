import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { PouchItem } from '../../../shared/types'
import type { Drawn } from '../draw/render'
import { SlideView } from '../draw/SlideView'
import { ChoiceRow } from '../panel/settings/rows'
import { drawOne, fromLine } from './Stone'

// A stone's card (D-77, Spec 12 Part 4): the picture big, its shelf, and what to do with it. Esc closes it.

const NONE = ''
const NEW = '\u0000new'
const SHELF_MAX = 40

interface Props {
  item: PouchItem
  shelves: string[]
  onClose: () => void
  /** null takes it off its shelf. */
  onShelf: (shelf: string | null) => void
  onOpenChat: (chatId: string, answerId: string) => void
  onPutBack: () => void
}

export function StoneCard({ item, shelves, onClose, onShelf, onOpenChat, onPutBack }: Props) {
  const card = useRef<HTMLDivElement>(null)
  const [picture, setPicture] = useState<Drawn | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    let live = true
    void drawOne(item.drawing, item.code).then((d) => live && setPicture(d))
    return () => {
      live = false
    }
  }, [item.drawing, item.code])

  useEffect(() => card.current?.focus(), [])

  const choose = (value: string) => {
    if (value === NEW) return setAdding(true)
    onShelf(value === NONE ? null : value)
  }
  const save = () => {
    const shelf = name.trim()
    if (!shelf) return
    setAdding(false)
    setName('')
    onShelf(shelf.slice(0, SHELF_MAX))
  }
  const bigView = () => {
    if (picture?.kind === 'picture') void window.otty.showDrawing({ kind: 'picture', dataUrl: picture.dataUrl, width: picture.width, height: picture.height })
    else if (picture?.kind === 'slides') void window.otty.showDrawing({ kind: 'slides', pages: picture.pages, notes: picture.deck.slides.map((s) => s.notes) })
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (adding) setAdding(false)
    else onClose()
  }

  return (
    <div className="pouch-card" role="dialog" aria-label={item.title} tabIndex={-1} ref={card} onKeyDown={onKey}>
      <div className="pouch-card__pic">
        {picture?.kind === 'picture' ? (
          <img src={picture.dataUrl} alt="" draggable={false} />
        ) : picture?.kind === 'slides' ? (
          <SlideView page={picture.pages[0]} className="pouch-card__slide" />
        ) : null}
      </div>
      <h3 className="pouch-card__title">{item.title}</h3>
      <div className="pouch-card__from">{fromLine(item)}</div>
      {adding ? (
        <div className="pouch-card__new">
          <label className="label">
            New shelf
            <input
              className="field"
              autoFocus
              maxLength={SHELF_MAX}
              placeholder="Recipes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
            />
          </label>
          <div className="pouch-card__buttons">
            <button className="btn btn--primary btn--small" disabled={!name.trim()} onClick={save}>
              Save
            </button>
            <button className="btn btn--soft btn--small" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <ChoiceRow
          title="Shelf"
          value={item.shelf ?? NONE}
          options={[{ value: NONE, label: 'Not on a shelf' }, ...shelves.map((s) => ({ value: s, label: s })), { value: NEW, label: 'New shelf…' }]}
          onChange={choose}
        />
      )}
      <div className="pouch-card__buttons">
        <button className="btn btn--warn btn--small pouch-card__put" onClick={onPutBack}>
          Put back
        </button>
        <span className="pouch-card__spacer" />
        {item.chatId && (
          <button className="btn btn--soft" onClick={() => onOpenChat(item.chatId!, item.answerId)}>
            Go to the chat
          </button>
        )}
        <button className="btn btn--primary" onClick={bigView} disabled={!picture || picture.kind === 'error'}>
          Open big
        </button>
      </div>
    </div>
  )
}
