# Spec 08 · One cove: the whole app in the cove's language

**Status:** foundation built (tokens, the hour on every window, contrast tests); screens in build, in five packages (Part 6). Builds on Spec 07 (the cove, its glass and its measured roles), Spec 05 (the frame) and DESIGN.md ("Foundations", "Motion").

**Why.** Spec 07 made Home and the empty chat Otty's place: a painted cove by the hour, words on glass. Every other screen is still the old paper app: flat beige with a white header, cards in four different radii, a hard cyan strip over a chat with content, and a welcome page on plain paper. Moving from Home to Settings feels like leaving one app for another. This spec carries the cove's language into every view, so the whole window is one place at one hour, and nothing is left for the build to decide.

## Part 1 · Principles

1. **Every screen is in the cove; depth says where you are.** Home and the empty chat are the surface (the full painting, Spec 07). Every other screen is the shallows: the hour's **mist** (paper with a little of the painting in it) fills the window, and the painting itself shows only through the **header band**, under glass.
2. **The hour colours everything.** The mist, the sidebar and the header band follow the same clock as the painting (`data-time` on every window's root), so the app is warmer at golden hour and cooler at night without a word.
3. **Content sits on glass.** One family of surfaces, named once (Part 3): paper glass on the mist, solid glass for what floats, the cove's own glass over the painting. The glass's lit rim and soft lift are its edge; nothing inside adds another.
4. **Words follow the surface they sit on.** The text roles are the cove's darker ones everywhere, because every surface is now tinted.
5. **Water, not springs.** No new motion; screens move as Spec 05 already says, and nothing new runs while idle.

## Part 2 · The hour on every window (built)

`main.tsx` sets `data-time` (`dawn | day | golden | night`, `coveTime`) and `data-glass` (`coveGlass`) on `<html>` for every view but the bubble, with one timer (`untilNextCove`) and a listener on the appearance. `:root[data-time=…]` picks the hour's mist. The preview's `&time=` pins it, as it pins the painting.

## Part 3 · Tokens (built)

**Mist.** Paper mixed with the painting's average sky (top) and water (bottom), measured from the paintings in `assets/cove/` (sky: the shore half's top 40%; water: the whole water half). Light mixes 14% (10% at night, whose navy would grey the paper); dark mixes 18% into `#1f1c1d`. `--mist-side` is the sky at half strength, for the nav and the list column.

| Painting | Light top / bottom / side | Dark top / bottom / side |
| --- | --- | --- |
| Dawn | `#ebe7e5` / `#e6e3e0` / `#efece8` | `#39353c` / `#333035` / `#2c292c` |
| Day | `#e8ece9` / `#e3e7e1` / `#eeefe9` | `#363c40` / `#2f3636` / `#2b2c2f` |
| Golden | `#f1e5d7` / `#e5dcd1` / `#f3ebe0` | `#423329` / `#322822` / `#302823` |
| Night | `#dddedc` / `#dededc` / `#e9e7e3` | `#1c2029` / `#1d2129` / `#1e1e23` |

**Glass on the mist.**

| Token | Light | Dark | For |
| --- | --- | --- | --- |
| `--mist-card` | white .62 | warm white .05 | Paper glass fill |
| `--mist-field` | white .5 | black .16 | Fields |
| `--glass-lift` | top light .9, white rim .5, 0.5 px edge, two soft shadows | the same, smoked | Paper glass edge |
| `--glass-lift-float` | top light, edge, a deeper lift | smoked | Solid glass edge |

Under Reduce transparency or Increase contrast, `--mist-card` is `--surface` and `--mist-field` is `--bg`.

**Text roles** take the cove's values everywhere: light `--text-2` `#50473d`, `--brand-text` `#4a5e30`, `--straw-ink` `#5f4c22`; dark `--text-2` `#bcb29c`, `--brand-text` `#b0bf8c`, `--straw-ink` `#d9caa2` (dark's two lifted a step past the night roles, so they pass on paper glass). `rules/renderer.test.ts` checks every role at 4.5:1 on every mist, and on paper glass over every mist, in both themes.

## Part 4 · Recipes

Every surface in the app is one of these. The build applies them by name; it never picks a colour, shadow or radius.

