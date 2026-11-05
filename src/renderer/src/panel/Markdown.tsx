import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AnswerLanguage, HomeLanguage } from '../../../shared/types'
import { wordDiff } from '../../../shared/diff'
import { LANGUAGE_SHORT } from '../../../shared/languages'
import { Icon } from '../components/Icon'

/** Lets explain-term pop-ups send follow-up questions into the chat. */
export const AskContext = createContext<(text: string) => void>(() => {})

/** The user's home language, so explain cards can offer the other language. null = English only. */
export const HomeContext = createContext<HomeLanguage | null>(null)

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

function ExplainTerm({
  term,
  around,
  language,
  children
}: {
  term: string
  around: string
  /** The answer's language: the card opens in it. */
  language: AnswerLanguage
  children: ReactNode
}) {
  const ask = useContext(AskContext)
  const home = useContext(HomeContext)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [lang, setLang] = useState<AnswerLanguage>(language)
  /** Ignores a slow reply for a language the user has already switched away from. */
  const wanted = useRef(lang)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [viewport, setViewport] = useState(0)
  const anchor = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)

  const load = (l: AnswerLanguage) => {
    wanted.current = l
    setLang(l)
    setText(null)
    window.otty.explain(term, around, l).then((t) => {
      if (wanted.current === l) setText(t)
    })
  }

  const toggle = () => {
    if (open) return setOpen(false)
    setOpen(true)
    load(lang)
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
            <Icon name="book-alt" />
            <span className="explain-card__term">{term}</span>
            {home && (
              <div className="lang-pill" role="group" aria-label="Explanation language">
                {(['en', home] as AnswerLanguage[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className="lang-pill__opt"
                    aria-pressed={lang === l}
                    title={`Explain in ${LANGUAGE_SHORT[l]}`}
                    onClick={() => lang !== l && load(l)}
                  >
                    {l === 'en' ? 'EN' : LANGUAGE_SHORT[l]}
                  </button>
                ))}
              </div>
            )}
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
              // Asked in the card's language, so the typed-language rule answers in kind.
              ask(lang === 'en' ? `Tell me more about "${term}".` : `請再詳細解釋「${term}」。`)
            }}
          >
            Ask more about this <Icon name="arrow-small-right" />
          </button>
        </div>
      )}
    </>
  )
}

/** The answer being rendered, for the explain terms inside it. */
const AnswerContext = createContext<{ text: string; language: AnswerLanguage }>({ text: '', language: 'en' })

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const { text, language } = useContext(AnswerContext)
  if (href === '#explain') {
    return (
      <ExplainTerm term={textOf(children)} around={text} language={language}>
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
}

function TipCard({ children }: { children?: ReactNode }) {
  return (
    <aside className="tip-card">
      <Icon name="bulb" solid />
      <div className="tip-card__body">{children}</div>
    </aside>
  )
}

/** Answers never load remote pictures: the request alone would send whatever the address holds, with no click. */
function NoRemoteImage({ alt }: { alt?: string }) {
  return <>{alt}</>
}

/** What the proofread card compares against: the text the user highlighted, and whether the answer has finished. */
export const ProofreadContext = createContext<{ source: string; done: boolean }>({ source: '', done: true })

/** The corrected text from a proofread answer, marked up here so the marks are always true to what changed. */
function FixedCard({ text }: { text: string }) {
  const { source, done } = useContext(ProofreadContext)
  const [copied, setCopied] = useState(false)
  const parts = done && source ? wordDiff(source, text) : null
  return (
    <div className="fixed-card">
      <p className="fixed-card__text">
        {parts
          ? parts.map((p, i) => (p.kind === 'same' ? p.text : p.kind === 'added' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>))
          : text}
      </p>
      {done && (
        <button
          className="copy-btn"
          onClick={() => {
            void window.otty.copyText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          <Icon name={copied ? 'check' : 'copy-alt'} />
          {copied ? 'Copied' : 'Copy fixed text'}
        </button>
      )}
    </div>
  )
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const code = children as { props?: { className?: string } } | undefined
  if (code?.props?.className === 'language-fixed') return <FixedCard text={textOf(children).replace(/\n$/, '')} />
  return <pre>{children}</pre>
}

// Module-level, so a re-render doesn't hand react-markdown new component types and remount
// every explain term (which closed an open card whenever the quick view re-rendered).
const components = { a: MarkdownLink, blockquote: TipCard, img: NoRemoteImage, pre: CodeBlock }
const remarkPlugins = [remarkGfm]

export function Markdown({ text, language = 'en' }: { text: string; language?: AnswerLanguage }) {
  return (
    <div className="md">
      <AnswerContext.Provider value={{ text, language }}>
        <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
          {/* Tips arrive as `> 💡 …`; the card draws its own icon, so drop the emoji. */}
          {text.replace(/^(\s*>\s*)💡\s*/gm, '$1')}
        </ReactMarkdown>
      </AnswerContext.Provider>
    </div>
  )
}
