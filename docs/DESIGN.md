# Otty — UI design

The look and feel of the Otty window, its names, the motion system, and every micro-interaction worth adding. Start here before designing or building a screen.

**Status:** draft v0.2, 2026-11-18. The draft is a direction, not a spec: layouts, names and motion are settled enough to build specs from, but no screen here is ready to build as drawn (see "The polish bar"). The interactive draft is [`docs/design/otty-window-draft.html`](design/otty-window-draft.html); open it in a browser from the repo so the otter art loads.

Related: the plan for the window is in BRAINSTORM ("Quick view and the Otty window"), the steps to get the panel ready are in `docs/UX_REVIEW.md`, and the tokens live at the top of `src/renderer/src/styles.css`.

## The polish bar

The draft is high-level on purpose. Production is not: what makes Otty feel expensive is the small details and affordances, so every screen gets a written spec, down to the pixel, before it's built.

**A screen spec has:**
- **Spacing** from the scale in "Foundations", with the padding of every container and the gap between every pair of siblings written down. Nested corners stay concentric (inner radius = outer radius − padding).
- **Type** from the roles in "Foundations", with the colour token for each piece of text. Answers are the content; chrome is always quieter than content.
- **Proportion:** how much of the space each piece of information gets at each width, for example how much of a compact window is answer text versus chrome, and which line is allowed to truncate first. Measure it, and keep the content share high.
- **Hit targets and sizes** from "Foundations", with the visible glyph sized and optically centred inside.
- **Every state:** empty, loading, one item, many items, long text, Chinese text, error, paused, offline, waiting for you, reduced motion, light and dark.
- **Every width:** 380, 640, 980 and a wide roomy window, plus the breakpoints in between.
- **Affordances:** hover, press, focus, disabled and selected for every control, and the motion for each from the catalogue below.
- **Alignment:** baselines, icon-to-text alignment, optical adjustments (round glyphs a pixel larger, arrows nudged), and tabular figures wherever digits line up.
- **Copy:** final words, checked against `docs/UX_REVIEW.md`'s rule (glanceable, only the unusual grows).

**A screen is done when** a `tools/ui-preview` scene exists for every state and width in its spec, `npm run screens` covers them, and someone has compared the result with the spec at 100% and 200% zoom.

## Foundations

The values every screen spec builds on. Each one names its token, so specs and CSS say `--s-3`, not `12px`. Applying them to today's panel is D-59 (DEVLOG). Measured from the current app on 2026-11-18, before any change: `styles.css` uses 18 font sizes, four weights (including 650), about 30 different paddings, and gaps of 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12 and 14 px. Light mode's muted text is 3.5–4.1:1 against its backgrounds, which fails WCAG AA. The panel opens at 420 × 580: header 55 px, composer 65 px, and the health banner adds 87 px, so chrome takes 36% of the window while the banner shows.

### Spacing

A 4 px grid. Only these values, as tokens:

| Token | px | Used for |
| --- | --- | --- |
| `--s-0` | 2 | Hairline nudges, the gap between a title and its sub-line inside a row |
| `--s-1` | 4 | Tight clusters: icon buttons side by side, inner padding of the composer box |
| `--s-1h` | 6 | **Only** between an inline icon and its text |
| `--s-2` | 8 | Between related items: buttons in a row, chips of one answer, title and body in a card |
| `--s-3` | 12 | Row padding, card padding (vertical), between items in a list of cards |
| `--s-4` | 16 | Screen gutter (compact), card padding (horizontal), between unrelated blocks |
| `--s-5` | 20 | Between chat turns |
| `--s-6` | 24 | Between sections; screen gutter (wide) |
| `--s-8` | 32 | Above a screen title; empty-state padding |
| `--s-12` | 48 | Hero spacing on Home and onboarding |

**Rules.** Siblings are spaced with `gap`, not margins. Padding is symmetric unless an icon or a corner needs an optical correction, which the spec writes down. Related things sit closer than unrelated things, always by at least one step (8 inside a card, 12 between cards).

### Type

SF Pro Rounded (`ui-rounded`), with PingFang HK for Chinese. Eight roles and four weights (500, 600, 700, 800). No other sizes.

| Role | Token | Size / line | Weight | For |
| --- | --- | --- | --- | --- |
| Display | `--fs-display` | 24 / 30 | 800 | Onboarding titles |
| Hero | `--fs-hero` | 40 / 44 (32 / 36 compact) | 800 | The cove's greeting only (Spec 07) |
| Heading | `--fs-heading` | 20 / 26 | 800 | Settings section titles, empty states |
| Title | `--fs-title` | 16 / 22 | 700 | Window header, card titles that are questions |
| Body | `--fs-body` | 14 / 22 | 500 | Answers, user bubbles, the composer. The content |
| UI | `--fs-ui` | 13 / 19 | 600 | Row titles, buttons, setting names, fields |
| Small | `--fs-small` | 12 / 17 | 500 | Row sub-lines, card details, setting descriptions |
| Meta | `--fs-meta` | 11 / 15 | 500 | Times, counts, hints, tool chips, tooltips |
| Label | `--fs-label` | 11 / 14 | 700 | Group labels, uppercase, letter-spacing 0.05em. Never for sentences |

**Rules.**
- Answers are always the largest running text on screen; chrome never matches them.
- Chinese text keeps the same size and gets one extra line-height step (body 14 / 24, small 12 / 19), with no letter-spacing (`:lang(zh)`).
- Times, counts and anything that lines up use `font-variant-numeric: tabular-nums`.
- Headings use `text-wrap: balance`; nothing in a row wraps: titles and sub-lines truncate to one line with an ellipsis, sub-lines first.
- Today's mapping: 13.5 → UI 14; 14.5 → Body 15; 12.5 and 11.5 → Small 13 or Meta 12 by role; 10, 10.5 and 9 → Label 11 or gone; 650 → 700; 18, 19, 21, 26 → Heading or Display.

### Colour roles

The palette tokens stay. These text roles sit on top, each with a measured contrast:

| Token | Light | Dark | For | Contrast (light / dark) |
| --- | --- | --- | --- | --- |
| `--text` | `#221f20` | `#e6e3dc` | Body and titles | ≥ 13.5:1 / ≥ 10.5:1 |
| `--text-2` | `#50473d` (was `#6f6458`; Spec 08) | `#bcb29c` | Sub-lines, details, meta | ≥ 4.7:1 / ≥ 4.9:1 on every surface |
| `--text-3` | `#958a7b` | `#857a68` | Placeholders and disabled only; never information | ≥ 2.8:1 / ≥ 3.2:1 |
| `--brand-text` | `#4a5e30` (Spec 08) | `#b0bf8c` | Links and brand-coloured text | ≥ 4.7:1 / ≥ 5.9:1 |
| `--brand-fill` | `#5a7339` | `#a3b37f` | Primary buttons and user bubbles, with `--brand-ink` text | 5.1:1 / 7.5:1 |
| `--straw-ink` | `#5f4c22` (Spec 08) | `#d9caa2` | Waiting, suggestions, "behind" | ≥ 4.9:1 / 8.8:1 |

Since Spec 08 every surface sits on the hour's mist, so the roles above are the cove's darker values everywhere, checked on every mist and on paper glass over it. Meadow `#637c42` stays the brand colour for rings, dots, progress and illustration, where it isn't carrying text. Semantic colours (brand for done, straw for waiting, danger for can't-undo) are never the only signal: each state also has a word or an icon.

### Shape