| Recipe | Declarations | Is |
| --- | --- | --- |
| **MIST** | `background: linear-gradient(180deg, var(--mist-top), var(--mist-bottom));` | A window's backdrop |
| **SIDE** | `background: var(--mist-side);` | The nav and the list column |
| **GLASS** | `background: var(--mist-card); box-shadow: var(--glass-lift);` and remove any `border` whose colour is `--hairline` or `--hairline-strong` (straw, brand and danger borders stay). If its radius was `var(--r-md)` it becomes `var(--r-lg)`; `var(--r-sm)` stays unless the table says otherwise | Paper glass: cards, groups, blocks, bars on the mist |
| **FLOAT** | `background: var(--surface); box-shadow: var(--glass-lift-float);` | Solid glass over content: menus, popovers, dialogs, toasts |
| **FIELD** | `background: var(--mist-field);` (its border stays) | Text fields, search fields, recorders, radio rows |
| **TINT** | `background: var(--fill-strong);` | Recessed content inside an answer or card: code, table heads, stages |
| **CLEAR** | `background: transparent;` | Surfaces the band or the mist now shows through |

Focus and state rules that combine a shadow: a GLASS element's `box-shadow: var(--elev-N), var(--ring)` becomes `box-shadow: var(--glass-lift), var(--ring)`, and `var(--elev-1), inset 0 0 0 1px var(--straw)` becomes `var(--glass-lift), inset 0 0 0 1px var(--straw)`; the same inside keyframes.

**Catch-all,** for a rule inside a package's sections that the tables below don't name: `background: var(--surface)` with `--elev-1` or `--elev-2` is GLASS; with `--elev-3` it's FLOAT; `background: var(--surface-2)` is TINT; `background: var(--bg)` on a field (an input, select, textarea, or a class with `field`, `find` or `search` in it) is FIELD, on anything else GLASS. Left alone everywhere: buttons, switches and their knobs, send, the language pill, the tooltip (`--fur`), straw/brand/danger/ok fills, `--fill` and `--fill-strong` hovers, and the bubble window.

## Part 5 · Every view

### The frame (all panel screens)

| Selector | Now | Becomes |
| --- | --- | --- |
| `.panel` | `--bg` | MIST |
| `.panel__header` | `--surface` | CLEAR |
| `.frame__list-head` | `--bg` | CLEAR |
| `.frame__nav` | `--surface-2` | side glass over the haze (Part 8; its hairline stays) |
| `.frame__list` | none | side glass over the haze (Part 8) |
| `.nav-btn__dot` | ring `0 0 0 2px var(--surface-2)` | ring `0 0 0 2px var(--mist-side)` |
| `.nav-btn__mark` | surface, elev-1 | GLASS (radius stays `--r-sm`) |
| `.pause-card` | surface, elev-1, r-md | GLASS (r-lg) |
| `kbd` | `--surface-2` | TINT |

**The header band on every screen.** The quiet wash (Spec 07) becomes every shallow screen's header: `Panel.tsx` passes `cove="full"` for Home and the empty chat and `cove="wash"` for every other screen (a chat with content, Chats, Logbook, Notebook, Settings, pushed pages). The list column has no band: it's side glass top to bottom, with the nav (Part 8). The band's lower edge is one hairline at all times: the wash header rule gains `border-bottom-color: transparent; box-shadow: 0 1px 0 var(--hairline);`.

### Chat, answers and the message box

| Selector | Becomes |
| --- | --- |
| `.md pre`, `.md .code-block`, `.md th` | TINT |
| `.explain-card` | FLOAT (its `.explain-card__lang` keeps `--surface`) |
| `.confirm-card, .notice-card, .step-card` (the shared card rule) | GLASS (r-lg) |
| `.msg--otty .error-card` | GLASS |
| `.ok-card` | radius `--r-lg` (fill stays) |
| `.new-text` | FLOAT |
| `.message-box:not(.message-box--bare)` and its `:focus-within` | GLASS (radius stays); focus `var(--glass-lift), var(--ring)` |
| `.context-card` | GLASS (r-lg) |
| `.file-chip` | GLASS (r-sm stays) |
| `.action:hover:not(:disabled)` | `background: var(--mist-card); box-shadow: var(--glass-lift);` |
| `.drop-veil` | `color-mix(in srgb, var(--mist-top) 88%, transparent)` |

`.tip-card` (straw), the user bubble, the receipts and chips are unchanged.

