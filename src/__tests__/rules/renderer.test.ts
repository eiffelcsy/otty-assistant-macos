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
    const OK = new Set(['dataUrl', 'picture.dataUrl', 'file.thumb', 'FRAMES[state]', 'idleBlink', 'view.dataUrl', 'drawn.dataUrl',
      // the cove's imported paintings (D-72)
      'PAINTINGS[t][0]', 'PAINTINGS[t][1]', 'cloud', 'reeds', 'lilypad', 'float'])
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
    float: 'the idle bubble: 6 s in steps(10) over 1.5px (DESIGN.md, Motion); 4 s in steps(8) measured 0.35% of a core against 1.6% smooth',
    bob: 'thinking only, while an answer runs',
    rise: 'thinking only, while an answer runs',
    glow: 'while working only',
    dots: 'typing dots, stepped, while an answer runs',
    caret: 'the streaming caret: two steps every 1.2 s, only while an answer streams',
    'log-step': 'the Logbook’s Now dot: two steps every 2.4 s, only while a look-up runs and the Logbook is open'
  }

  it('adds no infinite animation without measuring it', () => {
    const css = withoutComments(read(STYLES))
    const names = [...css.matchAll(/animation:\s*([\w-]+)[^;]*\binfinite\b/g)].map((m) => m[1])
    expect(
      names.filter((n) => !(n in REVIEWED)),
      'Step it or run it briefly, measure with OTTY_METRICS=1, then add it here with the reason it stays under budget'
    ).toEqual([])
  })

  it('never repeats a Motion animation, which no data-asleep can pause', () => {
    const found = CODE.flatMap((f) => findIn(f, /\brepeat:\s*Infinity|\brepeatType\b/g))
    expect(found, 'Ambient motion stays in CSS, stepped').toEqual([])
  })
})

describe('DESIGN.md "Motion": Motion moves with the CSS tokens (lib/motion.tsx)', () => {
  const token = (name: string) => read(STYLES).match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim()
  const lib = read('src/renderer/src/lib/motion.tsx')

  it('has the --t-* durations', () => {
    const T = Object.fromEntries([...lib.match(/export const T = \{([^}]+)\}/)![1].matchAll(/(\w+): ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]))
    expect(Object.keys(T)).toEqual(['tap', 'quick', 'settle', 'travel', 'drift'])
    for (const [name, s] of Object.entries(T)) {
      const v = token(`t-${name}`)!
      expect(v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v), name).toBe(s)
    }
  })

  it('has the curves', () => {
    for (const name of ['glide', 'ebb']) {
      const curve = lib.match(new RegExp(`export const ${name} = \\[([^\\]]+)\\]`))![1]
      expect(token(name), name).toBe(`cubic-bezier(${curve})`)
    }
  })
})

