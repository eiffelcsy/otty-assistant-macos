import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'
import type { AnswerLanguage, HomeLanguage, QuickAction } from '../../../shared/types'
import { stripLineNumbers } from '../../../shared/code'
import { drawingKind, type DrawingKind } from '../../../shared/drawing'
import { DrawingCard } from '../draw/DrawingCard'
import { wordDiff } from '../../../shared/diff'
import { LANGUAGE_SHORT } from '../../../shared/languages'
import { Icon } from '../components/Icon'
import { closedMath } from '../lib/closedMath'
import { tidyMath } from '../lib/mathText'

/** Lets explain-term pop-ups send follow-up questions into the chat. */
export const AskContext = createContext<(text: string, action?: QuickAction) => void>(() => {})

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
  /** Bumped to re-place the card beside its term after the chat scrolls under it. */
  const [moved, setMoved] = useState(0)
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
  }, [open, text, viewport, moved])

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
    // A scroll closes the card only once its term has left the view. Otherwise the card follows it: opening a card
    // can grow the quick view's window, and that relayout scrolls the answer, which used to close the card at once.
    const scroller = document.querySelector('.chat, .quick__answer')
    const closeOnScroll = () => {
      const term = anchor.current?.getBoundingClientRect()
      const view = scroller?.getBoundingClientRect()
      if (!term || !view || term.bottom < view.top || term.top > view.bottom) setOpen(false)
      else setMoved((n) => n + 1)
    }
    // The quick view and the panel leave Esc to an open card (they check for `.explain-card`), so the card closes
    // first, focus goes back to its term, and the next Esc closes the window.
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      anchor.current?.focus()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', closeOnEscape)
    scroller?.addEventListener('scroll', closeOnScroll)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', closeOnEscape)
      scroller?.removeEventListener('scroll', closeOnScroll)
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
            <div className="explain-card__waiting" role="status" aria-label="Otty is thinking">
              <span />
              <span />
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

/** A 💡 tip: "Good to know", surfacing once the answer has finished (Spec 03, V13). */
function TipCard({ children }: { children?: ReactNode }) {
  const { done } = useContext(ProofreadContext)
  if (!done) return null
  return (
    <aside className="tip-card">
      <div className="tip-card__label">Good to know</div>
      <div className="tip-card__body">{children}</div>
    </aside>
  )
}

/** Answers never load remote pictures: the request alone would send whatever the address holds, with no click. */
function NoRemoteImage({ alt }: { alt?: string }) {
  return (
    <span className="md-picture">
      <Icon name="picture" /> Picture not shown, to keep you safe{alt ? `: ${alt}` : ''}
    </span>
  )
}

/** Answers never get a display-size heading: `#` is treated as `##`, and every level reads as one title size. */
const Heading = ({ children }: { children?: ReactNode }) => <h3>{children}</h3>

/** Tables scroll sideways inside their own box, never the column. */
const Table = ({ children }: { children?: ReactNode }) => (
  <div className="md-table">
    <table>{children}</table>
  </div>
)

/** A number reads right-aligned in tabular figures. */
const NUMBER = /^[\s$€£¥+\-−]*[\d.,]+\s*[%kKmM]?$/
const Cell = ({ children }: { children?: ReactNode }) => <td className={NUMBER.test(textOf(children)) ? 'md-num' : undefined}>{children}</td>

/** What the proofread card compares against: the text the user highlighted, and whether the answer has finished (drawings wait for that too). */
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

/** `language-python` → "python", for the label over a code block. */
export function codeLabel(className?: string): string | null {
  const m = className?.match(/(?:^|\s)language-([\w+#.-]+)/)
  return m ? m[1] : null
}

/** A code block in an answer, with its language and a Copy button: copying code by hand is easy to get wrong. */
function CopyableCode({ label, children }: { label: string | null; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span className="code-block__lang">{label ?? 'Code'}</span>
        <button
          className="icon-btn icon-btn--sm"
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => {
            void window.otty.copyText(stripLineNumbers(textOf(children).replace(/\n$/, '')))
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
          }}
        >
          <Icon name={copied ? 'check' : 'copy-alt'} />
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

/** A ```mermaid, ```svg or ```slides block becomes a drawing once the answer has finished. */
function Drawing({ kind, code }: { kind: DrawingKind; code: string }) {
  const { done } = useContext(ProofreadContext)
  const ask = useContext(AskContext)
  return <DrawingCard kind={kind} code={code} host={{ done, ask: (text) => ask(text) }} />
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const code = children as { props?: { className?: string } } | undefined
  if (code?.props?.className === 'language-fixed') return <FixedCard text={textOf(children).replace(/\n$/, '')} />
  const drawing = drawingKind(codeLabel(code?.props?.className))
  if (drawing) return <Drawing kind={drawing} code={textOf(children).replace(/\n$/, '')} />
  return <CopyableCode label={codeLabel(code?.props?.className)}>{children}</CopyableCode>
}

// Module-level, so a re-render doesn't hand react-markdown new component types and remount
// every explain term (which closed an open card whenever the quick view re-rendered).
const components = { a: MarkdownLink, blockquote: TipCard, img: NoRemoteImage, pre: CodeBlock, h1: Heading, h2: Heading, h3: Heading, h4: Heading, h5: Heading, h6: Heading, table: Table, td: Cell }
const remarkPlugins = [remarkGfm]
// Only $$…$$ is math, so "$5 and $10" stays text.
const mathRemarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: false }] as never]
const mathRehypePlugins = [[rehypeKatex, { throwOnError: false }] as never]

export function Markdown({ text, language = 'en' }: { text: string; language?: AnswerLanguage }) {
  // Most answers have no math, so they skip the plugins altogether.
  const tidy = tidyMath(text)
  const math = tidy.includes('$$')
  return (
    <div className="md">
      <AnswerContext.Provider value={{ text, language }}>
        <ReactMarkdown remarkPlugins={math ? mathRemarkPlugins : remarkPlugins} rehypePlugins={math ? mathRehypePlugins : undefined} components={components}>
          {/* Tips arrive as `> 💡 …`; the card draws its own icon, so drop the emoji. */}
          {(math ? closedMath(tidy) : tidy).replace(/^(\s*>\s*)💡\s*/gm, '$1')}
        </ReactMarkdown>
      </AnswerContext.Provider>
    </div>
  )
}
