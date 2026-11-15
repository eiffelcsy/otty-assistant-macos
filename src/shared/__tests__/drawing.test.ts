import { describe, expect, it } from 'vitest'
import { cleanMermaid, drawingKind, retryPrompt, shortError, svgDataUrl } from '../drawing'

describe('drawings', () => {
  it('knows which blocks are drawings', () => {
    expect(['mermaid', 'SVG', 'slides', 'python', null].map(drawingKind)).toEqual(['mermaid', 'svg', 'slides', null, null])
  })

  it('takes out directives and click lines before Mermaid sees them', () => {
    const code = '%%{init: {"securityLevel": "loose"}}%%\nflowchart LR\n  A --> B\n  click A href "https://evil.example"\n  click B call alert()'
    expect(cleanMermaid(code)).toBe('flowchart LR\n  A --> B')
  })

  it('strips the directive a hostile page got a model to copy (seen in the eval)', () => {
    expect(cleanMermaid('%%{init: {"securityLevel": "loose"}}%%\nflowchart TD\n    A["Sort"] --> B["Collect"]')).toBe('flowchart TD\n    A["Sort"] --> B["Collect"]')
  })

  it('makes a picture address and a friendly retry', () => {
    expect(svgDataUrl('<svg/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E')
    expect(shortError(new Error('Parse error on line 3:\n...A-->\n----^'))).toBe('Parse error on line 3:')
    expect(retryPrompt('mermaid', 'Parse error on line 3:')).toMatch(/^The drawing didn't come out right \(Parse error on line 3:\)/)
  })
})
