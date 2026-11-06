import { useEffect, useRef, useState } from 'react'
import type { Memory, MemoryKind } from '../../../shared/types'
import { Icon } from '../components/Icon'

const GROUPS: { kind: MemoryKind; label: string }[] = [
  { kind: 'about', label: 'About you' },
  { kind: 'preference', label: 'How you like answers' },
  { kind: 'habit', label: 'How you work' },
  { kind: 'person', label: 'People' },
  { kind: 'goal', label: 'What you’re working towards' }
]

const shortDate = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function Source({ memory: m, onOpenChat }: { memory: Memory; onOpenChat: () => void }) {
  if (m.origin === 'observed') return <span className="memory__source">Noticed from how you use Otty</span>
  if (m.origin === 'settings') return <span className="memory__source">Added by you</span>
  if (!m.sourceChatId) return <span className="memory__source">From a chat on {shortDate(m.createdAt)}</span>
  return (
    <button
      className="memory__source memory__source--link"
      onClick={() => {
        void window.otty.openChat(m.sourceChatId!)
        onOpenChat()
      }}
    >
      From a chat on {shortDate(m.createdAt)}
    </button>
  )
}

function Row({ memory: m, onChange, onOpenChat }: { memory: Memory; onChange: (list: Memory[]) => void; onOpenChat: () => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(m.text)
  const paused = m.status === 'paused'

  const save = async () => {
    setEditing(false)
    if (text.trim() && text !== m.text) onChange(await window.otty.updateMemory(m.id, { text: text.trim() }))
    else setText(m.text)
  }

  return (
    <li className={`memory${paused ? ' memory--paused' : ''}`}>
      <div className="memory__body">
        {editing ? (
          <input
            className="field"
            autoFocus
            value={text}
            maxLength={200}
            aria-label="Edit what Otty knows"
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setText(m.text)
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="memory__text">{m.text}</span>
        )}
        <Source memory={m} onOpenChat={onOpenChat} />
      </div>
      <div className="memory__actions">
        <button className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
          <Icon name="pencil" />
        </button>
        <button
          className="icon-btn"
          title={paused ? 'Use this again' : 'Pause: keep it, but don’t use it'}
          onClick={async () => onChange(await window.otty.updateMemory(m.id, { status: paused ? 'active' : 'paused' }))}
        >
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
        <button className="icon-btn" title="Delete" onClick={async () => onChange(await window.otty.removeMemory(m.id))}>
          <Icon name="trash" />
        </button>
      </div>
    </li>
  )
}

/** Settings → What Otty knows about you. Changes here apply at once, and the next answer uses them. */
export function MemorySection({ learn, onLearn, focus, onOpenChat }: { learn: boolean; onLearn: (on: boolean) => void; focus: number; onOpenChat: () => void }) {
  const [memories, setMemories] = useState<Memory[] | null>(null)
  const [adding, setAdding] = useState('')
  const [refused, setRefused] = useState(false)
  const [sure, setSure] = useState(false)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    void window.otty.listMemories().then(setMemories)
  }, [])

  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'start' })
  }, [focus, memories !== null])

  const add = async () => {
    const text = adding.trim()
    if (!text) return
    const list = await window.otty.addMemory(text)
    const kept = list.length !== memories?.length
    setRefused(!kept)
    if (kept) setAdding('')
    setMemories(list)
  }

  return (
    <section ref={ref}>
      <h3>
        <Icon name="bookmark" /> What Otty knows about you
      </h3>
      <label className="toggle">
        <input type="checkbox" checked={learn} onChange={(e) => onLearn(e.target.checked)} />
        <span>
          <b>Let Otty learn about me</b> — it notes useful things as you chat, shows you each one, and uses them to fit its answers. Turned off, nothing is learned
          or sent, and this list is kept.
        </span>
      </label>
      {memories?.length === 0 && <p className="hint">Nothing yet. What Otty learns stays on this Mac, and only goes to your AI service with your questions.</p>}
      {GROUPS.map(({ kind, label }) => {
        const group = memories?.filter((m) => m.kind === kind) ?? []
        if (!group.length) return null
        return (
          <div key={kind} className="memory-group">
            <div className="memory-group__label">{label}</div>
            <ul className="memory-list">
              {group.map((m) => (
                <Row key={m.id} memory={m} onChange={setMemories} onOpenChat={onOpenChat} />
              ))}
            </ul>
          </div>
        )
      })}
      <div className="memory-add">
        <input
          className="field"
          placeholder="Add something, like “I’m a nurse”"
          aria-label="Add something Otty should know"
          maxLength={200}
          value={adding}
          onChange={(e) => {
            setAdding(e.target.value)
            setRefused(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button className="btn btn--soft btn--small" disabled={!adding.trim()} onClick={add}>
          Add
        </button>
      </div>
      {refused && <p className="hint hint--warn">Otty never keeps passwords, keys or codes.</p>}
      {Boolean(memories?.length) &&
        (sure ? (
          <div className="confirm-card__row">
            <button
              className="btn btn--soft btn--small"
              onClick={async () => {
                await window.otty.clearMemories()
                setMemories([])
                setSure(false)
              }}
            >
              Yes, forget all of it
            </button>
            <button className="btn btn--soft btn--small" onClick={() => setSure(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button className="btn btn--soft btn--small" onClick={() => setSure(true)}>
            Forget everything Otty knows
          </button>
        ))}
    </section>
  )
}
