// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeSvg, svgSize } from '../sanitize'

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${inner}</svg>`

describe('sanitizeSvg', () => {
  it('keeps shapes, text and local references', () => {
    const out = sanitizeSvg(wrap('<defs><marker id="m"/></defs><rect width="10" height="10" fill="url(#g)"/><path marker-end="url(#m)" d="M0 0L1 1"/><text x="1" y="2">Hi</text>'))!
    expect(out).toContain('<rect')
    expect(out).toContain('url(#g)')
    expect(out).toContain('marker-end="url(#m)"')
    expect(out).toContain('>Hi</text>')
  })

  it('removes everything active or remote', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '<rect onload="alert(1)" onclick="alert(2)"/>',
      '<image href="https://evil.example/p.png"/>',
      '<use href="https://evil.example/s.svg#x"/>',
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml"><img src="https://evil.example/p"/></div></foreignObject>',
      '<a href="javascript:alert(1)"><text>x</text></a>',
      '<style>@import url(https://evil.example/s.css); rect { fill: url(https://evil.example/f) }</style>',
      '<rect style="fill: url(https://evil.example/f)"/>',
      '<animate attributeName="href" to="javascript:alert(1)"/>'
    ]
    for (const attack of attacks) {
      const out = sanitizeSvg(wrap(attack)) ?? ''
      expect(out, attack).not.toMatch(/evil\.example|javascript:|<script|onload|onclick|foreignObject|<image|<animate/i)
    }
  })

  it('refuses what isn’t an SVG, and adds a missing namespace', () => {
    expect(sanitizeSvg('<div>hi</div>')).toBeNull()
    expect(sanitizeSvg('<svg viewBox="0 0 1 1"><rect/></svg>')).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  })
})

describe('svgSize', () => {
  it('reads the viewBox, then width and height', () => {
    expect(svgSize('<svg viewBox="0 0 640 320">')).toEqual({ width: 640, height: 320 })
    expect(svgSize('<svg width="300" height="150">')).toEqual({ width: 300, height: 150 })
    expect(svgSize('<svg>')).toEqual({ width: 800, height: 600 })
  })
})
