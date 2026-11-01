import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Icon } from '../components/Icon'

/** Lets explain-term pop-ups send follow-up questions into the chat. */
export const AskContext = createContext<(text: string) => void>(() => {})

const cache = new Map<string, Promise<string>>()

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) return textOf((node as any).props.children)
  return ''
}

/** Splits the `中文：…` line that main's explain prompt puts first when a home language is set. */
function splitGloss(text: string): { gloss: { lang: string; term: string } | null; body: string } {
  const m = text.match(/^(中文)\s*[：:]\s*(.+?)\s*(?:\n+|$)([\s\S]*)$/)
  return m ? { gloss: { lang: m[1], term: m[2] }, body: m[3].trim() } : { gloss: null, body: text }
}

function ExplainTerm({ term, around, children }: { term: string; around: string; children: ReactNode }) {
  const ask = useContext(AskContext)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [viewport, setViewport] = useState(0)
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
  }, [open, text, viewport])

  // The quick view grows its window when a card opens; re-place the card once it has.
  useLayoutEffect(() => {
    if (!open) return
    const onResize = () => setViewport(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!card.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) setOpen(false)
    }
    const closeOnScroll = () => setOpen(false)
    window.addEventListener('mousedown', close)
    document.querySelector('.chat, .quick__answer')?.addEventListener('scroll', closeOnScroll)
    return () => {
      window.removeEventListener('mousedown', close)
      document.querySelector('.chat, .quick__answer')?.removeEventListener('scroll', closeOnScroll)
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
          <div className="explain-card__title">
            <Icon name="book-alt" /> {term}
          </div>
          {text === null ? (
            <div className="explain-card__body">
              <span className="dots">Otty is thinking</span>
            </div>
          ) : (
            (() => {
              const { gloss, body } = splitGloss(text)
              return (
                <>
                  {gloss && (
                    <div className="explain-card__gloss">
                      <span className="explain-card__lang">{gloss.lang}</span>
                      {gloss.term}
                    </div>
                  )}
                  <div className="explain-card__body">{body}</div>
                </>
              )
            })()
          )}
          <button
            className="explain-card__more"
            onClick={() => {
              setOpen(false)
              ask(`Tell me more about "${term}".`)
            }}
          >
            Ask more about this <Icon name="arrow-small-right" />
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
            return (
              <aside className="tip-card">
                <Icon name="bulb" solid />
                <div className="tip-card__body">{children}</div>
              </aside>
            )
          }
        }}
      >
        {/* Tips arrive as `> 💡 …`; the card draws its own icon, so drop the emoji. */}
        {text.replace(/^(\s*>\s*)💡\s*/gm, '$1')}
      </ReactMarkdown>
    </div>
  )
}
