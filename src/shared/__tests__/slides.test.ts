import { describe, expect, it } from 'vitest'
import { deckDiagrams, deckHtml, inline, MAX_SLIDES, parseSlides, type SlideTheme } from '../slides'

const theme: SlideTheme = { bg: '#fff', surface: '#fafafa', text: '#222', heading: '#111', muted: '#888', brand: '#637c42', accent: '#c7b58b', hairline: '#ddd', font: 'system-ui' }
const DECK = `# Otters at work
How rafts keep them safe

---

# Why rafts
- They hold hands while sleeping
- **Kelp** keeps them in place
Note: Pause for questions here.

---

# 42%
of otters prefer kelp

---

# Two rivers
::: columns
Avon is wide
|||
- Tees is fast
:::

---

> Otters are the best swimmers. — A biologist

---

# How it flows
~~~mermaid
flowchart LR
  A --> B
  ---
  B --> C
~~~`

describe('parseSlides', () => {
  it('splits slides and picks a layout for each', () => {
    const deck = parseSlides(DECK)
    expect(deck.slides.map((s) => s.layout)).toEqual(['title', 'bullets', 'big', 'columns', 'quote', 'diagram'])
    expect(deck.slides[1]).toMatchObject({ title: 'Why rafts', notes: ['Pause for questions here.'] })
    expect(deck.slides[1].blocks).toEqual([{ kind: 'list', ordered: false, items: ['They hold hands while sleeping', '**Kelp** keeps them in place'] }])
    expect(deck.slides[3].blocks[0]).toEqual({ kind: 'columns', left: [{ kind: 'para', text: 'Avon is wide' }], right: [{ kind: 'list', ordered: false, items: ['Tees is fast'] }] })
  })

  it('never splits a slide inside a diagram', () => {
    const deck = parseSlides(DECK)
    expect(deck.slides).toHaveLength(6)
    expect(deckDiagrams(deck)).toEqual(['flowchart LR\n  A --> B\n  ---\n  B --> C'])
  })

  it('starts a slide at each top-level heading when the --- lines are missing', () => {
    const deck = parseSlides('# One\nIntro\nNote: hi\n# Two\n- a\n## Sub stays\n# Three\n~~~mermaid\n# not a heading\n~~~')
    expect(deck.slides.map((s) => s.title)).toEqual(['One', 'Two', 'Three'])
  })

  it('keeps a deck to a sensible size', () => {
    expect(parseSlides(Array.from({ length: 50 }, (_, i) => `# Slide ${i}`).join('\n---\n')).slides).toHaveLength(MAX_SLIDES)
    expect(parseSlides('\n\n---\n\n').slides).toHaveLength(0)
  })
})

describe('deckHtml', () => {
  it('escapes every word, so a slide can never carry markup', () => {
    const html = deckHtml(parseSlides('# <img src=x onerror=alert(1)>\n- <script>alert(1)</script>\n- "quoted" & \'single\''), theme, () => null)
    expect(html).not.toMatch(/<img src=x|<script>/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&quot;quoted&quot; &amp; &#39;single&#39;')
  })

  it('only puts data: pictures in, and the page forbids everything else', () => {
    const deck = parseSlides('# D\n~~~mermaid\nflowchart LR\nA-->B\n~~~')
    expect(deckHtml(deck, theme, () => 'https://evil.example/x.png')).not.toContain('evil.example')
    expect(deckHtml(deck, theme, () => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E')).toContain('<img class="diagram" src="data:image/svg+xml')
    expect(deckHtml(deck, theme, () => null)).toContain("default-src 'none'; img-src data:")
  })

  it('draws one slide, or all of them for a PDF', () => {
    const deck = parseSlides(DECK)
    expect(deckHtml(deck, theme, () => null, 2).match(/<section/g)).toHaveLength(1)
    expect(deckHtml(deck, theme, () => null).match(/<section/g)).toHaveLength(6)
    expect(deckHtml(deck, theme, () => null, 2)).toContain('3 / 6')
  })

  it('formats bold, italic and code, and leaves links as text', () => {
    expect(inline('**a** *b* `c` [x](https://e.example)')).toBe('<strong>a</strong> <em>b</em> <code>c</code> [x](https://e.example)')
  })

  it('draws the title slide on a wash, dots for bullets, a quote mark and a page badge (D-70)', () => {
    const deck = parseSlides('# Otters\nA short talk\n---\n# Facts\n- Fur\n- Kelp\n---\n# Said\n> Hold hands while you sleep.')
    const html = deckHtml(deck, theme, () => null)
    expect(html).toMatch(/\.slide--title\{[^}]*radial-gradient/)
    expect(html).toMatch(/ul>li::before\{[^}]*background:#637c42/)
    expect(html).toMatch(/\.slide--quote blockquote::before\{content:"\\201C"/)
    expect(html).toMatch(/footer\{[^}]*border-radius:18px/)
    expect(html).toContain('2 / 3')
  })
})