describe('DESIGN.md "Foundations": sizes, spaces, radii and weights come from the scale (D-59)', () => {
  // Component metrics DESIGN.md writes down off the 4px grid. Keep this list short: every entry is a spec, not a shortcut.
  const OFF_SCALE = [
    { selector: '.msg__bubble', prop: 'padding', why: 'user bubble, 10 14 (Components, Message)' },
    { selector: '.btn', prop: 'padding', why: 'button, 0 14 (Components, Button)' },
    { selector: '.btn--large', prop: 'padding', why: 'large button, 0 18 (Components, Button)' },
    { selector: '.composer__input', prop: 'padding', why: 'centres 22px lines in the 32px row (Components, Composer)' },
    { selector: '.quick__answer', prop: 'padding', why: 'lines the answer up with the box beside the 34px otter' },
    { selector: '.ask', prop: 'gap', why: 'confirm card glyph to title, 10 (Spec 01, Confirm card)' },
    { selector: '.log-entry__open', prop: 'padding', why: 'Logbook entry, 10 0, so one line is 40 and two are 58 (Spec 04, Entry)' },
    { selector: '.log-entry__open', prop: 'gap', why: 'Logbook entry columns, 10 apart (Spec 04, Entry)' },
    { selector: '.log-now__progress', prop: 'gap', why: 'progress segments, 3 apart (Spec 04, Now)' }
  ]
  const RADIUS = /^(0|50%|25%|var\(--(r-\w+|radius)\)|calc\(var\(--(r-\w+|radius)\) [+-] var\(--s-\w+\)\))$/
  const OK: [RegExp, RegExp][] = [
    [/^font-size$/, /^var\(--(fs|i)-\w+\)$/],
    [/^font-weight$/, /^(500|600|700|800)$/],
    [/^(padding(-\w+)?|(row-|column-)?gap)$/, /^(0|var\(--s-\w+\))$/],
    [/^border(-\w+)*-radius$/, RADIUS]
  ]

  function offScale(): string[] {
    const css = read(STYLES)
    const end = tokenBlockEnd(css)
    const body = withoutComments(css).slice(end)
    const found: string[] = []
    for (const rule of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().replace(/\s+/g, ' ')
      for (const [, prop, value] of rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
        const check = OK.find(([p]) => p.test(prop))
        if (!check) continue
        const parts = check[1] === RADIUS ? [value.trim()] : value.trim().split(/\s+(?![^(]*\))/)
        if (parts.every((v) => check[1].test(v))) continue
        if (OFF_SCALE.some((o) => o.selector === selector && prop.startsWith(o.prop))) continue
        found.push(`${STYLES}:${lineAt(css, end + (rule.index ?? 0))}  ${selector} { ${prop}: ${value.trim()} }`)
      }
    }
    return found
  }

  it('uses only foundation tokens for font-size, font-weight, padding, gap and border-radius', () => {
    expect(offScale(), 'Use --s-*, --fs-*, --i-* or --r-* from the top of styles.css (docs/DESIGN.md, Foundations)').toEqual([])
  })

  it('keeps the off-scale list short and live', () => {
    expect(OFF_SCALE.length).toBeLessThanOrEqual(10)
    const css = withoutComments(read(STYLES))
    expect(OFF_SCALE.filter((o) => !css.includes(`\n${o.selector} {`))).toEqual([])
  })
})