### Cards inside answers

| Selector | Becomes |
| --- | --- |
| `.tile-card`, `.fixed-card` | GLASS (r-lg) |
| `.menu` | FLOAT (radius stays) |
| `.memory-list` | GLASS, radius `--r-lg` |
| `.calc-card` | GLASS (r-lg) |
| `.hidden-sheet` | FLOAT |
| `.drawing-card` | GLASS (r-lg); `.drawing-card__stage` TINT; `.drawing-card__count` FLOAT |
| `.ask:focus-visible`, `.ask--unusual`, `.ask--ring`'s keyframe | the combined rules in Part 4 |
| The rewind card ("Before Try again or Edit") | by the catch-all |

### Settings and the welcome

| Selector | Becomes |
| --- | --- |
| `.field`, `.choice`, `.set-find`, `.recorder` | FIELD |
| `.set-group__box` | GLASS (r-lg) |
| `.perm-row` | GLASS (r-lg) |

**The welcome is the first cove anyone sees.** Onboarding moves from plain paper onto the full cove, as the empty chat: the painting behind everything, the page's title and sentence on the sky in Hero type with the halo, Otty floating in the water (the float pose, `CoveOtty`, in place of the bust), and the page's content in one glass block below. Markup, replacing the root of `Onboarding.tsx`:

```tsx
<div className="frame frame--compact">
  <main className="frame__main frame__main--cove frame__main--full">
    <Cove mode="full" />
    <div className="frame__body">
      <div className="onboarding">
        <div className="cove-hero">
          <div className="cove-hero__words">
            <h2 className="cove-hero__hello">{HERO[step][0]}</h2>
            <p className="cove-hero__sentence">{HERO[step][1]}</p>
          </div>
          <CoveOtty />
        </div>
        <div className="onboarding__block">
          {/* the steps dots, then the step's page, as today, less the bust, its h2 and the paragraph now in the hero */}
        </div>
      </div>
    </div>
  </main>
</div>
```

| Step | Title (h2) | Sentence | Kept in the block |
| --- | --- | --- | --- |
| 0 | Hi! I’m Otty | Highlight text or snap your screen, and I’ll explain it in plain words. | The language question, Let’s get started |
| 1 | Choose Otty’s brain | Otty needs an AI service to think. Keys stay locked in your Mac’s Keychain. | Fields, Save & test, the result, Next |
| 2 | Two quick permissions | Otty only looks when you ask. | “macOS asks you to approve these so Otty can see what you point it at.”, the two rows, the tip, the button |

CSS: `.onboarding` becomes `-webkit-app-region: drag; height: 100%; overflow-y: auto; display: flex; flex-direction: column;` (no padding). New `.onboarding__block`: `-webkit-app-region: no-drag; width: calc(100% - 2 * var(--s-4)); max-width: 440px; margin: 0 auto var(--s-4); padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); text-align: center;`. `.onboarding__page` loses `margin: auto 0`; `.onboarding__page h2` is deleted. `.onboarding__block` joins the cove's glass: each `.frame__main--full :is(…)` list in the cove section that holds `.try` also holds `.onboarding__block`, and so does the Reduce transparency list.

### Quick view, Chats, find, Pick up text, the viewer and the Logbook

| Selector | Becomes |
| --- | --- |
| `.quick__card` | MIST, with `box-shadow: var(--glass-lift-float)` |
| `.quick__box` and its `:focus-within` | GLASS; focus `var(--glass-lift), var(--ring)` |
| A selected or current chat row in `.history` | by the catch-all |
| `.forget-dialog` | FLOAT |
| `.find-bar` | GLASS |
| `.find-bar__field` | FIELD |
| `.pickup` | MIST (radius stays) |
| `.context-picture__pickup` | GLASS; its hover `--surface-2` becomes `--surface` |
| `.log-now` | GLASS (r-lg) |
| `.log-day__head` | `background: color-mix(in srgb, var(--mist-top) 82%, transparent); backdrop-filter: blur(12px);` |
| `.log-block__card` | GLASS, radius `--r-lg` |
| `html[data-view='viewer'] body`, `.viewer` | MIST |
| `.viewer__close` | FLOAT |

The bubble is the otter, not a window of words: unchanged.

## Part 8 · The frosted side (owner's call, 2026-11-21)

