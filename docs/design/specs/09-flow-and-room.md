# Spec 09 · Flow and room: one move between screens, columns you can size, pages with margins

**Status:** in build (D-76). Builds on Spec 05 (the frame), Spec 06 (roomy window and Home), Spec 08 (one cove, the camera).

**Why.** Three things make the frame feel cheap in use. (1) Tilting from the cove to a shallow screen, the new screen's header is there at once, over the moving painting, before the sheet it sits on has risen. (2) Home and the empty chat are the same cove with the same Otty, greeting, Try asking card and message box, yet moving between them fades the whole screen out and in, so it reads as a reload; and the chat list snaps in instead of opening. (3) Pages run edge to edge with 8–12 px gutters at every width (the Notebook's heading sits 8 px from the sidebar), so wide windows look unfinished.

## Part 1 · The header rides the sheet

The header of a shallow screen sits on the reading sheet, so it arrives with it, never ahead of it. On a camera tilt (full ↔ wash, Spec 08 Part 9) the main column's header plays exactly the screen body's move: hidden at the start, then opacity 0 → 1 and y 32 → 0 (up) or 16 → 0 (down), with the body's delay and duration (up: delay 0.25 × camera, 0.75 × camera; down: delay 0.55 × camera, 0.6 × camera), `swell` for y and `glide` for opacity. The list column is on side glass, not the sheet, so it doesn't wait. Moves that aren't a tilt keep W4 and W13 as they are. Reduced motion: unchanged (the 200 ms fade on the body only).

Chosen over "fade the header in once the sheet lands" because the header and the words under it are one surface: they rise together as one sheet, and nothing waits for a second beat.

## Part 2 · Home and the empty chat are one place

**The move.** Between Home and the empty chat (both `cove: 'full'`, neither pushed) the screen never fades or slides as a whole. Instead:

1. **The list opens by its width.** Where the chat list is a column (medium and wide), it opens from 0 to its width over `T.settle` on `glide`, and closes the same way. Its contents keep their full width and are uncovered, never squeezed. The main column narrows with it, so everything centred in it (greeting, Otty, the card, the box) rides over as one. The painting stays still: it is laid out from the nav's edge and clipped at the list's live edge (`--list-now`). This glide plays whenever the list appears or goes (any screen move, the sidebar button, ⌃⌘S), and is instant on window resizes that cross a band, during the window's glide between states, and under reduced motion.
2. **What both screens show glides from where it was.** The greeting block (`words`), the Try asking card (`try`) and the message box (`box`) are marked `data-shared`. Their old boxes are read before the swap; after it, each new one plays from the old centre-x and top to its own over `T.settle` on `glide` (FLIP). Otty is at the same place on both and needs nothing: it simply rides with the column.
3. **Only words that differ surface.** Inside those pieces, the parts whose words change (`data-fresh`: the greeting lines, the card's rows) fade 0 → 1 over `T.quick`. The card's glass, the halo and the box never fade.
4. **Home doesn't arrive.** Mounting in that one move, Home skips its staggered arrival (`StillMove` context), and it opens on the last page it showed (a module cache) instead of an empty frame while it loads.
5. **Same card, same width.** The empty chat's Try asking card is 688 wide like Home's blocks (`.empty .try` margin 0 12).

Future (BRAINSTORM): Otty swims from one spot to the other instead of riding the column.

## Part 3 · Columns you can size

**The edges follow the hand.** What an edge shows while dragged is what it keeps on letting go, and crossing a line acts at once, both ways.

- **The chat list** (medium and wide): drag its right edge to size it between 200 and 360 (never leaving the main column under 400). Pull it under 140 and it hides at once, quickly; bring the hand back and it returns. Double-click the edge: back to the band's width (240 medium, 248 wide).
- **The nav** (wide only): its edge sizes the sidebar between 200 and 288. Pull it under 160 and it snaps to the rail at once (it never hides); come back past 160 and it opens again at 200 and follows. Dragging the rail's edge out past 160 opens it the same way. The width it had is kept for the next time it opens. Double-click the sidebar's edge: 216.
- **A drag always ends:** letting go, a lost pointer capture (the window lost focus), a cancel, or a move with no button held each end it, so the edge never stays stuck to the pointer. A click without a move changes nothing. While dragging, the whole frame keeps the resize cursor and nothing is selected.

**The edge:** a 6 px hit area inside the column's right edge, `col-resize`, a 2 px brand line at 60% on hover, focus and drag. A separator with its value for assistive tech; ← and → change it 8 px at a time.

**The sidebar button** (`sidebar` icon, "Hide sidebar ⌃⌘S" / "Show sidebar ⌃⌘S"): shown where there's something to fold, the sidebar band, or a screen with the list as a column. If every side that can open here is open (the sidebar, and the list on this screen) it closes both (the nav to the rail, the list away); if any is closed, it opens both, so a list dragged away always comes back from it. ⌃⌘S and the app menu's Hide sidebar do the same. It's 28 px with a 16 px glyph, the traffic lights' size, on their centre line (14 pt at x 16, y 20, so their centre is 27 of the 52 px row), and the lights' position is set again every time they're shown, because macOS drops it on a show, and is last in the DOM so the header's drag region can't swallow its clicks:

| Window | Nav | Where |
| --- | --- | --- |
| Floating | sidebar | the nav's top row, 12 in |
| Floating | rail (72) | the nav's top row, 22 in (centred) |
| Roomy | sidebar | the nav's top row, 86 in: its glyph starts 16 past the last light |
| Roomy | rail (92) | the lights fill the rail, so it leads the next column's header (the list's when open, else the main one), 8 past the rail's edge, on the cove's sky in its ink, the title 8 after it |

