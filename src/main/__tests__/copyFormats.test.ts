import { describe, expect, it } from 'vitest'
import { copyFormats } from '../copyFormats'

const table = '| Item | Qty |\n| --- | ---: |\n| Apples | 3 |\n| Pears | 12 |'

describe('copyFormats', () => {
  it('leaves text with no table exactly as written', () => {
    const email = 'Hi Sam,\n\nThe **total** is 5 | 6.\n\n- one\n\nThanks'
    expect(copyFormats(email)).toEqual({ text: email })
  })

  it('turns a Markdown table into a bordered HTML table and tab-separated text', () => {
    const { text, html } = copyFormats(table)
    expect(text).toBe('Item\tQty\nApples\t3\nPears\t12')
    expect(html).toContain('<table')
    expect(html).toContain('border-collapse:collapse')
    expect(html).toMatch(/<th[^>]*border:1px solid[^>]*>Item<\/th>/)
    expect(html).toMatch(/<td[^>]*text-align:right[^>]*>12<\/td>/)
  })

  it('keeps the words around a table', () => {
    const { text, html } = copyFormats(`Here you go:\n\n${table}\n\n**Done.**`)
    expect(text).toBe('Here you go:\n\nItem\tQty\nApples\t3\nPears\t12\n\n**Done.**')
    expect(html).toContain('<p>Here you go:</p>')
    expect(html).toContain('<strong>Done.</strong>')
  })

  it('keeps several tables apart', () => {
    const { text } = copyFormats('| A |\n| - |\n| 1 |\n\nand\n\n| B |\n| - |\n| 2 |')
    expect(text).toBe('A\n1\n\nand\n\nB\n2')
  })

  it('keeps empty cells, escaped pipes and non-English text', () => {
    const { text, html } = copyFormats('|  | 價格 |\n| - | - |\n| a \\| b |  |')
    expect(text).toBe('\t價格\na | b\t')
    expect(html).toContain('價格')
    expect(html).toContain('a | b')
    expect(html?.match(/<td/g)).toHaveLength(2)
  })

  it('takes Markdown marks off cells in the plain text only', () => {
    const { text, html } = copyFormats('| **Total** |\n| --- |\n| `x` |')
    expect(text).toBe('Total\nx')
    expect(html).toContain('<strong>Total</strong>')
  })

  it('keeps a line break in a cell', () => {
    const { text, html } = copyFormats('| A |\n| - |\n| one<br>two |')
    expect(text).toBe('A\none two')
    expect(html).toMatch(/one<br>\s*two/)
  })

  it('understands a table sent as tab-separated rows', () => {
    const tsv = '\tQ1\tQ2\nSales\t10\t\n'
    const { text, html } = copyFormats(tsv)
    expect(text).toBe(tsv)
    expect(html?.match(/<t[hd][ >]/g)).toHaveLength(6)
  })

  it('does not mistake ragged tabbed text for a table', () => {
    const text = 'name\tvalue\nsomething else'
    expect(copyFormats(text)).toEqual({ text })
  })

  it('unwraps a table sent in a code fence, but not other code', () => {
    expect(copyFormats('```markdown\n' + table + '\n```').html).toContain('<table')
    const code = '```js\nconst a = 1\n```'
    expect(copyFormats(code)).toEqual({ text: code })
  })

  it('escapes HTML in cells and drops raw HTML', () => {
    const { html } = copyFormats('| A |\n| - |\n| 1 < 2 & 3 |\n\n<script>alert(1)</script>')
    expect(html).toContain('1 &#x3C; 2 &#x26; 3')
    expect(html).not.toContain('<script')
    const tabs = copyFormats('<b>a</b>\tb\nc\td').html
    expect(tabs).not.toContain('<b>')
  })

  it('never puts a remote picture or an unsafe link in the HTML', () => {
    const md = '| A |\n| - |\n| ![pixel](https://evil.example/p.png) [go](javascript:alert(1)) [ok](https://example.com) |'
    const { html } = copyFormats(md)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('pixel')
    expect(html).toContain('<a href="https://example.com">ok</a>')
  })
})