- **Radius:** `--r-xs` 6 (keycaps, tooltips, small tags), `--r-sm` 10 (buttons, fields, rows), `--r-md` 14 (cards, groups), `--r-lg` 18 (user bubbles), `--radius` 24 (the window). 50% only for the otter, dots and round buttons. No 999 px capsules for chips or filters.
- **Concentric corners:** an inner shape's radius is its container's radius minus the padding between them, floored at 6. So the composer box, 12 px inside a 24 px window corner, is 12; a button 4 px inside a 14 px card corner is 10.
- **One edge, one separator:** a surface gets a hairline *or* a shadow, never both. Lists separate rows with an inset hairline that starts at the text column, not under the icon.
- **Surfaces (Spec 08):** one family, by recipe: MIST (a window's backdrop, the hour's colours), SIDE (nav and list column), GLASS (paper glass: cards, groups, blocks and the message box, `--mist-card` with `--glass-lift`, radius `--r-lg`), FLOAT (solid glass for menus and popovers), FIELD, TINT (recessed content) and the cove's own glass over the painting. No screen shows plain paper, a white header or a `--surface-2` box.
- **Elevation:** `--elev-1` for cards and groups on the background; `--elev-2` for the composer and popovers; `--elev-3` for windows, toasts and menus.

### Icons

Flaticon UIcons, rounded, through `components/Icon.tsx`. Four sizes, always inside a fixed box so they centre:

| Size | Box | For |
| --- | --- | --- |
| 12 | 16 | Inside meta lines and tool chips |
| 14 | 28 | Inside buttons, rows and inline icon buttons |
| 16 | 32 | Header and composer icon buttons |
| 20 | 40 | Empty states, settings section icons when wide |

Round glyphs are drawn 1 px larger than square ones to look the same size; arrows and the send glyph sit 1 px off-centre toward where they point. The spec for each icon button names any such nudge.

### Sizes and hit targets

| Control | Height | Notes |
| --- | --- | --- |
| Button, large | 40 | Onboarding and empty-state primary actions only |
| Button | 32 | Default |
| Button, small | 28 | Inside cards and rows |
| Icon button | 32 / 28 | Header and composer / inside rows and answers |
| Small × | 20 visible | 28 × 28 hit area through padding |
| Field | 36 | One-line text fields and selects |
| Switch | 20 | 36 × 20 track |
| Row, one line | 36 | Views, settings rows without a description |
| Row, two lines | 52 | Chats, Logbook entries, settings rows with a description (grows with the description) |
| Window header | 44 | Was 55 |
| Composer box | 44 minimum | 6 px padding round 32 px controls; grows to six lines |

Nothing clickable is smaller than 28 × 28, and adjacent targets never overlap.

### Window metrics and proportion

| | Compact (opens at 420 × 580) | Wide (980 and up) |
| --- | --- | --- |
| Screen gutter | 16 | 24 |
| Header | 44 (floating state, at any width) | 52 in the roomy state, with the traffic lights in the sidebar or rail (Spec 05) |
| Composer area | 8 above, 12 below and at the sides | Same, centred under the 680 px reading column |
| Reading column | Full width less gutters (388 px at 420) | Capped at 680 px |
| Between chat turns | 20 | 20 |

**Proportion budget.** At 420 × 580 with nothing unusual on screen, chrome (header plus composer) takes at most 20% of the height (44 + 64 = 108 px, 19%), and the answer text gets the full reading width, not an indented column. A window-wide notice may add one line (40 px) in the layout; anything longer folds behind "More".

### Components

Every component lists its anatomy in px and its states. Hover, press, focus and disabled follow one pattern unless noted: hover tints with `--fill-strong` or darkens a fill one step; press scales to 0.97 at `--t-tap`; focus shows a 2 px `--brand` ring 2 px outside, following the shape's radius; disabled is 45% opacity with no hover.

**Button.** Height 32, padding 0 14, `--fs-ui`, radius 10, icon 14 with a 6 gap. Small: 28, padding 0 12, `--fs-small` 600. Large: 40, padding 0 18, 15 / 20 700.
- *Primary:* `--brand-fill` with `--brand-ink`; hover one step darker.
- *Secondary:* `--fill-strong` with `--text`.
- *Quiet:* no fill, `--text-2`; hover adds `--fill`.
- *Hold:* `--danger-soft` with `--danger-ink`; a fill sweeps left to right over 1.2 s while held, releasing early cancels, Enter twice from the keyboard.
- *Busy:* the label stays and the width is locked; a three-step dot replaces the icon.
- A row of buttons puts the primary first, 8 apart. At most one primary per card.

**Icon button.** 32 square in the header and composer, 28 in rows and answers; radius 8 (32) or 7 (28); glyph 16 or 14 in `--text-2`. Selected: `--brand-soft` fill, `--brand-text` glyph. A dot badge is 7 px at 5 px from the top-right, with a 2 px ring in the surface colour. Every icon button has a tooltip with its shortcut.

**Switch.** Track 36 × 20, radius 10; knob 16, 2 px inset, 16 px travel at `--t-quick`. Off: `--fill-strong` with an inset hairline. On: `--brand-fill`. The whole settings row toggles it, not just the track.

**Field.** Height 36, padding 0 12, `--fs-ui` 500, radius 10, 1 px `--hairline-strong`, background `--bg`. Focus: border `--brand-line` and a 3 px `--brand-soft` ring. Error: border `--danger-ink`, then a `--fs-meta` line 6 px below saying what to do. Placeholder in `--text-3`.

**Row.** The one list row for Chats, the Logbook, the Notebook, views and settings. Padding 8 12, gap 12. Leading: a 16 px glyph, or a 28 px tile (radius 8, `--fill-strong`). Title `--fs-ui`; sub-line `--fs-small` in `--text-2`, 2 px below. Trailing: `--fs-meta` tabular, or one control. Hover `--fill`. Selected: `--brand-soft` for views and settings sections, `--surface` plus `--elev-1` for the chat list.

**Group.** A settings box. `--surface`, radius 14, `--elev-1`. Rows inside are padding 12 16, separated by a hairline inset 16 from the left. The group label (`--fs-label`, `--text-2`) sits 8 above, inset 4.

**Card.** Confirm, notice, inbox and step cards. Padding 12 16, radius 14, gap 8, `--surface` with `--elev-1`, at most 520 px wide. Title `--fs-ui` 700 (or `--fs-title` when it's a question); detail `--fs-small`; actions 4 px further below. *Unusual* (new site, can't undo, over a limit): a 1 px `--straw` inner edge and one consequence line in `--straw-ink`. *Receipt:* folded to one 28 px `--fs-meta` line with a check and Undo.

**Header.** 44 high (compact), padding 0 8 0 12, title `--fs-title`, icon buttons 32 with 4 between them. The hairline under it appears only once content scrolls. Everything that isn't a control is a drag region.

**Composer.** Area padding 8 12 12; box radius 12 (concentric with the window), `--surface`, `--elev-2`, padding 6, gap 4. Text 15 / 22 (`--fs-body` with a tighter line), padding 5 6, up to six lines (142 px), then it scrolls. Tools are 32 px icon buttons; Send is a 32 px circle that fills with `--brand-fill` when there's text and turns into Stop while answering. Focus adds a 3 px `--brand-soft` ring.

**Message.** User bubble: padding 10 14, radius 18 with the bottom-right corner at 6, at most 85% wide, `--fs-body` on `--brand-fill`. Answer: no bubble, full reading width, `--fs-body`; paragraphs 12 apart, lists indented 20. Question to answer 8; turn to turn 20. The action row (28 px icon buttons, 2 apart) sits 4 below the answer.