In the roomy window the nav's top row is 40 high, only the lights' (they end 34 down), so Otty sits close under them.

The list's line is an inset shadow, not a border, so shut at no width it leaves no 1 px gap for the haze to show through.

The sizes and both folds are this window's layout, kept in its `localStorage` (`otty.sides`), read defensively: anything unreadable is the default.

## Part 4 · Pages with margins

**The page margin** `--s-page`: 16 compact, 24 rail and medium, 32 wide (set on `.frame` by band). **The reading column** `--w-page`: 720.

- **Settings and the Notebook** (`.settings`): padded 16 top, `--s-page` either side, 32 at the foot; every child is centred at most `--w-page` wide. The section title (`.set-bar`) sits on the page margin; only a Back button before it hangs 8 px into the margin, so the glyph and the words line up with the content.
- **The Logbook**: the entry list and the opened entry are padded `--s-page` either side and 32 at the foot; the list is centred at most 680 wide at every width (it already was from 1248).
- **The main header** (rail, medium and wide): its title starts on the page margin. Compact keeps Spec 05's 12, so the screen menu doesn't move.
- Unchanged, on purpose: the chat (already a centred 712 column), Home (a centred 720 column), the list column and the nav.

## Part 5 · The check

One look for every checkbox (the chat list's pick, the Try again card's undo list): a native checkbox drawn in the house style, so keyboard and screen readers work as they always do. An 18 px rounded square (`--r-xs`) of field glass with a fine 1.5 px rim; on hover the rim takes the meadow. Checked, it fills with `--brand-fill`, a drawn tick grows in (`T.quick` on `buoy`) and the box gives one small pop (to 1.08); pressed, it gives (0.9). Keyboard focus shows the soft ring. Reduced motion keeps the colours and drops the movement. No default control is left in the app's chrome.

## Done when

- Tilting from the cove to the Logbook, the header is invisible until the sheet has started rising and lands with it (Part 1).
- Home ↔ empty chat at 1280: no full-screen fade; the list opens by its width; Otty, the greeting and the box ride right without fading; the card glides between its two places; only the greeting's and card's words fade (Part 2).
- The list resizes, hides under 140 and comes back from the sidebar button or ⌃⌘S; the sidebar resizes and folds to the rail; sizes survive a reload (Part 3, `sides.test.ts`).
- The Notebook's heading and its content sit 32 from the sidebar at wide, centred at 720 (Part 4).
- `npm run typecheck`, `npm test` and the renderer rules pass; `npm run screens` changes are the intended ones, accepted in a PR of their own.
