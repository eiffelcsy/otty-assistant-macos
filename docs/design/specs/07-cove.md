# Spec 07 · The cove, full bleed

**Status:** built (D-74, 2026-11-21; CHANGELOG). Where the build differs from the first draft, this spec was changed to match: the now line sits first in the column (under the greeting it collided with Otty in the compact band), the wash keeps only the band behind the header (a fade below it put answers over the painting), and a health notice pushes the hero down under the header. Reworks how D-72's living cove is laid out; the paintings, the hour cross-fade, the arrival, the pointer depth and the ripples stay as built. Builds on Spec 06 (Home's blocks and their data), Spec 05 (the frame and bands), Spec 03 (the message box), DESIGN.md ("Foundations", "Motion", "Signature moments") and the draft's "The living cove" (the Otty Window Draft artifact, v0.8).

**Why.** D-72 shipped the cove as a picture strip: 232–300 px of painting between an opaque header and an opaque page, the greeting below it on paper, Otty hanging in the sky above the water, and cards at 90% opaque that the cove "eases back" behind. It passed its contrast test by hiding the painting. Side by side with the draft at 960 × 660 it reads as a banner on a settings page, not as Otty's place. This spec gets the draft's composition back by making the glass work honestly, not by making it opaque, and it measures every number on the real paintings.

**What changes from the draft.**
- **The paintings, not the vector stand-in.** They're busier and darker in places, so every contrast number below is measured on them (Part 5), not on the draft.
- **The sidebar and rail stay paper.** The cove fills the screen area only. Navigation is the same on every screen, so it can't turn to glass on two of them without flickering as you move.
- **No text sits on the bare painting.** The draft's greeting sits on the sky with a text shadow; on the paintings that fails at dawn, golden hour and night (the moon). The greeting gets a soft halo instead, measured per painting, the header's icons a scrim where the moon is, and the details pane's bare labels move into card heads.
- **The painting follows the clock; the glass follows the appearance, and the night.** Dark mode keeps the hour's painting under dark glass (it was the night picture until 2026-11-21, which showed night at noon). Words on the bare painting (the greeting, its halo, the header's icons) follow the painting, so a day sky keeps its dark ink and white halo in dark mode. The night is dark glass whatever the appearance: white glass over the night lake glares, and it needs 69% opacity to pass; dark glass passes at 26%. So light mode has light glass at dawn, day and golden hour and dark glass at night; dark mode has dark glass at every hour (`coveGlass` in `lib/cove.ts`, `data-glass` on the cove).
- **The greeting's clock shows the date only.** A minute clock would need a minute timer on an idle window (NFR-3).

## Part 1 · Layers

