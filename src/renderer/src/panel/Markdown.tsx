import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Lets explain-term pop-ups send follow-up questions into the chat. */
export const AskContext = createContext<(text: string) => void>(() => {})

const cache = new Map<string, Promise<string>>()

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as any).props.children)
  return ''
}

function ExplainTerm({ term, around, children }: { term: string; around: string; children: ReactNode }) {
  const ask = useContext(AskContext)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (open) return setOpen(false)
    setOpen(true)
    const key = term.toLowerCase()
    if (!cache.has(key)) cache.set(key, window.otty.explain(term, around))
    cache.get(key)!.then(setText)
  }

  // Position the card under the term, kept inside the window.
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const w = Math.min(280, window.innerWidth - 24)
    const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12))
    const h = card.current?.offsetHeight ?? 140
    const below = r.bottom + 8
    const top = below + h > window.innerHeight - 12 ? Math.max(12, r.top - h - 8) : below
    setPos({ left, top })
  }, [open, text])

  useLayoutEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!card.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    window.addEventListener('mousedown', close)
    document.querySelector('.chat')?.addEventListener('scroll', closeOnScroll)
    return () => {
      window.removeEventListener('mousedown', close)
      document.querySelector('.chat')?.removeEventListener('scroll', closeOnScroll)
    }
  }, [open])

  return (
    <>
      <button ref={anchor} type="button" className="explain-term" onClick={toggle} aria-expanded={open}>
        {children}
      </button>
      {open && (
        <div
          ref={card}
          className="explain-card"
          role="dialog"
          style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
        >
          <div className="explain-card__title">🐚 {term}</div>
          <div className="explain-card__body">{text ?? <span className="dots">Otty is thinking</span>}</div>
          <button
            className="btn btn--soft btn--small"
            onClick={() => {
              setOpen(false)
              ask(`Tell me more about "${term}".`)
            }}
          >
            Ask more about this
          </button>
        </div>
      )}
    </>
  )
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href === '#explain') {
              return (
                <ExplainTerm term={textOf(children)} around={text}>
                  {children}
                </ExplainTerm>
              )
            }
            return (
              <a
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  if (href) window.otty.openExternal(href)
                }}
              >
                {children}
              </a>
            )
          },
          blockquote({ children }) {
            return <aside className="tip-card">{children}</aside>
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
