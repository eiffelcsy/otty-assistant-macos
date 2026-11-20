import { useState } from 'react'
import { TILE_ICONS, TILE_LIMITS, TILE_WHEN, WHEN_LABELS, type MyTile } from '../../../../shared/tiles'
import { Icon } from '../../components/Icon'
import { Group } from './rows'

// My own tiles (D-56): add, edit, reorder and delete. A tile is a saved question; main checks every field again.

export const newTile = (): MyTile => ({ id: crypto.randomUUID(), name: '', icon: 'sparkles', prompt: '', when: 'any' })

/** The fields of one tile, with Save. Also the card a chat drafts a tile on, so nothing is kept without this button. */
export function TileEditor({ tile, saveLabel = 'Save', onSave, onCancel }: { tile: MyTile; saveLabel?: string; onSave: (t: MyTile) => void; onCancel?: () => void }) {
  const [t, setT] = useState(tile)
  const set = (patch: Partial<MyTile>) => setT((old) => ({ ...old, ...patch }))
  const ready = t.name.trim() && t.prompt.trim()
  return (
    <div className="tile-edit">
      <label className="label">
        Name
        <input className="field" maxLength={TILE_LIMITS.name} value={t.name} placeholder="Make flashcards" onChange={(e) => set({ name: e.target.value })} />
      </label>
      <div className="label" role="radiogroup" aria-label="Icon">
        Icon
        <div className="tile-edit__icons">
          {TILE_ICONS.map((i) => (
            <button key={i} role="radio" aria-checked={t.icon === i} aria-label={i} className={`icon-btn icon-btn--sm${t.icon === i ? ' icon-btn--on' : ''}`} onClick={() => set({ icon: i })}>
              <Icon name={i} />
            </button>
          ))}
        </div>
      </div>
      <label className="label">
        What Otty is asked
        <textarea className="field tile-edit__prompt" maxLength={TILE_LIMITS.prompt} rows={3} value={t.prompt} placeholder="Turn this into five flashcards, question on the front." onChange={(e) => set({ prompt: e.target.value })} />
      </label>
      <label className="label">
        Shows for
        <span className="popup">
          <select value={t.when} onChange={(e) => set({ when: e.target.value as MyTile['when'] })}>
            {TILE_WHEN.map((w) => (
              <option key={w} value={w}>
                {WHEN_LABELS[w]}
              </option>
            ))}
          </select>
        </span>
      </label>
      <div className="tile-edit__buttons">
        {onCancel && (
          <button className="btn btn--quiet btn--small" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn btn--primary btn--small" disabled={!ready} onClick={() => onSave({ ...t, name: t.name.trim(), prompt: t.prompt.trim() })}>
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

export function MyTiles({ tiles, save }: { tiles: MyTile[]; save: (tiles: MyTile[]) => void }) {
  const [editing, setEditing] = useState<MyTile | null>(null)
  const put = (t: MyTile) => {
    save(tiles.some((x) => x.id === t.id) ? tiles.map((x) => (x.id === t.id ? t : x)) : [...tiles, t])
    setEditing(null)
  }
  const move = (i: number, by: number) => {
    const next = [...tiles]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    save(next)
  }
  return (
    <Group label="My tiles">
      {tiles.map((t, i) =>
        editing?.id === t.id ? (
          <TileEditor key={t.id} tile={t} onSave={put} onCancel={() => setEditing(null)} />
        ) : (
          <div key={t.id} className="set-row">
            <Icon name={t.icon} className="set-row__glyph" />
            <span className="set-row__text">
              <span className="set-row__title">{t.name}</span>
              <span className="set-row__desc">{WHEN_LABELS[t.when]}</span>
            </span>
            <span className="tile-row__tools">
              <button className="icon-btn icon-btn--sm" aria-label={`Move ${t.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <Icon name="angle-up" />
              </button>
              <button className="icon-btn icon-btn--sm" aria-label={`Move ${t.name} down`} disabled={i === tiles.length - 1} onClick={() => move(i, 1)}>
                <Icon name="angle-down" />
              </button>
              <button className="icon-btn icon-btn--sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                <Icon name="edit" />
              </button>
              <button className="icon-btn icon-btn--sm" aria-label={`Delete ${t.name}`} onClick={() => save(tiles.filter((x) => x.id !== t.id))}>
                <Icon name="trash" />
              </button>
            </span>
          </div>
        )
      )}
      {editing && !tiles.some((t) => t.id === editing.id) ? (
        <TileEditor tile={editing} onSave={put} onCancel={() => setEditing(null)} />
      ) : (
        <button className="set-row set-row--tap" disabled={tiles.length >= TILE_LIMITS.tiles} onClick={() => setEditing(newTile())}>
          <Icon name="add" className="set-row__glyph" />
          <span className="set-row__text">
            <span className="set-row__title">Add a tile</span>
            <span className="set-row__desc">{tiles.length >= TILE_LIMITS.tiles ? `${TILE_LIMITS.tiles} is the most.` : 'A question you ask often, one tap away under what you highlight.'}</span>
          </span>
        </button>
      )}
    </Group>
  )
}
