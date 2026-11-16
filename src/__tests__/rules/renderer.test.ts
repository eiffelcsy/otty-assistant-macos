// Renderer rules from CLAUDE.md, checked by reading the source:
// - "Web safety": answers never load remote images, and nothing in the renderer points at a remote address.
// - "UI icons are Flaticon UIcons…": no emoji in UI chrome; colours are tokens at the top of styles.css.
// - "Idle budget (NFR-3)": an `infinite` animation redraws all day, so each one is reviewed.
import { describe, expect, it } from 'vitest'
import { findIn, lineAt, read, sourceFiles, withoutComments } from './source'

const CODE = sourceFiles('src/renderer', /\.(ts|tsx)$/)
const CSS = sourceFiles('src/renderer', /\.css$/)
const STYLES = 'src/renderer/src/styles.css'

describe('CLAUDE.md "Web safety": the renderer never loads anything remote', () => {
  it('has no remote address in an src, url(…) or @import', () => {
    const remote = /(src=\{?\s*['"`]|url\(\s*['"]?|@import\s+['"]?)(https?:)?\/\//g
    const found = [...CODE, ...CSS, 'src/renderer/index.html'].flatMap((f) => findIn(f, remote, read(f)))
    expect(found).toEqual([])
  })

  it('embeds no other page, video or object', () => {
    const found = CODE.flatMap((f) => findIn(f, /<(iframe|video|audio|object|embed|source|link)\b/g))
    expect(found).toEqual([])
  })

  it('shows only our own pictures: every <img src> is a data: URL or a bundled frame', () => {
    // Reviewed: each of these is a data: URL made in main (snips, thumbnails, drawings) or an imported asset.
    const OK = new Set(['dataUrl', 'picture.dataUrl', 'file.thumb', 'idle', 'idleBlink', 'view.dataUrl', 'drawn.dataUrl'])
    const found = CODE.flatMap((f) =>
      [...withoutComments(read(f)).matchAll(/<img\b[^>]*\bsrc=\{([^}]+)\}/g)].filter((m) => !OK.has(m[1].trim())).map((m) => `${f}  src={${m[1]}}`)
    )
    expect(found, 'A new <img> must never take an address from an answer. Review it, then add it here.').toEqual([])
  })

  it('draws a Markdown picture as its words, never as an <img>', () => {
    const md = withoutComments(read('src/renderer/src/panel/Markdown.tsx'))
    expect(md).toMatch(/const components = \{[^}]*\bimg: NoRemoteImage\b/)
    const body = md.slice(md.indexOf('function NoRemoteImage'), md.indexOf('\n}\n', md.indexOf('function NoRemoteImage')))
    expect(body).not.toMatch(/\bsrc\b|<img/)
  })
})

describe('CLAUDE.md "UI icons are Flaticon UIcons": no emoji in UI chrome', () => {
  // Reviewed: these only take an emoji *out* of what the model wrote.
  const REVIEWED = [
    { file: 'src/renderer/src/panel/Markdown.tsx', char: '💡', why: 'strips the `> 💡` a tip arrives with; the card draws an Icon' },
    { file: 'src/renderer/src/lib/mathText.ts', char: '✔', why: 'turns a ✔ the model put in a formula into \\checkmark' }
  ]

  it('uses Icon, not emoji, in every component and string', () => {
    const found = CODE.flatMap((file) => {
      const code = withoutComments(read(file))
      return [...code.matchAll(/\p{Extended_Pictographic}/gu)]
        .filter((m) => !REVIEWED.some((r) => r.file === file && r.char === m[0]))
        .map((m) => `${file}:${lineAt(code, m.index)}  ${m[0]}`)
    })
    expect(found, 'Use <Icon name="…"> from components/Icon.tsx instead').toEqual([])
  })

  it('keeps every reviewed use where it was, so the list never goes stale', () => {
    expect(REVIEWED.filter((r) => !withoutComments(read(r.file)).includes(r.char))).toEqual([])
  })
})

/** Where the token block ends: after `:root { … }` and its dark-mode twin at the top of styles.css. */
function tokenBlockEnd(css: string): number {
  const dark = css.indexOf('@media (prefers-color-scheme: dark)')
  expect(dark, 'styles.css should open with :root tokens and their dark-mode block').toBeGreaterThan(-1)
  expect(css.slice(0, dark)).toMatch(/^[\s\S]*?:root \{[\s\S]*\n\}\n\s*$/)
  return css.indexOf('\n}\n', dark) + 3
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g

function hexOutsideTokens(): string[] {
  const css = read(STYLES)
  const end = tokenBlockEnd(css)
  const inStyles = [...css.matchAll(HEX)].filter((m) => m.index >= end).map((m) => `${STYLES}:${lineAt(css, m.index)}  ${m[0]}`)
  const elsewhere = [...CODE, ...CSS.filter((f) => f !== STYLES)].flatMap((f) => findIn(f, HEX, f.endsWith('.css') ? read(f) : undefined))
  return [...inStyles, ...elsewhere]
}

describe('CLAUDE.md "UI icons…": colours are tokens at the top of styles.css', () => {
  it('has no hex colour outside the token block', () => {
    expect(hexOutsideTokens(), 'Use a var(--token) from the top of styles.css').toEqual([])
  })
})

describe('CLAUDE.md "Idle budget (NFR-3)": every infinite animation is reviewed', () => {
  // Each runs only while its window is awake (`data-asleep` pauses it) or while Otty is working.
  const REVIEWED: Record<string, string> = {
    blink: 'the otter blinks: stepped, 5 s, one frame change',
    float: 'the idle bubble: steps(8) over 1.5px, measured at 0.35% of a core against 1.6% smooth',
    bob: 'thinking only, while an answer runs',
    rise: 'thinking only, while an answer runs',
    glow: 'while working only',
    dots: 'typing dots, stepped, while an answer runs'
  }

  it('adds no infinite animation without measuring it', () => {
    const css = withoutComments(read(STYLES))
    const names = [...css.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)].map((m) => m[1])
    expect(
      names.filter((n) => !(n in REVIEWED)),
      'Step it or run it briefly, measure with OTTY_METRICS=1, then add it here with the reason it stays under budget'
    ).toEqual([])
  })
})