The first build gave the nav and list column a flat hour-tinted paper. Beside the painting it read as a different material. Now they're **frosted glass over the hour's painting**, the way a Mac sidebar frosts the desktop behind it, but showing Otty's cove rather than the wallpaper.

- **The haze.** `prepare.py` writes `assets/cove/haze-{hour}.webp`: the painting at 192 × 128, Gaussian-blurred 6 px, under 1 KB each. `.frame__haze` lies behind the whole frame (`z-index: -1` in the frame's own stacking context), `cover`, centred, picked by `:root[data-time]`. A pre-blurred picture scales up smooth, so nothing blurs at run time and resizing costs nothing.
- **The side glass.** `.frame__nav` and `.frame__list` are `--side-glass`: paper (`#f4f1ea` light, `#1f1c1d` dark) at the least alpha that keeps every text role at 4.5:1 over the haze's darkest and lightest pixel, plus .02. Light: dawn .79, day .76, golden .83, night .86. Dark: dawn .80, day .83, golden .81, night .56. So 15–45% of the hour's colour comes through. `rules/renderer.test.ts` checks each both ways (passes, and at most .03 thicker than needed); `prepare.py --patches` re-measures a haze.
- Selected items and the Pause card stay paper glass (`--mist-card`, `--glass-lift`), which reads as a lit tile on the frost.
- In the compact band there's no side, and the main column covers the haze.

## Part 9 · Leaving the cove (owner's call, 2026-11-21)

The first build rolled the painting up to the header over 1.4 s (`height` on `.cove`), with the new page's words drawn over the bare painting as it went: cheap, and slow. Now **the painting never moves; the mist rises over it.**

- `.cove` is full height in both modes. Its `::after` is the mist (the same gradient as MIST) from `--header-h` down, opacity 0 in `full` and 1 in `wash`.
- Going from the surface to a shallow screen, the mist comes in over `--t-quick` on `--glide`, together with the screen's own fade (Spec 05, W4), so words never sit on the bare painting. Coming back to Home or the empty chat, it clears over `--t-settle`, so the cove surfaces more slowly than it goes. Sending the first question in an empty chat is the same move.
- The header's glass and painted band don't change: they're the same in both modes.
- Reduced motion: the fade only, as everywhere. The painting under the mist is static, so idle cost is unchanged.

## Part 6 · Build packages

Five packages, each in its own sections of `styles.css` and its own components, so they merge without overlap. Each keeps every comment true (edit a comment that names an old surface), uses tokens only, and passes `npm run typecheck` and `npm test`.

| Package | `styles.css` sections (by their `/* ---------- */` headings) | Components |
| --- | --- | --- |
| A · Frame | top base rules (`kbd`), Panel shell, The frame, The living cove (the wash selectors only) | `frame/Frame.tsx`, the `cove=` line in `panel/Panel.tsx` |
| B · Chat | Icon button through Composer, and the composer's tray, files and quick actions (up to Buttons & fields) | none |
| C · Settings and welcome | Buttons & fields, Settings & onboarding, Settings in sections; the cove's glass lists (for `.onboarding__block` only) | `panel/Onboarding.tsx` |
| D · Cards | Proofread card, What Otty learns, Math, Step cards, Under a question / hidden lines, Drawings, Before Try again, Confirm cards and receipts | none |
| E · Elsewhere | Quick view, Recent chats, Find in this chat, Pick up text, Logbook, Quick view follow-ups, Copy diagnostics, The bigger view (viewer) | none |

C and A both touch the cove section, in different rules: A the wash header rules, C the `:is(…)` glass lists.

## Part 7 · Done when

- Every scene in `tools/ui-preview`, light and dark, at 420 and 1200: no screen shows plain `--bg` paper, a white header or a `--surface-2` box; every header in the frame shows the hour's band; every card on the mist has the glass edge.
- `&time=dawn|day|golden|night` changes the mist on every view, Quick view and Pick up text included.
- The welcome at 420 × 580 shows the cove with the hero words and Otty in the water, and its block scrolls on step 1.
- `npm test` (with the mist contrast pairs) and `npm run typecheck` pass. `npm run screens` will differ on almost every scene: the baseline update is its own PR (CLAUDE.md).
- Idle cost unchanged: nothing new animates; the band is the existing wash.