describe('DESIGN.md "Colour roles": text passes WCAG AA wherever it sits, light and dark (D-59)', () => {
  type RGB = [number, number, number]

  /** The custom properties of a `:root { … }` block, with var() resolved against `base`. */
  function tokens(block: string, base: Record<string, string> = {}): Record<string, string> {
    const own = Object.fromEntries([...block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]))
    const all = { ...base, ...own }
    const resolve = (v: string): string => v.replace(/var\((--[\w-]+)\)/g, (_, n: string) => resolve(all[n] ?? ''))
    return Object.fromEntries(Object.keys(all).map((k) => [k, resolve(all[k])]))
  }

  /** A colour as RGB, with any alpha laid over `under`. */
  function colour(v: string, under?: RGB): RGB {
    const hex = v.match(/^#([0-9a-f]{6})$/i)
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as RGB
    const rgba = v.match(/^rgba\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)$/)
    if (!rgba || !under) throw new Error(`Can't read the colour ${v}`)
    const [r, g, b, a] = rgba.slice(1).map(Number)
    return [r, g, b].map((c, i) => c * a + under[i] * (1 - a)) as RGB
  }

  const luminance = (c: RGB) => {
    const [r, g, b] = c.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a: RGB, b: RGB) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  const css = read(STYLES)
  const dark = css.indexOf('@media (prefers-color-scheme: dark)')
  const light = tokens(css.slice(0, dark))
  const themes = { light, dark: tokens(css.slice(dark, tokenBlockEnd(css)), light) }

  // --text-3 is left out on purpose: placeholders and disabled only, never information.
  const TEXT = ['--text', '--heading', '--text-2', '--brand-text', '--straw-ink']
  const PAIRS: [string, string, string?][] = [
    ...TEXT.flatMap((t) => ['--bg', '--surface', '--surface-2'].map((s): [string, string] => [t, s])),
    ...TEXT.map((t): [string, string, string] => [t, '--straw-soft', '--bg']),
    ['--text', '--brand-soft', '--surface'],
    ['--brand-text', '--brand-soft', '--bg'],
    ['--brand-ink', '--brand-fill'],
    ['--danger-ink', '--danger-soft'],
    ['--silver', '--fur']
  ]

  for (const [name, t] of Object.entries(themes)) {
    it(`${name}: every text role reaches 4.5:1 on what it sits on`, () => {
      const low = PAIRS.flatMap(([fg, bg, under]) => {
        const back = colour(t[bg], under ? colour(t[under]) : undefined)
        const ratio = contrast(colour(t[fg], back), back)
        return ratio < 4.5 ? [`${fg} on ${bg}: ${ratio.toFixed(2)}:1`] : []
      })
      expect(low).toEqual([])
    })
  }

  describe('the cove, full bleed (D-74, Spec 07 Part 5): every word on it is readable, and the glass is no thicker than that needs', () => {
    // From `.venv/bin/python tools/otty-art/prepare.py --patches` (2026-11-21): the darkest and lightest patch anywhere
    // (under glass), behind the greeting (sky) and behind the header's icons (top), and the water's bottom colour.
    // Copy its lines here when a painting changes.
    const PAINTINGS = {
      dawn: { glass: [[34, 83, 135], [253, 216, 159]], sky: [[161, 133, 156], [253, 206, 160]], top: [[153, 157, 202], [225, 189, 189]], deep: '#345d8d' },
      day: { glass: [[26, 111, 133], [253, 250, 240]], sky: [[150, 166, 116], [248, 238, 208]], top: [[143, 201, 226], [254, 251, 240]], deep: '#267888' },
      golden: { glass: [[45, 45, 56], [251, 237, 135]], sky: [[133, 78, 34], [251, 215, 65]], top: [[205, 140, 100], [245, 178, 85]], deep: '#37323a' },
      night: { glass: [[3, 23, 49], [222, 218, 209]], sky: [[8, 36, 73], [61, 100, 145]], top: [[8, 35, 78], [230, 224, 214]], deep: '#042248' }
    } satisfies Record<string, { glass: RGB[]; sky: RGB[]; top: RGB[]; deep: string }>
    type Painting = keyof typeof PAINTINGS
    const t = themes.light // the cove's tokens are set once, in :root, whatever the appearance
    /** A painting under one glass, and its tokens' suffix: light glass by day, dark in dark mode, and the night only dark. */
    type Look = { p: Painting; dark: boolean; name: string }
    const LOOKS: Look[] = [
      ...(['dawn', 'day', 'golden'] as const).flatMap((p) => [
        { p, dark: false, name: p },
        { p, dark: true, name: `dark-${p}` }
      ]),
      { p: 'night', dark: true, name: 'night' }
    ]
    const roles = ({ dark }: Look) =>
      dark
        ? ['--cv-night-text', '--cv-night-heading', '--cv-night-text-2', '--cv-night-brand-text', '--cv-night-straw-ink']
        : ['--text', '--heading', '--cv-text-2', '--cv-brand-text', '--cv-straw-ink']
    // Words on the bare painting follow the painting, not the glass: only the night has light ink.
    const ink = ({ p }: Look) => colour(t[p === 'night' ? '--cv-night-ink' : '--cv-ink'])
    const sub = ({ p }: Look) => colour(t[p === 'night' ? '--cv-night-sub' : '--cv-sub'])

    /** The backdrop filter's colour steps, in CSS's order (saturate, contrast, brightness), on one colour. */
    function frost(c: RGB, filter: string): RGB {
      const n = (f: string) => Number(filter.match(new RegExp(`${f}\\(([\\d.]+)\\)`))?.[1] ?? NaN)
      const [s, k, b] = [n('saturate'), n('contrast'), n('brightness')]
      expect([s, k, b].every(Number.isFinite), `Can't read the filter ${filter}`).toBe(true)
      const clip = (v: number) => Math.min(255, Math.max(0, v))
      const m = [
        [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
        [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]
      ]
      return m.map((row) => clip(row[0] * c[0] + row[1] * c[1] + row[2] * c[2])).map((v) => clip(clip(((v / 255 - 0.5) * k + 0.5) * 255) * b)) as RGB
    }
    /** The same colour with another alpha, to find the least that passes. */
    const withAlpha = (v: string, a: number) => v.replace(/[\d.]+\)$/, `${a})`)
    const alpha = (v: string) => Number(v.match(/([\d.]+)\)$/)![1])
    /** The least alpha (to .01) at which `passes` holds, or null if none does. */
    const least = (passes: (a: number) => boolean) => [...Array(101).keys()].map((i) => i / 100).find(passes) ?? null

    // The cove's glass is held to 3.5:1, not 4.5:1 (owner's call, 2026-11-21): at 4.5 it has to cover the painting to stay
    // readable over the brightest sky a card can scroll across, and it stops reading as glass. Over the water, where the
    // cards usually sit, it's well above that. Words on the bare painting keep their own checks below.
    const GLASS = 3.5
    const glassPasses = (l: Look, tint: string) => (a: number) =>
      PAINTINGS[l.p].glass.every((under) => {
        const back = colour(withAlpha(tint, a), frost(under, t[l.dark ? '--cv-frost-dark' : '--cv-frost-light']))
        return roles(l).every((fg) => contrast(colour(t[fg]), back) >= GLASS)
      })
    const skyPasses = (l: Look, halo: string) => (a: number) =>
      PAINTINGS[l.p].sky.every((under) => {
        const back = colour(withAlpha(halo, a), under)
        return contrast(ink(l), back) >= 3 && contrast(sub(l), back) >= 4.5 // the greeting is large text; the rest isn't
      })
    const topPasses = (l: Look, scrim: string) => (a: number) =>
      PAINTINGS[l.p].top.every((under) => contrast(sub(l), colour(withAlpha(scrim, a), under)) >= 3) // icons: 3:1

    const CHECKS: [string, string, (l: Look, v: string) => (a: number) => boolean][] = [
      ['glass', '3.5:1 for every text role on glass', glassPasses],
      ['halo', '3:1 for the greeting and 4.5:1 for its sentence on the sky', skyPasses],
      ['top', "3:1 for the header's icons on the sky", topPasses]
    ]
    for (const l of LOOKS) {
      for (const [kind, what, passes] of CHECKS) {
        if (kind !== 'glass' && l.dark && l.p !== 'night') continue // dark mode by day shares the light halo and scrim
        const token = `--cv-${kind}-${l.name}`
        it(`${l.name}: ${token} gives ${what}, with at most .03 to spare`, () => {
          const v = t[token]
          const min = least(passes(l, v))
          expect(min, `${token}: nothing passes`).not.toBeNull()
          expect(passes(l, v)(alpha(v)), `${token} at ${alpha(v)} fails; it needs ${min}`).toBe(true)
          // Never opaque just to pass: D-72's 90% glass passed by hiding the painting.
          expect(alpha(v), `${token} at ${alpha(v)} hides more of the cove than it needs (${min})`).toBeLessThanOrEqual(min! + 0.03)
        })
      }
    }
    for (const p of Object.keys(PAINTINGS) as Painting[]) {
      it(`${p}: --cv-deep-${p} is the water's own colour`, () => {
        expect(t[`--cv-deep-${p}`]).toBe(PAINTINGS[p].deep)
      })
    }

    it('reads the filter the way CSS applies it', () => {
      expect(frost([128, 128, 128], 'saturate(1) contrast(1) brightness(1)')).toEqual([128, 128, 128])
      expect(frost([0, 0, 0], 'saturate(1) contrast(0.6) brightness(1.5)').map(Math.round)).toEqual([77, 77, 77])
    })
  })
})