**Tooltip.** `--fs-meta` 600 on `--fur`, padding 4 8, radius 6, 6 px from its target, at most 240 px wide, after 500 ms (then instant for 1.5 s).

**Toast.** Bottom centre, 12 px above the composer. Height 36, padding 0 6 0 14, radius 10, `--elev-3`, `--fs-small`, with one quiet button. A 2 px line along the bottom drains over its lifetime (6 s) and pauses on hover.

**Menu and popover.** Radius 12, padding 4, `--elev-3`. Items 30 high, padding 0 10, radius 8, `--fs-ui` 500.

**Keycap.** Monospace 12, height 22, padding 0 6, radius 6, `--surface-2` with a hairline and a 2 px darker bottom edge.

**Counts and state.** Counts are tabular text, not capsules. A state is a word in its colour (Waiting, in `--straw-ink`) or a 7–8 px dot with a word beside it.

### Accessibility

- Text meets WCAG AA (4.5:1, or 3:1 at 18 px and up), checked by a test on the tokens.
- Every control is reachable by keyboard in reading order, with a visible focus ring.
- Every icon button has an accessible name; the otter's state is announced in words.
- Reduced motion and every state's word or icon are covered under "Motion".

## Names

| For | Name | Why | Fallback |
| --- | --- | --- | --- |
| Landing screen of the Otty window | **Home** | Where Otty looks after you: your day, what needs you, what's next | — |
| Conversations | **Chat** (one), **Chats** (the list) | Plain | — |
| What Otty did, what left the Mac, what it changed, what waits (today's Activity) | **Logbook** | The written account of a journey, kept as it happens, and checked when you want to know what happened. "It's in the Logbook." "Record" read as a verb and sounded like evidence | Activity |
| What Otty remembers about you (today's "What Otty knows") | **Notebook** | Ties to the Noted line, the safety control: "Noted: …" lands in the Notebook and Forget takes it out. Sounds like something you read and edit, not a profile kept on you | About you |
| Pet home, keepsakes, play | **Den** | Otters have dens, and it's clearly the otter's space | — |

Log and Note are a deliberate pair: Log is what Otty did, Note is what Otty noted. If they're confused in testing, switch Notebook to "About you". Friendly copy still never says "job" or "queue".

## Layout

One window, layout from width alone (container queries, never viewport media queries):

| Width | Layout |
| --- | --- |
| Under 640 (compact; opens at 420 × 580) | One screen at a time. Header: small otter (or Back off the main screens), title, Pause, Logbook, New chat, Expand. At most four icons |
| 640–979 (rail, medium) | A 72 px icon rail, then from 712 a 240 px list column for screens that have one (Chats, Logbook, Notebook, Settings), then the main column |
| 980 and up (wide) | A 216 px sidebar, the 248 px list column, the main column with answers capped at 680 px, and a 300 px details pane that changes with the screen (from 1248 on screens with a list). Exact bands, the header and the columns: [Spec 05](design/specs/05-frame.md) |

- **Sidebar:** Otty’s face and one status line on top, then Home, Chats, Logbook, Notebook, and Den once the den ships. Pause sits at the bottom in the same place at every width (a card, a rail icon, or a header button), then Settings.
- **Details pane:** Now & next and goals on Home, "This chat" on Chat (what left the Mac, notes used, words explained), the opened entry in the Logbook. Below 980 the same content opens as a page with Back.
- Confirm and step cards stay narrow inside the reading column; drawings, charts and slides may use its full width.

## Screens

Screen specs, written to the polish bar, in build order: [01 Decisions and receipts](design/specs/01-decisions.md) (confirm cards, receipts, the Noted line) · [02 Settings](design/specs/02-settings.md) · [03 Chat and the message box](design/specs/03-chat.md) · [04 Logbook](design/specs/04-logbook.md) · [05 The frame and layout from width](design/specs/05-frame.md) · [06 The roomy window and Home](design/specs/06-roomy-and-home.md) · [07 The cove, full bleed](design/specs/07-cove.md) · [08 One cove: the whole app in the cove's language](design/specs/08-one-cove.md). Each covers 420, 760 and 1200 px even while only the panel ships, so nothing is redone for the Otty window. The summaries below are the direction; where they differ, the spec wins.

### Home

The otter large at the centre on a water line, a greeting, one sentence of state, and then only blocks with something in them. The first version and its pixels are [Spec 06](design/specs/06-roomy-and-home.md). Each block is a surface the autonomy stages (AUTONOMY.md) already need, so Home grows stage by stage:

| Block | Stage | What it is |
| --- | --- | --- |
| Otter, greeting, one-line status | Now | Says how many things need you and what's next. Later becomes the Look after me greeting with a focus list (Stage 6). Tapping the otter opens the den |
| Needs you | Stage 2 | The inbox (AUTONOMY idea 8): cards that waited, chore results to review, late runs. Oldest first, three at most, then "and 2 more". Not shown when empty |
| Today | Stages 2–4 | A vertical timeline of the day: done items muted, "now" bright, then scheduled runs, Otty's own calendar blocks, meeting prep and possible nudges (dashed) |
| Goals | Later | "Goals, not tasks", with progress. Straw when behind, never red. Where honest pushback lands, warm and rare |
| Otty noticed | Stage 5 | One offer at a time from habits, with a plain yes, a no, and one line on what it would read and how to stop it. A no shrinks the attention budget |
| Looking after, trust line | Stage 2 | Standing chores with their next time, and one sentence on what left the Mac today, linking to the Logbook |

**Home and the den are different places.** Home is where Otty looks after you; the den (BRAINSTORM, "Otty's den") is where you look after Otty: feeding, play, shells, keepsakes and gentle stats, under its no-guilt rules. They meet at the otter: tapping it opens the den, and a new keepsake surfaces once on Home.

### Logbook

Built for finding, not browsing (UX_REVIEW #4). No filter pills:
- The list column holds **views** as text rows with counts: Needs you, Coming up, Everything, then under "Looking for…": What left my Mac, What Otty changed, What Otty noted. Each has a one-line description.
- The main column is a ruled **ledger** grouped by day: times in a tabular column on the left, an icon, one line of what happened with a muted line below, and Undo or another action on the right. Quiet days fold ("Monday · 9 quiet entries").
- An **Ask the Logbook** box at the top ("did my CV leave my Mac?").
- When compact, the title becomes a menu for the views.

### Settings

Sections, changes as you go, no Save button (UX_REVIEW #2):
- **You & Otty** (floating otter, notifications, open at login, Look after me, the den, home language) · **Shortcuts** (one shortcut, extras off by default) · **Privacy** (keep chats and for how long, notes, app name, web look-ups, see what left my Mac, and a "Can't be undone" group) · **Usage & limit** · **Connection** (service, "working ✓", change service or key, think deeper) · **Help** (what's new, how to use Otty, copy diagnostics, version).
- Each section shows a one-line summary of its current state in the list, which updates as settings change.
- Wide or medium: sections in the list column beside their contents. Compact: a list that opens each section as its own page with Back.
- Every change shows "Saved" beside the section title. Shortening chat retention asks first with a real count. Actions that can't be undone are press-and-hold buttons that name the count.
- The memory list moves out to the Notebook.

## Motion: water, not springs

**Your touch is instant; Otty's replies arrive like water.** Presses answer at once, because a lagging button feels broken. Everything Otty does afterwards surfaces, settles and drifts, with a long, soft landing.

| Token | Value | For |
| --- | --- | --- |
| `--t-tap` | 120 ms | The user's own press. Never slower |
| `--t-quick` | 280 ms | Hover, toggles, tooltips, colour changes |
| `--t-settle` | 480 ms | Cards surfacing, rows folding, panes sliding in |
| `--t-travel` | 720 ms | Window resize, quick view to window, picture zoom |
| `--t-drift` | 1.4 s | One-off moments that carry meaning: ripples, the Noted pen line, a permission granted |
| `--glide` | `cubic-bezier(.16,1,.3,1)` | The default: fast start, long soft landing |
| `--buoy` | `cubic-bezier(.3,1.22,.5,1)` | A float that rises just past and comes back, for "done" and keepsakes |
| `--ebb` | `cubic-bezier(.45,0,.85,.4)` | Exits |

**Named motions:** *surface* (rise 8–18 px and clear, settle), *ebb* (sink 6 px and fade, about two-thirds of the entrance), *ripple* (rings spreading, drift), *drift* (a slow one-off, such as a line drawing itself).

**Rules**
- Something happened, so something moves. Ambient motion (float, blink) stays stepped; the idle float becomes 6 s in 10 steps.
- Slow never blocks: typing, clicking or a new message jumps any animation to its end.
- Live motion runs only while its state is live and the window is visible, uses `steps()`, and stops with `data-asleep`. Real segmented progress replaces spinners wherever main knows the count.
- Animate transform, opacity and a light blur only. Heights go through `grid-template-rows`; window size through one animated `setBounds` in main.
- Reduced motion swaps movement for a 200 ms fade and holds the otter still. Every state also has a word or an icon.
- Safety moments are calm: no shakes, no red flashes.
- Re-measure with `OTTY_METRICS=1` after changing what runs while idle (NFR-3).

**CSS or Motion.** Two tools, one set of tokens (`lib/motion.tsx` mirrors `--t-*` and the curves; `rules/renderer.test.ts` keeps them equal).
- **CSS** for everything that can run without a script: hover and press transitions, the stepped otter, the scroll-driven cove, one-off keyframes on mount. It costs nothing to start, runs on the compositor, and stops with `data-asleep` and reduced motion for free.
- **Motion** (`motion/react`, lazy `m.*` under `MotionRoot`) only for what CSS can't do: **exits** (`AnimatePresence`: a menu ebbing, a decided item leaving), **things gliding to their new place** (`layout`, `layoutId`: the nav highlight, the language pill, blocks closing up), and **motion that follows the pointer** (the cove's depth). Never `repeat`, since `data-asleep` can't pause it (a rule test fails on one); reduced motion keeps its fades and drops its movement (`reducedMotion="user"`).
- Animate a screen without remounting it (`useAnimate` on the frame's body), so the chat keeps its scroll.
- Anything moved with `transform` by a scroll timeline gets its other motion on `translate`, so the two add up instead of fighting.
- Don't put the cove's painting on a GPU layer of its own (no animation, no `will-change`): clipped on its own layer, the water shows as a one-pixel line under the paper fade.

## Signature moments

What makes Otty look like Otty and not a chat app with an avatar (BRAINSTORM, "Otty's look"). Each one is still water, not springs, and still pays nothing while idle.

| Moment | What the user sees | Rules | Status |
| --- | --- | --- | --- |
| **The living cove** | A painted cove behind Home and the empty chat, one picture per time of day, the otter floating in a clear hero header with the greeting, content on frosted glass that the cove shows through, and parallax when scrolling | Painted through `tools/otty-art/`; parallax on `animation-timeline: scroll()` (transforms only, so nothing runs until a scroll); still under `data-asleep` and reduced motion; text 4.5:1 over the brightest picture; a quiet wash, not the full picture, behind a chat with content | Built full bleed, with clear glass and the quiet wash (D-72, D-74, [Spec 07](design/specs/07-cove.md), `components/Cove.tsx`). Touch built: the first cove of a window settles in (pieces, then Otty on the buoy curve), the layers lean away from the pointer by their depth, and a press on the water or Otty spreads two rings |
| **The camera** | Leaving Home tilts the camera up from the cove into the hour's painted sky, Otty riding the water out of view; every other screen sits on a glass sheet over that sky, and coming back tilts down | One world (`.cove__world`), one CSS transform over `--t-travel`; the screen surfaces after the world has mostly moved, so words never sit on moving paint; still once landed | Built ([Spec 08](design/specs/08-one-cove.md), Part 9) |
| **The liquid capsule** | The message box is a drop: typing nudges its outline a few pixels, which settles back over `--t-settle`; sending lets a small drop rise towards the chat and the box settles | An SVG path over the box, eased by one `requestAnimationFrame` loop that runs only while it's settling and stops at rest; no change to the box's layout or hit area; reduced motion keeps a still outline | Built (`components/Capsule.tsx`) |
| **Pebbles landing** | A kept Pebble sinks into the Pouch with `--buoy` and settles among the others | One brief motion per keep; the Pouch never animates on its own | Concept note in BRAINSTORM |
| **Charts and slides with taste** | Pies and bars in a calm categorical palette, soft gridlines, rounded bars, a title slide washed with the brand, a kicker line, coloured bullets and big quote marks, number badges | Colours from the tokens (`--chart-1` to `--chart-6`, checked for contrast in both themes); the deck stays self-contained HTML with no scripts and `img-src data:` | D-70 |

The cove and the capsule are the two the owner named first; build the capsule's spec alongside the composer's (M row) and the cove's alongside Home's (L row), so each gets its pixel-level spec first.

## Not doing

- **Filter pills and badge soup.** Views are text rows with counts; state is a word or a colour.
- **Eyes that follow the cursor:** polling while idle, against NFR-3.
- **Looping shimmer:** placeholders run two stepped cycles, then hold.
- **Confetti, streaks, fireworks:** against the den's rules.
- **Shaking fields on error:** the otter tilts its head instead.
- **Character-by-character typing:** chunks surface instead.
- **Counting up money or tokens:** usage bars fill once; prices only with a dated table.
- **Slow presses.**

## The first twelve to build

Trust first, then the moments every user hits daily, then what the roomy window needs on day one: K3, K2, K11, N1, N2, S6, S7, M4, B7, W1, W7, G1 (catalogue below).

## Micro-interaction catalogue

Each row: what triggers it, what the user sees, and why. **Build:** Now (cheap, high value), Next (with the Otty window), Later (polish), Den (with the den). **Cost while idle:** *on touch* (only during interaction), *brief* (finite, under 1.5 s), *while live* (stepped, stops when hidden), *new art* (needs painted frames from `tools/otty-art/`), *main* (needs main-process work). When one ships, mark it here and in the CHANGELOG.

### B. The floating otter

On screen all day: rich on touch, silent at rest.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Press squish | Pointer down on the bubble | Scales to 0.94 in 120 ms, then floats back to 1.0 on the buoy curve over 480 ms. | Makes a picture feel like a button without adding chrome. | Now | on touch |
| B2 | Hover wake | Pointer rests on the bubble | The stepped float becomes a smooth bob for 3 s, then steps again; a blink fires on entry. | Alive exactly when looked at, free the rest of the day. | Now | on touch |
| B3 | Drag with weight | Dragging the bubble | Shadow deepens, Otty tilts up to 4° toward the drag, startled frame while held. | A creature being carried, not a sticker. | Next | new art |
| B4 | Drop settle | Releasing after a drag | One slow wiggle and two water rings spreading under the bubble over 1.4 s. | Confirms the new spot in the water language. | Next | brief |
| B5 | Edge tuck | Released near a screen edge | Glides half out of view over 720 ms, ears peeking; hover slides it back. | Out of the way without hiding (edge docking). | Later | main |
| B6 | Badge arrival | An answer finishes with no window open | The dot surfaces on the buoy curve, one slow ring, then holds still. | Noticed once, never nagging. | Now | brief |
| B7 | Working ring | A look-up or job is running | A short straw arc steps around the bubble every 600 ms, only while it runs and the bubble is visible. | Replaces the infinite glow with cheap motion that carries state. | Now | while live |
| B8 | Waiting nudge | A job starts waiting for you | Otty leans toward the screen twice, slowly, then a still straw dot stays. | The one earned interruption, delivered once. | Now | brief |
| B9 | Pause and carry on | Pause everything, from anywhere | Eyes close (blink frame held) and a pause badge surfaces. Carry on: eyes open, one stretch. | The stop control visibly worked. | Now | brief |
| B10 | Nap after idle | Ten minutes with no use | Three Zzz bubbles rise once, then the eyes-closed frame holds. Hover wakes it with a blink. | A life for the pet without battery cost (D-38). | Next | new art |
| B11 | Feed by dropping | A file or text dragged over the bubble | Otty turns toward it and the rim lights; on drop, two munch frames and a “Got it” bubble. | Makes “ask about this file” discoverable and joyful (D-37). | Next | new art |
| B12 | Speech-bubble replies | Small results: copied, reminder set, noted | A bubble surfaces from the otter for 2.4 s, then ebbs. One at a time. | Answers that need no window stay out of the way. | Next | brief |
| B13 | Fade out for captures | Whole-screen capture starts | Bubble fades out over 200 ms before capture and back over 480 ms after. | Hiding reads as intentional, not a glitch. | Now | brief |
| B14 | Catch the window | The window closes | The window shrinks toward the bubble over 720 ms; Otty bobs once as it “catches” it. | Teaches where the window went. | Next | main |

### C. Hotkeys and capture

Otty summoned from someone else’s app.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Quote surfaces | Highlight hotkey | The quick view opens at the cursor and the highlighted text surfaces as a quote from the cursor side. | Shows Otty took exactly what was highlighted. | Now | brief |
| C2 | Snip lift | A snip region is released | The region lifts and drifts into the quick view’s tray as a thumbnail over 720 ms. | Connects what I drew to what Otty sees. | Next | main |
| C3 | Whole-screen glow | Whole-screen hotkey | A soft straw glow breathes at the screen edges over 1.4 s instead of a flash, then the thumbnail lands. | Confirms the capture without a jolt. | Next | main |
| C4 | Blank capture fix in place | Screen Recording is off | The thumbnail shows a lock and “Otty can’t see your screen yet · Turn on”, in the tray itself. | Fixes the problem where it shows up (UX #3). | Now | on touch |
| C5 | Tray count | Add more is on and another capture arrives | The new thumbnail settles onto the stack; the count rolls from 2 to 3. | Makes collecting several things visible. | Next | brief |
| C6 | Tray full bounce | A capture past the limit | The extra thumbnail drifts in, floats back out, and a tooltip says how many fit. | Explains the limit with no modal. | Later | brief |
| C7 | App tag reveal | A capture carries its app | The app icon fades in; its × folds the tag with an inline Undo for 6 s. | Makes app context, and opting out, tangible. | Next | on touch |
| C8 | Esc cancel | Esc during a snip | Overlay ebbs over 200 ms, no message. | Cancelling should feel free. | Now | on touch |
| C9 | Accessibility missing | Highlight hotkey without permission | The quick view opens with the otter’s head tilt and one line plus “Turn on”. | Calm failure with a single step. | Now | new art |

### Q. Quick view

A few seconds at the cursor.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 | Grow from the cursor | Quick view opens | Scales from 0.96 to 1 from the cursor point, surfacing over 280 ms. | Feels attached to the work. Kept quicker than the window, because it’s summoned. | Now | brief |
| Q2 | Quick exit | Blur or Esc | Ebbs over 200 ms. | Leaving never waits for an animation. | Now | brief |
| Q3 | Visible default action | A capture is ready | “Explain ↵” is a real button; pressing ↵ depresses the keycap. | Removes the hidden default (UX #11). | Now | on touch |
| Q4 | Smooth growth while streaming | Answer text arrives | Height follows the text through animated resizes at most every 80 ms. | No jitter beside the cursor. | Now | main |
| Q5 | Thinking in the avatar | Waiting for the first word | The small otter takes its thinking frame and rising bubbles, which pop when the first word lands. | The pet itself carries state (A8). | Next | while live |
| Q6 | Follow-up surfaces | The answer finishes | The follow-up box surfaces 8 px over 480 ms, focused. | Says “your turn” without a label. | Next | brief |
| Q7 | Hand-off to the window | ↵ “continue in chat” | The quick card grows into the compact window over 720 ms; the conversation keeps its place; the chrome fades in after. | The conversation visibly moves. | Next | main |
| Q8 | Copy morph | Copy in the quick view | Icon morphs to a check for 1.8 s. | Proof at the point of action. | Now | brief |
| Q9 | Proofread marks draw in | A proofread answer arrives | Marks surface with a 60 ms stagger, 600 ms total at most. | Draws the eye across what changed. | Later | brief |
| Q10 | Hints retire | Esc used three times | The Esc hint fades away for good. | Hints teach, then get out of the way. | Next | on touch |
| Q11 | Draft survives | Quick view closes with typed text | On reopen the text is back, with a “Draft” label that fades after 2 s. | Lost words are the worst small failure (A2). | Next | main |
| Q12 | Paste preview | An image pasted | The thumbnail surfaces in the tray; a duplicate says “Already added”. | Paste is the fastest way in. | Now | brief |

### W. The Otty window frame

Widths, screens and Expand / Shrink.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | Expand / Shrink in one move | The Expand button or ⇧⌘E (⌃⌘F is the Mac’s full screen) | One move over 720 ms on `--glide`, drawn by the page as the panel growing inside one window that covers both places, so the window itself resizes only twice (Spec 06). The content stays visible and reflows as it grows, like a Mac window. Pressing again mid-move queues the way back. | Keeps the “same window” promise and hides reflow. | Now | main |
| W2 | Panes enter by side | Width crosses 640 or 980 | Sidebar slides from the left, details pane from the right, over 480 ms. | Shows where new things came from. | Next | brief |
| W3 | Scroll anchor on reflow | Any width change | The message at the top of the view stays at the top. | Resizing never loses your place. | Now | on touch |
| W4 | Push and pop | Moving between screens when narrow | Forward glides in from the right over 480 ms; Back from the left. ⌘[ goes back. | Navigation with a direction (UX #10). | Built: any other move surfaces 10 px | brief |
| W5 | Gliding nav highlight | Choosing a sidebar item | The highlight glides to the new item over 480 ms. | Small, satisfying, shows the move. | Built (rail and sidebar, Settings too) | on touch |
| W6 | Header hairline on scroll | Content scrolls under the header | A hairline fades in only once scrolled. | Separation without a permanent line. | Now | on touch |
| W7 | Notices push, never cover | Health or needs-you lines appear | They grow open in the layout over 480 ms, pushing content down. | Fixes the overlay problem (UX #3, A6). | Now | brief |
| W8 | Open from the bubble | Clicking the bubble | The window grows out of the bubble over 720 ms. | The window belongs to the otter. | Next | main |
| W9 | Drop veil with the otter | Files dragged over the window | The veil surfaces with the otter’s catch pose and a dashed edge that steps only while dragging. | An obvious, on-brand drop target. | Now | while live |
| W10 | Focus comes home | A card or sheet closes | Focus returns to the composer with a soft ring. | Keyboard users never get lost. | Now | on touch |
| W11 | Warm tooltips | Hovering header icons | First tooltip after 500 ms, then instant while moving between icons for 1.5 s. | Fast to scan, quiet to ignore. | Now | on touch |
| W12 | Command bar | ⌘K when roomy | Surfaces at 0.98 scale over 280 ms; the highlighted row glides. | Power without more chrome (A7). | Later | on touch |
| W13 | Title crossfade | The screen changes | The header title crossfades over 280 ms. | A continuous header. | Built (the new title surfaces 3 px) | brief |
| W14 | ~~Return to Dock hiding~~ | — | Dropped 2026-11-21: Otty has no Dock icon in either state, because adding and removing it moved the focus to the app behind. | — | — | — |

### M. Composer

Where every question starts.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | Grows with the text | Typing more lines | Height eases to fit, up to six lines, then scrolls. | No jump, no hidden text. | Now | on touch |
| M2 | Send wakes up | The box gets text | The send button fills with meadow over 280 ms. | Ready, without words. | Now | on touch |
| M3 | Send ripple | Sending | The arrow nudges up; one ring ripples out over 1.4 s; the question surfaces in the chat. | The water signature for “sent”. | Now | brief |
| M4 | Send becomes Stop | An answer starts | The arrow morphs into a square in the same button. | One control, two states, no hunting. | Now | brief |
| M5 | Stopped tag | Stop pressed | The square returns to an arrow; “You stopped this” surfaces under the answer. | Honest state in the chat. | Now | brief |
| M6 | File reading progress | Attaching a large document | A ring fills from the worker’s progress, then the thumbnail surfaces. | Real progress instead of a wait. | Next | while live |
| M7 | Shield on hidden secrets | maskSecrets hides something | A small shield surfaces once on the chip; tapping it opens the hidden-lines sheet. | A quiet safety feature made visible. | Next | brief |
| M8 | Language switch slides | Switching EN \| 中 | The highlight slides between the two; the label reads “Answer in 中文”. | Says what it does (UX #7). | Slide built; the label is still to do | on touch |
| M9 | Draft per chat | Switching chats with text typed | Text stays with its chat; the row says “Draft:” in straw. | Drafts become visible and safe (A2). | Next | main |
| M10 | Chip drifts into the box | Tapping a try-asking chip | Its text drifts into the input and the caret lands at the end; it never sends. | Teaches that chips fill, not send. | Later | brief |
| M11 | Tool tooltips with keys | Hovering snip or attach | Tooltip names the action and its shortcut. | Teaches the hotkey where it’s used. | Now | on touch |
| M12 | Disabled with a reason | A tool unavailable while answering | Buttons dim and the tooltip says “After this answer”. | A dead button with no reason feels broken. | Now | on touch |
| M13 | Edit last with ↑ | ↑ in an empty box | The last question lifts back into the box. | A fast fix for typos. | Later | on touch |

### S. Thinking and streaming

From send to the last word.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Question surfaces | Sending | The user bubble rises 18 px from the composer and settles over 480 ms. | Connects the box to the chat. | Now | brief |
| S2 | Thinking says what it’s doing | Waiting, then tools | The otter takes its thinking frame; the line beside it crossfades from “Thinking…” to “Searching “HTTP 429”…”. | Specific beats animated (A8). | Built (one line ebbs before the next surfaces) | while live |
| S3 | Chips surface and settle | Each tool call | A chip surfaces, steps while running, turns to a check when done. | Visible progress made of real events. | Now | while live |
| S4 | Chips fold away | The answer finishes | Three or more chips fold into “3 steps” over 480 ms. | Lead with the result. | Next | brief |
| S5 | Chunks surface | Text streams | Each chunk clears from a light blur over 420 ms; a stepped caret marks the end. | Reads like ink settling, without per-character cost. | Next | brief |
| S6 | New text below | Scrolling up while text streams | A “↓ New text” label surfaces at the bottom; tapping glides down and resumes following. | Today following stops silently; this says why. | Now | on touch |
| S7 | Extras wait for the end | The answer finishes | Actions, Noted lines and tips surface after the last word, 200 ms apart. | The footer never pushes the answer mid-read. | Now | brief |
| S8 | Happy wiggle on done | Answer complete | The answer’s small otter does one slow wiggle with eyes closed. | A tiny thank-you that means “finished”. | Now | brief |
| S9 | Honest slow line | No first word after 6 s | “Still with you. DeepSeek is slow right now.” surfaces. | Honesty about waiting builds trust. | Next | brief |
| S10 | Calm error | A request fails | The otter tilts its head; a friendly card surfaces with Try again. No red flash. | Errors feel handled. | Now | new art |
| S11 | Answer elsewhere | A chat finishes while another is on show | Its row’s dot surfaces; the sidebar otter glances toward the list. | Turns belong to chats; show it. | Next | brief |
| S12 | Look-up moves to the background | A long question becomes a job | The thinking line becomes “Moved to the Logbook · back by 4:10”. | The conversation never blocks. | Next | brief |

### V. Answer content

Everything inside an answer.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | Explain card opens in place | Clicking an explain term | The card grows open under the paragraph over 480 ms. A cached card opens at once, with no fake delay. | Keeps the reader’s place. | Now | brief |
| V2 | Explain placeholder | A card not cached yet | Two grey lines step twice, then hold. | Something is coming, without endless shimmer. | Next | brief |
| V3 | Term hover tint | Hovering an explain term | A soft meadow tint under the word. | “There’s more here.” | Now | on touch |
| V4 | Changes draw the eye | A proofread fixed block arrives | Inserts get a meadow highlight that drifts to the resting tint over 1.4 s. | Shows what changed without reading twice. | Next | brief |
| V5 | Copy fixed text | Copy on the fixed block | Check morph and “Copied the fixed text”. | Names what was copied. | Now | brief |
| V6 | Code copy | Copy on a code block | Icon to check for 1.8 s. | Expected. | Now | brief |
| V7 | Drawing placeholder | A drawing renders | A pencil line draws a frame once, then the picture crossfades in. | Lazy loading feels intentional. | Next | brief |
| V8 | Chart rises once | A chart first comes into view | Bars rise from the baseline over 900 ms with a 40 ms stagger, once. | Charts read better when they build. | Next | brief |
| V9 | Slides glide | Changing slides | The slide glides across over 480 ms; arrow keys work. | A deck should feel like a deck. | Next | on touch |
| V10 | Export lands | Saving a drawing or deck | Progress, then “Saved to Downloads” with Show. | Closes the loop on files. | Next | brief |
| V11 | Link host on hover | Hovering a link | A tooltip shows the host in bold, then the path. | Lookalike domains spotted where they’re clicked. | Now | on touch |
| V12 | Notebook used, quietly | An answer used a note | A small bookmark; hover shows “Used: prefers short answers”. | Folds the usual case away (UX #6). | Next | on touch |
| V13 | Tip after the answer | A 💡 tip | Surfaces after streaming ends. | Tips never push the answer. | Later | brief |
| V14 | Math result copy | A calculation card | Hover reveals Copy; clicking the sum reveals the steps. | Detail on request. | Later | on touch |

### K. Confirm cards and safety

Where trust is won or lost.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | Decision moment | A confirm card appears | The card surfaces above the composer over 480 ms; the composer dims; focus moves to the safe choice. | Marks a real decision without a modal. | Now | brief |
| K2 | Late-arriving buttons wait | A card appears under the pointer | Its buttons ignore clicks for 400 ms while they fade to full strength. | No approving something you never saw. | Now | on touch |
| K3 | Card becomes a receipt | Allow or Skip | The card folds over 480 ms into one line, “Reading jreast.co.jp · Undo”, that stays. | Every decision leaves a trace (try it on Home). | Now | brief |
| K4 | Host first | Any card with an address | Host bold, path small; hover shows the full address. | The thing worth checking is what the eye hits (UX #1). | Now | on touch |
| K5 | Unusual cards look unusual | New site, can’t-undo, or over a limit | Only these get a straw edge and a consequence line, surfacing just after the title. | Breaks the Allow reflex. | Now | brief |
| K6 | Hold to confirm | Actions that can’t be undone | Press and hold for 1.2 s while the button fills; releasing early cancels. Keyboard: Enter twice. | Irreversible becomes deliberate (try it in Settings › Privacy). | Next | on touch |
| K7 | Always for this site | After the second allow for one host | A secondary line surfaces after 600 ms. | Earned trust, offered once. | Next | brief |
| K8 | Waiting card on return | The window opens on a waiting card | One slow meadow glow around the card, then still. | Points to the one thing that needs you. | Now | brief |
| K9 | Undo toast | Any change with an undo | A toast surfaces with a line that drains over 6 s and pauses on hover. | Shows how long Undo lasts. | Now | brief |
| K10 | Undo plays back | Undo pressed | The undone thing visibly returns and the toast says “Undone”. | Seeing it return is the proof. | Now | brief |
| K11 | Pause greys the live | Pause everything | Running rows desaturate and freeze over 720 ms. Carry on: colour returns. | “Nothing is running” is visible (try it). | Now | brief |
| K12 | Left your Mac chip | A turn sends something out | A small outbound line in the answer footer linking to the Logbook. | Visibility where it happens (D-31). | Next | on touch |

### T. Step cards

The model proposes, the user clicks.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Tick draws | Marking a step done | The check draws over 480 ms, text mutes, the next step opens. | Satisfying progress. | Now | brief |
| T2 | Two kinds of button | Any step with an action | “Otty does it” carries the target app’s icon and fills; “I did it” is outlined. | Acting vs confirming (UX #9). | Now | on touch |
| T3 | Action result | An action runs | The app icon pulses once, then “Pasted into Excel ✓ · Undo”. | Exactly what happened, with its way back. | Next | brief |
| T4 | Keys show the press | Hovering a keycap sequence | Keycaps depress one after another. | Teaches the shortcut by showing it. | Later | on touch |
| T5 | Step count rolls | Progress | “2 of 5” rolls to “3 of 5”. | Small progress feedback. | Later | brief |
| T6 | I’m stuck opens inline | Clicking I’m stuck | A text line opens under the step, focused. | Help without leaving the card. | Later | on touch |

### N. Notebook (memory)

Note, use, forget, with the Noted line as the control.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | Pen stroke under Noted | A new note is kept | A straw underline draws slowly under the fact over 1.4 s; Undo sits beside it. | The safety control gets the eye, once (try it in Chat). | Now | brief |
| N2 | Forgotten state | Undo on a Noted line | The fact strikes through, Undo becomes “Forgotten”, and the line stays. | Proof that forgetting happened. | Now | brief |
| N3 | Row arrives highlighted | Adding a note in the Notebook | The row surfaces with the found glow. | Shows where it went. | Now | brief |
| N4 | Edit in place | Editing a note | The text becomes a field in place; Enter saves with a check. | No forms for one line. | Next | on touch |
| N5 | Forget with undo | Forgetting a note | The row folds; an Undo toast surfaces. | Safe to tidy. | Now | brief |
| N6 | Jump to the source | Where a note came from | The chat opens and the message glows. | Answers “why does Otty think that?”. | Now | brief |
| N7 | Changed belief stands out | A note changes what Otty believed | Its own line, with “was: …” muted. | Changes in belief are the risky case. | Next | brief |

### H. Chats, find and history

Finding your way back.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | Live and waiting marks | A chat is answering or waiting | A stepped dot for live; the word “Waiting” in straw. | The wide layout works on day one (A9). | Now | while live |
| H2 | Row actions on hover | Hovering a chat row | Delete and more fade in at the right. | Clean rows, tools on request. | Now | on touch |
| H3 | Delete with undo | Deleting a chat | The row ebbs out; an Undo toast surfaces. | Deletion that forgives. | Now | brief |
| H4 | Scroll position kept | Returning to a chat | It opens where you left it. | Respects the reader. | Next | on touch |
| H5 | Title settles in | A title is generated | “New chat” crossfades to the real title. | No sudden rename. | Next | brief |
| H6 | New chat clears softly | ⌘N | The chat ebbs, the old chat drifts to the top of the list, the box focuses. | Shows where the old chat went. | Next | brief |
| H7 | Search highlights | Typing in Find a chat | Matched words tint; rows keep a fixed height. | Fast scanning. | Now | on touch |
| H8 | Find bar glide | ⌘F in a chat | The bar slides down; the current match glows; ↵ glides to the next. | Half there today. | Now | brief |
| H9 | Merged find | ⌘K | One “Find a chat”. | Fewer places (UX #10). | Next | on touch |
| H10 | Unread fades on view | Opening an unseen answer | The dot fades after a second in view. | Unread means unseen. | Next | brief |

### R. Logbook

Found with a question in mind, not browsed.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Views, not pills | Choosing a view in the list | The row takes a soft meadow fill; the ledger fades and resettles over 480 ms; the title and subtitle change. | Calm, scannable, and the same list pattern as Settings. | Now | on touch |
| R2 | Ask the Logbook | Typing a question | Rows that match surface, the rest ebb; the view name becomes the question. | Built for “did my CV leave my Mac?” (UX #4). | Next | on touch |
| R3 | Entry opens beside | Clicking an entry | Wide: details slide into the pane. Narrow: a page glides in. | One component at every width (A4). | Next | brief |
| R4 | Real progress | A job is running | A segmented bar of the expected pages, the current segment stepping. | Progress made of facts. | Now | while live |
| R5 | Finished moves | A job completes | Its entry drifts from Now into Today and the badge clears. | Completion as a place change. | Next | brief |
| R6 | Calm clocks | Coming-up times | “In 2 h” updates once a minute. | Cheap and calm. | Now | while live |
| R7 | Steering note | Adding a note to a running look-up | The note attaches under the entry: “Note: only JR East”. | Steer while it runs (UX #8). | Next | brief |
| R8 | Stopping is honest | Stop pressed | “Stopping…” until the runner confirms. | No pretending. | Now | brief |
| R9 | Late run | A job more than a day late | A card with “Looked a little late”, which glows once. | Honest, once. | Next | brief |
| R10 | Quiet days folded | Older entries | “Monday · 9 quiet entries” opens on click. | Lead with what needs you. | Now | on touch |
| R11 | Undo in a notification | A notification about a change | The macOS notification carries Undo. | Undo where the news lands. | Next | main |

### P. Health and permissions

Fixing setup without fear.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | One button that changes | Granting a permission | “Turn on” becomes “Restart Otty to finish” when the grant is seen. | A sequence, not a puzzle (UX #3). | Now | brief |
| P2 | Granted closes the loop | Permission detected | The banner turns to a check, “Otty can see your screen”, then folds away after 2.4 s. | The success moment that never existed. | Now | brief |
| P3 | Banner becomes a dot | Dismissed | The banner folds; a straw dot surfaces on Settings and glows once when you next try a snip. | Out of the way, not forgotten. | Next | brief |
| P4 | Picture of the switch | Permission steps | A small drawing of the System Settings switch flipping, played twice, slowly. | People find the switch faster. | Next | brief |
| P5 | Restart that returns | Restart to finish | Otty reopens where you were, and the otter waves. | Restarts feel safe. | Later | new art |

### G. Settings

Sections, and changes as you go.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| G1 | Saved whisper | Any setting changes | “Saved” fades in beside the section title, stays 1.8 s, fades. No Save button. | Shows the change took (UX #2; try it). | Now | brief |
| G2 | Toggle glide | Toggles | The thumb glides over 280 ms with a colour fill. | Expected, and clear. | Now | on touch |
| G3 | Section summaries | The section list | Each section shows a one-line summary of its current state, which updates as you change things. | You can see your setup without opening anything. | Now | on touch |
| G4 | Key check | Check and save on a key | Progress, then a check with the service name, or one line on what to fix. | A test with visible steps. | Now | brief |
| G5 | Counts before forgetting | Shortening chat retention | A confirm card with the real count, “This forgets 23 chats”. | Nothing deleted by surprise. | Now | on touch |
| G6 | Hold to forget | Can’t-be-undone rows | Hold-to-confirm, the same as cards. | One rule for irreversible things. | Next | on touch |
| G7 | Hotkey recorder | Changing a shortcut | The field listens; keys appear as keycaps; a clash shows inline. | No typing key names. | Next | on touch |
| G8 | Find a setting | Typing in the settings search | Matching rows surface across sections with the section name; Enter jumps and the row glows once. | Settings stay findable as they grow. | Next | on touch |
| G9 | Usage bar | Opening Usage & limit | The bar fills to its value once over 900 ms; near the limit it turns straw. | Readable, no alarms. | Next | brief |
| G10 | Pause until | Pause for a time | The pause card shows “until 3pm”; when it ends, it ebbs and Otty stretches. | Pause that ends itself is visible. | Next | brief |

### O. Onboarding

First impressions, in the roomy state (A11).

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| O1 | Hello wave | First launch | Otty waves; three lines surface 160 ms apart. | A greeting from a pet, not a form. | Next | new art |
| O2 | Progress dots | Moving between steps | Dots glide; Back and Continue never move. | Calm, predictable. | Now | brief |
| O3 | Permission noticed | A permission granted on its step | A check draws and the step moves on after 1.2 s. | No “did it work?”. | Now | brief |
| O4 | First real answer | The last step | Otty explains something on screen; one happy wiggle. | First success inside onboarding. | Next | brief |
| O5 | Shrink to the bubble | Onboarding ends | The roomy window drifts down and shrinks into compact beside the bubble over 720 ms. | Shows where Otty lives (LAUNCH 15.2). | Next | main |
| O6 | First keepsake | First snip, file or translation | A keepsake drifts into the den’s sidebar entry. | Teaches features through reward. | Den | new art |
| O7 | Skip is calm | Skip pressed | The flow ebbs to the empty chat; nothing scolds. | Respect for people who skip. | Now | brief |

### U. Pick up text and the viewer

Reading pictures.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | One reading sweep | OCR running | A soft line sweeps down the picture, at most three times. | Otty is reading. | Next | while live |
| U2 | Text shows itself | Text found | Word boxes outline, then fade to invisible over 1.4 s. | Teaches that the text is selectable. | Now | brief |
| U3 | Copied count | ⌘C | “Copied 42 words” surfaces. | Names what was copied. | Now | brief |
| U4 | No words found | OCR finds nothing | The otter’s head tilt and one still line. | Calm empty state. | Now | new art |
| U5 | Zoom from the thumbnail | Opening a picture | The picture grows from its thumbnail over 720 ms and back on close. | Keeps place. | Next | brief |
| U6 | Smooth zoom | Pinch or scroll | Eased zoom; double-click switches fit and 100%. | Expected on a Mac. | Next | on touch |
| U7 | Slide keys | Slides in the viewer | Arrow keys, a gliding transition, a rolling page count. | Present well. | Next | on touch |
| U8 | Select-all wash | ⌘A in pick up | All boxes tint and fade over 480 ms. | Confirms select-all. | Later | brief |

### L. Home

The long-term landing screen.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| L1 | Greeting settles | Opening Home | The otter surfaces first, then the greeting, then Needs you, 160 ms apart, once per open. | A calm arrival, in order of importance. | Next | brief |
| L2 | Now point breathes | Something is running | The river’s “now” dot steps between two tints, only while running and visible. | The day is visibly moving. | Next | while live |
| L3 | River flows on | A task finishes | Its point fills, the text mutes, and “now” drifts down to the next item over 720 ms. | Progress through the day as a place change. | Next | brief |
| L4 | Offer folds politely | No thanks on an Otty noticed card | The card ebbs and “OK, I won’t ask about this again” surfaces for 2.4 s. | Declining feels respected; the attention budget shrinks. | Next | brief |
| L5 | Goal bar drifts | Progress on a goal | The bar extends over 1.4 s; reaching a goal gets one happy wiggle from the big otter. | Celebrate, never judge. | Later | brief |
| L6 | Empty Home is still warm | Nothing needs you | Needs you disappears; the greeting says “Nothing needs you. Ask me anything.” | No empty boxes. | Now | on touch |
| L7 | Otter to den | Tapping the big otter | Otty dives (ebbs below the water line) and the den surfaces. | A playful door that keeps work and play apart. | Den | new art |

### D. Otty’s den

Feeding, play and keepsakes, within the den’s rules.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Food from captures | Any question with a capture | The capture’s icon drifts into Otty’s paws; a shell cracks for “got it”. | Real help becomes food. | Den | new art |
| D2 | Keepsake flip | A keepsake unlocks | The card turns slowly to reveal it; locked ones show a silhouette and a hint. | Rewards teach features. | Den | brief |
| D3 | Petting | Stroking the otter | Happy frame and a few rising bubbles. | Play with no model call. | Den | new art |
| D4 | Toss a shell | Dragging a shell to Otty | Otty catches it and holds it on its belly. | Delight, all local. | Den | new art |
| D5 | Daily hello | First open of the day | A short greeting bubble. Never “I missed you”. | A happy hello, no guilt. | Den | brief |
| D6 | Stats that celebrate | Opening the den | “12 new words this month” surfaces; no rankings. | Celebrate, never judge. | Den | brief |
| D7 | Accessories move with Otty | Wearing a hat or scarf | Overlays live inside the otter body, so they bob and blink with it. | Cosmetics that feel worn. | Den | new art |

### X. Across the whole app

Rules every view shares.

| ID | Interaction | When | Then | Why | Build | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| X1 | Press feedback everywhere | Any button press | 120 ms scale to 0.97 or a darker fill. | Everything responds to touch, instantly. | Now | on touch |
| X2 | Visible focus | Keyboard focus | A clear meadow ring on focus-visible only. | Accessible without clutter. | Now | on touch |
| X3 | Rolling numbers | Counts change | Digits roll with tabular figures over 480 ms. | Change is noticed, not jumpy. | Next | brief |
| X4 | Bounded placeholders | Anything loading | Two stepped cycles, then hold. | The idle budget, kept. | Now | brief |
| X5 | Interruptible motion | Typing or clicking mid-animation | The animation jumps to its end state. | Slow motion never blocks. | Now | on touch |
| X6 | Reduced motion swap | prefers-reduced-motion | Movement becomes a 200 ms fade; the otter holds still. | Nothing lost, nothing moving. | Now | on touch |
| X7 | Asleep windows | Hidden windows | data-asleep pauses everything. | Keeps the budget honest. | Now | while live |
| X8 | Opt-in sounds | Otter wake, copied | Soft, short, off by default; never on safety moments. | Delight for those who want it. | Later | on touch |
