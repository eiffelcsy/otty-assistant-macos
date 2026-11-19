# Spec 05 · The frame and layout from width

**Status:** draft for review, 2026-11-19. Planned as D-64 (DEVLOG). Builds on `docs/DESIGN.md` ("Foundations", "Layout", catalogue W1–W14) and the draft (`docs/design/otty-window-draft.html`). Specs 02–04 describe their screens inside this frame; where a column width here differs from theirs, this spec wins.

**Why fifth.** Today `Panel.tsx` is one component that swaps whole views (`chat`, `settings`, `history`, `activity`, `notebook`, `onboarding`) under one header. Splitting it into a **frame** (header, navigation, columns) and **screens** (what goes in the columns) is what makes the window's width do the layout. Once it's split, dragging the panel wider gives the medium layout with no new screens, and Spec 06's roomy window is the same frame with different window behaviour.

**What changes from the draft, and why.** Four things, all polish:
- **The rail is 72, not 64,** so the traffic lights fit inside it (52 px of lights with 10 px either side) when the roomy window is medium-width.
- **The list column is 248 at wide, not 250,** to stay on the 4 px grid. The details pane stays 300.
- **At wide, the sidebar runs the full height of the window,** with the traffic lights inside it, as in Mail and Notes. The header starts after it. In the draft the header ran across the whole window, which wasted the sidebar's top and made the sidebar look like a panel inside a window.
- **Columns appear when the main column can keep its minimum,** not at a fixed width, so a list screen never squeezes a chat to 216 px (the draft's list screens did at exactly 980).

## Screens and the frame

A **screen** declares what it has, and the frame decides where each part goes:

| Screen | List part | Main part | Details part | Root or pushed |
| --- | --- | --- | --- | --- |
| Home | — | Home (Spec 06) | Home's side blocks | Root |
| Chat | Chats (the list) | The chat | This chat | Root |
| Logbook | Views | Ledger | The opened entry | Root, or pushed from the header's Logbook button |
| Notebook | Groups | Notes in a group | — | Root |
| Settings | Sections | A section | — | Root, or pushed from ⌘, |
| Onboarding | — | Onboarding | — | Takes the whole window, no navigation |

`Den` joins the nav when the den ships (BRAINSTORM, "Otty's den"); until then the nav doesn't hold a place for it.

**Rules**
- A screen never measures the window. It reads which parts are on show from the frame (`useFrame()`: `{ band, listShown, detailsShown, push, back }`) and lays out its own content with container queries on its own column.
- A part that isn't on show as a column opens as a **page** in the main column, with Back. That's the only other way a part can appear: no drawers, no overlays.
- Pushing a page records where you were. Back (and ⌘[) returns to it with the scroll position it had.
- The current screen, its pushed pages, each column's scroll position and the chat on show are kept in the renderer per window (they're layout, not data). What's in them still comes from main.

## Bands

Width alone sets the band. A column joins only when the main column keeps its minimum of **400** (a chat at a comfortable reading width). The boundaries are worked out from that one number, the same for every screen, so switching screens never makes a column pop in or out:

| Band | Window width | Columns | At these test widths |
| --- | --- | --- | --- |
| Compact | < 640 | One screen at a time | 380, 420 |
| Rail | 640–711 | 72 rail · main | 640 |
| Medium | 712–979 | 72 rail · 240 list · main | 760, 900 |
| Wide | 980–1247 | 216 sidebar · 248 list · main | 980, 1200 |
| Wide with details | ≥ 1248, or ≥ 980 on a screen with no list | 216 sidebar · 248 list · main · 300 details | 1280, 1440 |

So Home (no list) shows its details pane from 980, and Chat from 1248 (216 + 248 + 484 + 300). The roomy window opens at 1280 (Spec 06), so a first open shows everything.

Each band boundary is a container query on the window body (`container: otty / inline-size`), never a viewport media query, so the ui-preview's frames and the real window behave the same. The bands live as constants in one place (`renderer/src/frame/bands.ts`) and the CSS reads them through custom properties set by that module, so the two can't drift.

## Window metrics

| | Floating (compact state) | Roomy state |
| --- | --- | --- |
| Header height | 44 | 52, so the traffic lights sit on its centre line |
| Traffic lights | None | At x 16, centred in the header row (y 26). In the sidebar or rail when one is shown, otherwise in the header with 84 px clear before the first control |
| Window corner | `--radius` (24), drawn by the page | The system's, with the system shadow |
| Minimum size | 360 × 420 | 720 × 520 |

The header's height follows the state, not the band: a floating window dragged to 1000 px still has a 44 px header and no traffic lights. (Spec 06 covers the states.)

## The header

One row, 44 or 52 high, everything that isn't a control a drag region. Its hairline (`--hairline`) appears only once the column under it scrolls (W6), per column.

### Compact

```
┌───────────────────────────────────────────────┐
│ [🦦 Chat ⌄]                     ⏸  📓•  ＋  ⤢ │  44
└───────────────────────────────────────────────┘
  12                                          8
```

| Part | Spec |
| --- | --- |
| Padding | 0 8 0 12 |
| Screen menu (on a root screen) | One 32 px quiet button, padding 0 8 0 2, radius 10: the small otter (28, inside the button's left edge), 6 gap, the screen's title in `--fs-title` 700 `--text`, 4 gap, a 12 px chevron in `--text-2`. Opens a Menu (Foundations) below it: Home ⌘1, Chats ⌘2, Logbook ⌘3, Notebook ⌘4, a separator, Settings ⌘,. Each item has its 14 px glyph; the Needs you count sits at the Logbook item's trailing edge in `--straw-ink` 700 |
| Back (on a pushed page) | A 32 px icon button with the 16 px back glyph (nudged 1 px left), then the page's title as plain text in `--fs-title` 700, 4 gap. The otter isn't shown |
| Title width | Takes what's left; truncates first, before any icon is dropped |
| Icons | Pause, Logbook, New chat, Expand: 32 px icon buttons, 4 apart, 16 px glyphs in `--text-2`. Expand's glyph is `--brand-text` (the way into the roomy window). Logbook carries the 7 px `--straw` dot when something needs you. At most four, always in this order, on every screen, so the hand learns them |
| Paused | Pause becomes Carry on: the same button with the play glyph in `--straw-ink` and a `--straw-soft` fill. The tooltip says until when |

The draft's otter and title were separate; joining them into one button makes "where am I, and where else can I go" one affordance, the same pattern as the Logbook's compact view menu (Spec 04).

### Rail, medium and wide

The header covers only the columns right of the rail or sidebar, and is split at the column lines, which run up through it (one continuous 1 px `--hairline` from top to bottom, as in Mail):

| Segment | Holds |
| --- | --- |
| Over the list column | The list's title (`--fs-title` 700, 16 in) and its one action as a 32 px icon button at the trailing edge, 8 in: New chat for Chats, nothing for Logbook views, Notebook groups or Settings sections |
| Over the main column | Back when a page is pushed, the screen's or chat's title (`--fs-title` 700), then the screen's actions (at most three 32 px icon buttons, 4 apart), then Pause and, in the floating state only, Expand. Padding 0 12 0 16 (24 in the wide band) |
| Over the details pane | The pane's title (`--fs-label` `--text-2`, 16 in) and a 28 px "Hide this pane" icon button, 8 in |

The Logbook icon leaves the header once the rail or sidebar shows it, so the header never repeats the nav.

**The title** is the screen's name, or the chat's title on Chat (Spec 03's empty chat has none, so the header shows "New chat" in `--text-2`). A title change crossfades over `--t-quick` (W13).

## The rail (640–979)

72 wide, full window height, `--surface-2`, a 1 px `--hairline` on its right.

| Part | Spec |
| --- | --- |
| Top | The header row's height (44 or 52). Holds the traffic lights in the roomy state, nothing in the floating state |
| Otter | 12 below the top row: the otter at 40, centred, inside a 48 px round button (Home). Its working ring (B7) and waiting dot (B8) are the same as the bubble's. Tooltip: Otty's one-line status |
| Nav | 12 below the otter: Home, Chats, Logbook, Notebook as 48 × 40 buttons, radius 10, 4 apart, centred. 20 px glyph in `--text-2`. Selected: `--surface` with `--elev-1` and a `--text` glyph (the draft's pill), which glides between items over `--t-settle` (W5). Hover: `--fill`. A count becomes a 7 px `--straw` dot at 6 px from the button's top-right, with a 2 px `--surface-2` ring |
| Foot | 12 from the bottom: Pause as a 48 × 40 button (the same style; while working, a 7 px `--brand` dot steps at its top-right, and while paused the glyph is `--straw-ink` on `--straw-soft`), 4 gap, Settings |
| Tooltips | To the right, 8 from the rail, with the name and shortcut ("Logbook  ⌘3 · 1 needs you") |

## The sidebar (≥ 980)

216 wide, full window height, `--surface-2`, a 1 px `--hairline` on its right. Padding 0 12 12.

| Part | Spec |
| --- | --- |
| Top | The header row's height: traffic lights in the roomy state |
| Otty card | 8 below the top row. A 56 px button, padding 8, radius 12, gap 12: the otter at 40, then "Otty" in `--fs-ui` 700 `--text` with its one-line status 2 below in `--fs-meta` `--text-2` (one line, ellipsis): "Reading train times", "1 needs you", "All quiet", "Paused until 3pm". Hover `--fill`. Opens Home |
| Nav | 12 below the card. Rows 36 high, padding 0 10, radius 10, gap 10: a 16 px glyph in `--text-2`, the label in `--fs-ui` 600 `--text-2`, the count at the trailing edge in `--fs-meta` 700 tabular `--straw-ink` (Needs you on Home and Logbook only). Selected: `--surface`, `--elev-1`, glyph and label `--text`, gliding between rows (W5). Rows 2 apart |
| Foot | Pinned to the bottom, 12 apart: the Pause card, then Settings as a nav row |
| Pause card | `--surface`, `--elev-1`, radius 14, padding 12, gap 8. Line 1: an 8 px dot (`--brand` stepping while working, `--straw` still while paused, `--text-3` when idle), 8 gap, `--fs-small` `--text-2` with the state word in 700 `--text`: "**Working** · 1 look-up", "**Paused** until 3pm", "**All quiet**". Line 2: a full-width small button (28), secondary: "Pause everything", or primary "Carry on" while paused. While idle the card folds to line 1 plus the button, same height, so the sidebar never jumps |

Hiding the sidebar (⌃⌘S, or View › Hide sidebar in the roomy state) collapses it to the rail, not to nothing: the nav and Pause stay one click away (A10).

## The list column

240 (medium) or 248 (wide), `--bg`, a 1 px `--hairline` on its right, scrolling on its own. Padding 8 8 16. It's the screen's own content (Chats' rows, Logbook's views, Notebook's groups, Settings' sections); the frame gives only the column, the header segment and this padding. Its search field, when a screen has one, is 36 high, 8 below the header, and 8 above the first row.

## The main column

| Band | Gutters | Reading column |
| --- | --- | --- |
| Compact | 16 | Full width less gutters |
| Rail, medium | 16 | Full width less gutters, at most 680 |
| Wide | 24 | At most 680 (Chat, Logbook), 720 (Home), 600 (Settings, Notebook), centred; Settings and Notebook left-aligned 32 in |

The composer, on screens that have it (Home, Chat), sits under the main column only, never under the list or details, centred under the reading column (Spec 03).

## The details pane

300 wide, `--surface-2`, a 1 px `--hairline` on its left, scrolling on its own. Padding 16; blocks 16 apart, each a label (`--fs-label` `--text-2`) 8 above a small card (`--surface`, `--elev-1`, radius 12, padding 12, gap 8). A screen fills it; the frame owns the shape. It can be hidden (⌥⌘0, or its header button), and stays hidden for that screen until shown again. When it isn't a column, its content goes where the screen says: a page behind a header button on the main column (Chat's "This chat", the Logbook's opened entry), or folded into the main column itself (Home's side blocks, Spec 06).

## Notices

The health banner and the paused line are the frame's, not a screen's: they sit at the top of the main column, under the header, in the layout (W7), at most 40 px, the rest behind "More". They never span the list or details columns, so the eye stays on the thing that's affected.

## Keyboard

| Keys | Does |
| --- | --- |
| ⌘1 – ⌘4 | Home, Chats, Logbook, Notebook |
| ⌘, | Settings |
| ⌘N | New chat |
| ⌘[ and ⌘] | Back and forward through pushed pages |
| ⌃⌘S | Show or hide the sidebar (wide only) |
| ⌥⌘0 | Show or hide the details pane |
| ⇧⌘E | Expand or shrink (Spec 06) |
| F6 / ⇧F6 | Move focus between the columns: nav, list, main, details |

Tab order follows the columns from left to right, then the composer. Each column is a landmark (`nav`, `region` named by its title, `main`, `complementary`).

## Motion

| Moment | Motion |
| --- | --- |
| Crossing a band while dragging (W2) | Nothing animates while the pointer is down: the layout follows the width at once. On release, a column that joined fades in over `--t-quick` |
| Crossing a band on Expand or Shrink (W1) | Spec 06: the content dims, the window moves, the new layout surfaces |
| Rail ⇄ sidebar | The glyphs glide from the rail's centre line (x 36, 20 px) to the sidebar's (x 30, 16 px) over `--t-settle`, so they move 6 px rather than jump; the labels and the Otty card's text fade in after the width settles |
| Switching a root screen | The main column crossfades: out over 120 ms (`--ebb`), in over `--t-quick` with a 4 px rise. The selected nav row glides (W5) |
| Push and pop (W4) | Forward glides in from 24 px right over `--t-settle` while the old page fades and moves 24 px left; Back is the mirror. Only within the column the page lives in |
| Scroll anchor on reflow (W3) | Any width change keeps the first visible message or row at the same offset from the top of its column |
| Reduced motion | Every one of these becomes a 200 ms fade |

## States to draw

Each band at its test widths, in light and dark: Home, Chat with a long title, Chat with a pushed "This chat" page, Logbook with an entry pushed, Notebook, Settings with a section open, the screen menu open, the rail's tooltips, the sidebar hidden to a rail, the details pane hidden, the paused frame, the health banner shown, working (dots stepping) and needs-you counts, onboarding (no navigation), and the window at its 360 × 420 minimum.

## What main must provide

Nothing new for the frame itself: the Needs you count and the working and paused state already reach the renderer as `ChatEvent`s and settings (the counts come from D-63's `logbook` query). Window size is reported by the container, not by main.

## Preview scenes needed

`tools/ui-preview` gets `&w=` (any width) and `&h=`, applied to the frame's container, plus `&state=floating|roomy` to draw the traffic-light row. Scenes: `frame-home`, `frame-chat`, `frame-pushed`, `frame-menu`, `frame-rail`, `frame-hidden-sidebar`, `frame-paused`, `frame-min`, each at 380, 420, 640, 760, 980, 1200 and 1280, light and dark. The existing scenes keep working at 420.

## Done when

`Panel.tsx` is a frame plus screens, every existing scene renders the same at 420 (the screens baseline is the check), every band renders at its test widths with no horizontal scroll and no column under its minimum, dragging the panel from 360 to 1440 never loses the scroll position or the draft, and keyboard and screen-reader navigation reach every column.