Back to front, inside the screen area (from the sidebar's edge, or the window's in compact, to the right edge; from the window's top to its bottom):

| # | Layer | What | Moves with |
| --- | --- | --- | --- |
| 1 | Deep | `--cv-deep`, the water's own colour, filling the whole area, so the window never shows paper under the painting | Nothing |
| 2 | Far | The sky-and-shore half, and the cloud | Pointer (−4, −2), scroll (−12) |
| 3 | Near | The water half | Pointer (−10, −4), scroll (−36) |
| 4 | Front | Reeds and lily pad | Pointer (−16, −6), scroll (−36) |
| 5 | Otty | The float pose, its reflection and waterline fade | Pointer (−12, −5), scroll (−36) |
| 6 | Veil | A 128 px gradient up from the bottom edge, transparent to `--cv-deep` at 55%, so the message box sits on calm water | Nothing |
| 7 | Content | The scroller: the hero (greeting), then the glass blocks | Scroll |
| 8 | Header | Clear over the sky; frosts once the hero has gone | Scroll (its frost) |
| 9 | Message box | Glass, pinned to the bottom | Nothing |

Layers 1–6 are `Cove` (`components/Cove.tsx`), stuck behind the scroller at the full height of the screen area, no longer a fixed-height strip. Layers 7–9 are the screen's own. The painting stays off a GPU layer of its own (DESIGN, "Motion"); the glass blocks get one through `backdrop-filter`, which is fine because they're over the painting, not clipping it.

## Part 2 · Geometry

One number places everything: **`--horizon-y`**, the horizon's distance from the window's top edge.

| | Compact (floating, 420 × 580) | Rail, medium | Wide (1280 × 800) |
| --- | --- | --- | --- |
| `--horizon-y` | 216 | 248 | 288 |
| Otty's float pose, width | 136 | 168 | 200 |
| Otty's waterline (70% down its box) | horizon + 16 | horizon + 24 | horizon + 32 |
| Greeting block top | header + `--s-6` (24) | header + `--s-8` (32) | header + `--s-8` |
| First glass block top | horizon + 72 | horizon + 80 | horizon + 88 |
| Column | full width less 16 gutters | at most 680, gutters 16 | at most 720, gutters 24; pane 300 |

**The painting** is one picture cut at its horizon (49.4% down: row 506 of 1024), aspect 3 : 2. It's drawn wide enough to cover the sky above the horizon with room for the depth and scroll moves, and at least 32 px wider than the area:

```
--paint-w: max(100% + 32px, (var(--horizon-y) + 24px) * 3.04)
--paint-h: var(--paint-w) / 1.5
top:       var(--horizon-y) - 0.494 * var(--paint-h)
```

Below the painting's bottom edge, Deep carries on. At 1280 × 800 (sidebar 216, area 1064): the painting is 1096 × 731, its top 73 px above the window, its bottom at 658, and Deep fills the last 142 px under the veil.

**Proportion, at 1280 × 800.** Header 0–52 (clear). Greeting 84–176 (date, greeting, one-line sentence). Otty 239–355 (the float pose is 768 × 447, so 200 × 116; its waterline at 320, the lower 35 px fading). First block at 376, so Needs you's first item and its buttons show without scrolling, with about 360 px of glass blocks above the message box. At 420 × 580: greeting 68–148 (170 with a two-line sentence), Otty 177–256 with its head just over the horizon, blocks from 288, about 210 px of blocks visible: Needs you's first item and its buttons fit; Today folds below.

**`--cv-deep`**, measured from the bottom 24 rows of each water half: dawn `#345d8d`, day `#267888`, golden `#37323a`, night `#042248`. Set per painting on `.cove[data-time]`, cross-fading with it.

## Part 3 · The parts

### Otty in the water

- The float pose, centred, placed by its waterline (the table). Above the line it's whole; below it fades: `mask: linear-gradient(#000 64%, rgb(0 0 0 / .35) 76%, transparent 90%)`, so it sits *in* the water. Check by eye on all four paintings at 200%, as D-71 did; if the fade needs moving, change these three stops here first.
- **Reflection:** a mirrored copy under the waterline, `scaleY(-0.6)` from the waterline, opacity .25, `blur(1.5px)`, masked to fade out over 40 px. Static CSS; no new art.
- The hour's tint stays (night `brightness(.62) saturate(.75)`, golden, dawn), on the otter and its reflection together.
- The stepped float stays (`float 6s steps(10)`), and so do the arrival, the depth and the ripples. A ripple from Otty now starts at the waterline line above, not 72% down its box.
- It's still a 44 × 44-or-larger button named "Otty" on Home (squish and blink, Spec 06), its hit area the box above the waterline.

### The greeting

Centred in the sky, three lines, `text-wrap: balance`:

| Line | Type | Colour | Gap above |
| --- | --- | --- | --- |
| Date, `TUESDAY 18 NOVEMBER` | `--fs-label` (11 / 14, 700, uppercase, 0.08em), tabular | `--cv-sub` | — |
| Greeting, "Good afternoon" | **Hero** (new, off-scale): 40 / 44, 800, −0.025em; 32 / 36 in compact | `--cv-ink` | `--s-1h` (6) |
| Sentence (`home().status`) | `--fs-title` (16 / 22) at 600, at most 40 characters a line | `--cv-sub` | `--s-1h` |

Hero is the only new size. It joins `rules/renderer.test.ts`'s short off-scale list, written down there as "the cove's greeting (Spec 07)". The date changes at midnight through the cove's own timer (the next painting is at 5:00, so `untilNextCove` gains midnight as a stop), never a minute timer.

**Ink on the bare painting follows the painting**, not the glass or the appearance:

| Painting | Ink (`--cv-ink`) | Sub (`--cv-sub`) | Halo (`--cv-halo-*`) | Header scrim (`--cv-top-*`) |
| --- | --- | --- | --- | --- |
| Dawn | `#3a3132` | `#50473d` | `#f4f1ea` at .44 | none |
| Day | `#3a3132` | `#50473d` | `#f4f1ea` at .30 | none |
| Golden | `#3a3132` | `#50473d` | `#f4f1ea` at .64 (the far hills are dark brown behind the words) | none |
| Night | `#f5f2ec` | `#dedad2` | `#101826` at .05 | `#101826` at .53 (the moon is behind the icons) |

The night tokens are `--cv-night-ink` and `--cv-night-sub`. Dark mode's dawn, day and golden hour get only their own glass tint, `#18151a` at .45 / .52 / .49 (`--cv-glass-dark-*`, each the least that passes plus .02); their greeting, halo and scrim are the light ones above. All are in `:root`, and `rules/renderer.test.ts` measures every painting under each glass it can have.

**The halo** is a soft ellipse behind the greeting block: `radial-gradient(closest-side, halo, halo 55%, transparent)`, 48 px wider than the block on each side and 32 px taller. Text never reaches past its 55% ring, so the test checks the full strength. It reads as the light gathering round the words; at night it's barely there.

### Glass

One recipe for blocks, the now line, the message box and the header's frost. It works the draft's way: the backdrop itself is softened, flattened and lifted (or smoked), so the tint over it can stay thin.

Both glasses are held to **3.5:1** for every text role on them, not 4.5:1 (owner's call, 2026-11-21): at 4.5 the glass had to cover the painting to stay readable over the brightest sky a card can scroll across. Over the water, where cards usually sit, it's well above that. Words on the bare painting keep their own checks.

| | Light glass (dawn, day, golden) | Dark glass (night, and dark mode at every hour) |
| --- | --- | --- |
| Backdrop (`--cv-frost-light`, `--cv-frost-dark`) | `blur(6px) saturate(1.45) contrast(.6) brightness(1.5)` | `blur(6px) saturate(1.6) contrast(.6) brightness(.65)` (2026-11-21: see-through, the painting's colour coming through) |
| Tint (`--cv-glass-*`) | `rgba(255, 255, 255, a)`: dawn .34, day .17, golden .49 | `rgba(24, 21, 26, a)`: night .45, and in dark mode dawn .45, day .52, golden .49 |
| Rim | 1 px, white .95 → .18 → transparent → .18 → .6 at 140°, through a mask (the draft's `.cv-glass::before`) | Warm white .32 → .04 → transparent → .04 → .14 |
| Light | Inset 0 1px white .9 (top), inset 0 −1px white .3 (bottom) | Same at .22 and .08 |
| Lift | `0 0 0 .5px rgb(58 49 50 / .07), 0 2px 6px −2px rgb(30 34 40 / .24), 0 18px 40px −18px rgb(30 34 40 / .24)` | Edge `rgb(0 0 0 / .25)`, shadows at `/ .55` |

The tint is the measured minimum (Part 5) plus .02. That's 44% clear at dawn, 54% by day, 34% at golden hour and 74% on a night lake: the reeds, the water's colour and Otty's reflection all show through, softened.

The glass is its own surface, so it replaces "one edge, one separator": the rim and the lift together are the glass's edge, and nothing inside it adds another. Blocks keep Spec 06's sizes, but at `--r-lg` (18), as the draft, with 12 16 padding (concentric children: 18 − 12 = 6 floor).

**Text on glass** uses darker roles than paper, set on the cove's scope so components don't change:

| Role | Paper (light) | On light glass | On dark glass |
| --- | --- | --- | --- |
| `--text` | `#221f20` | same | `#e6e3dc` |
| `--heading` | `#3a3132` | same | `#f5f2ec` |
| `--text-2` | `#6f6458` | `#50473d` | `#b0a690` |
| `--brand-text` | `#566d38` | `#4a5e30` | `#a3b37f` |
| `--straw-ink` | `#74613a` | `#5f4c22` | `#d9caa2` |

On dark glass the whole dark token set applies (fills, hairlines, buttons), so a night cove in light mode looks like dark mode inside its glass. `styles.css` declares the dark set once for both `@media (prefers-color-scheme: dark) { :root }` and the cove's `[data-glass='dark']`; the token test must still find the block.

### Header

- Over the hero it's clear: no fill, no hairline, no title (Home's title is the greeting). Icon buttons are `--cv-sub`, with the painting's scrim behind them: `linear-gradient(var(--cv-top-*), transparent 76px)`, so the icons get 3:1 at every painting (Part 5). Only the night needs one.
- As the greeting scrolls away it frosts: the glass recipe fades in on the header's `::before` over the scroll range `horizon-y − 64` to `horizon-y − 16`, then the hairline and the title "Home" (Spec 06) fade in, and icons return to `--text-2`. Scroll-driven, through a named timeline on the scroller and `timeline-scope` on the frame, so no script runs.

### Blocks and the details pane

- Every block is glass, as above. Needs you keeps its straw edge: a 1 px `--straw` inner rim over the glass rim, and a `rgb(199 181 139 / .16)` wash under the tint.
- Buttons inside keep their own fills: primary `--brand-fill`; quiet and secondary use the scope's `--fill` and `--fill-strong`, which are translucent and so read on glass.
- **Wide band:** the cove spans the main column and the details pane together. The pane's blocks are glass cards with their heads inside (as at narrower widths): Spec 05's bare pane labels would sit on the painting.

### The message box

The same component (`MessageBox.tsx`, the capsule), with the glass recipe as its fill and `--hairline-strong` as its stroke (focus: `--brand-line` at 1.5). Area padding stays 8 12 12; it floats over the veil. Placeholder `--text-3` is exempt from contrast, as everywhere.

### The empty chat

The same cove, full bleed, at the frame's width. The hero says "Hi, I'm Otty" (Hero type) and the sentence "Highlight anything and press ⌥ Space, or just ask below." (keycap on glass: `--fill-strong`, not `--surface-2`). The try-asking rows sit in one glass block. No date.

**The quiet wash.** When the first question is sent, the cove draws back over `--t-drift` to the band behind the header (its height eases to the header's), and the header keeps glass over it, so answers always sit on the plain page and the chat still reads as Otty's place. Opening a chat that already has content shows the band at once; a rewind to empty brings the cove back. This is the last row of DESIGN's "living cove" that wasn't built.

## Part 4 · Motion

Everything from D-72 stays (hour cross-fade, the first cove's arrival, pointer depth, ripples, stepped float). Changes:
- **Gone: the cove dimming to .25 on scroll.** It existed to make opaque cards readable; the glass doesn't need it.
- **Greeting on scroll:** opacity 1 → 0 and `translateY(0 → −24px)` over `0` to `horizon-y − 64`. Scroll-driven, transforms and opacity only.
- **The wash:** opacity over `--t-drift` on `--glide`, CSS transition on a `data-wash` attribute.
- **Reduced motion:** everything still, as today; the wash and the header frost switch without fading.
- Idle cost doesn't change: nothing new runs while still. Re-measure with `OTTY_METRICS=1` anyway, because `backdrop-filter` over a painting is new compositor work on scroll.

## Part 5 · Readability, measured

`rules/renderer.test.ts`'s cove test is rebuilt around what's on screen, reading every value (tints, filters, roles, halo strengths) from `styles.css`, so changing one without the others fails:

1. **Glass:** for each painting, model the backdrop filter (saturate, contrast, brightness, in that order, as CSS does) on each recorded patch, lay the tint over it, and require every text role of that glass at 4.5:1.
2. **Greeting:** for each painting's sky band (rows 180–420 of 1024, the middle half: where the greeting lands at 420 and 1280 wide), lay the halo at full strength over the darkest and lightest patch: `--cv-ink` at 3:1 (large text) and `--cv-sub` at 4.5:1.
3. **Header icons:** the top band (rows 40–200, the right 35%) under the scrim, `--cv-sub` at 3:1.

Each check runs both ways: the value must pass, and must be no more than .03 above the least that passes, so the glass can't drift back to opaque to pass.

Patches from `.venv/bin/python tools/otty-art/prepare.py --patches` (2026-11-21; it also prints them each time it cuts a cove), with the least that passes:

| Painting | Glass: darkest, lightest (32 px) | Sky (16 px) | Top (16 px) | Glass | Halo | Scrim |
| --- | --- | --- | --- | --- | --- | --- |
| Dawn | 34, 83, 135 · 253, 216, 159 | 161, 133, 156 · 253, 206, 160 | 153, 157, 202 · 225, 189, 189 | .54 | .42 | 0 |
| Day | 26, 111, 133 · 253, 250, 240 | 150, 166, 116 · 248, 238, 208 | 143, 201, 226 · 254, 251, 240 | .44 | .28 | 0 |
| Golden | 45, 45, 56 · 251, 237, 135 | 133, 78, 34 · 251, 215, 65 | 205, 140, 100 · 245, 178, 85 | .64 | .62 | 0 |
| Night | 3, 23, 49 · 222, 218, 209 | 8, 36, 73 · 61, 100, 145 | 8, 35, 78 · 230, 224, 214 | .24 (dark) | .03 | .51 |

Light glass over the night would need .69, which is why the night is dark glass. When a painting changes, copy the script's lines into the test's `PAINTINGS`.

**Reduce transparency and Increase contrast** (System Settings › Accessibility › Display; `prefers-reduced-transparency: reduce`, `prefers-contrast: more`): glass becomes the scope's `--surface`, solid, with `--elev-1`; the halo goes to .9; the header is solid from the start. The painting stays.

## Part 6 · Every state and width

| State | What's different |
| --- | --- |
| Home, things need you | As drawn above |
| Home, quiet | Only the greeting, What left your Mac and Try asking; the cove gets the room, blocks start at the same place |
| Home, first run | Try asking only, under "Nothing needs you. Ask me anything." |
| Home, running / paused | The now line, on glass, first in the column above Needs you |
| Long text, Chinese | The sentence wraps to two lines, balanced; Chinese at +1 line-height step; Hero type in PingFang HK at the same size |
| Empty chat | Part 3 |
| A chat with content | The wash |
| Reduced motion, reduced transparency | Part 4, Part 5 |
| Light and dark | Light: dawn, day, golden or night by the clock. Dark: night |

Widths: 380, 420 (floating default), 640, 760, 980, 1280, and full screen at 1728 × 1117 (the painting scales up, the column caps, the horizon stays at 288).

## Preview scenes needed

- `&time=dawn|day|golden|night` on any view, to pin the painting (the mock passes it to `coveTime`).
- `&transparency=reduced`, emulating `prefers-reduced-transparency`.
- Scenes `home`, `home-quiet`, `home-first`, `home-running`, `home-paused`, `empty`, plus new `home-scrolled` (scrolled past the hero) and `chat-wash` (a chat with content over the wash).
- `npm run screens` gains `home` and `empty` at 420, 980 and 1280, for each painting in light, and night in dark (30), and `home-scrolled`, `chat-wash` and the reduced-transparency `home` at 980 (3). The baseline update is its own PR.

## Done when

- At 960 × 660 and 1280 × 800, `home` beside the draft's "Home" at the same width, light and dark, reads as the same composition: cove to every edge of the screen area, greeting in the sky, Otty in the water at the waterline with its reflection, blocks and message box on clear glass. Checked by the owner at 100% and 200%.
- The cove test (built in step 1) passes, failing when a tint, halo or scrim is too thin to read or more than .03 thicker than needed, on every painting.
- `npm run screens` covers every scene above.
- Reduced transparency and Increase contrast give solid surfaces; reduced motion is still.
- `OTTY_METRICS=1` idle stays under 0.5% on Home and the empty chat, and scrolling Home stays smooth (no dropped frames in a Performance trace of a full scroll, at 1280 × 800).
- DESIGN.md's living cove row says Built for the full-bleed layout and the wash.
