# Spec 01 · Decisions and receipts: confirm cards and the Noted line

**Status:** draft for review, 2026-11-18. Planned as D-60 (DEVLOG). Builds on `docs/DESIGN.md` ("Foundations"), so D-59's tokens and components come first. Covers catalogue items K1–K12 and N1–N7, including six of the first twelve.

**Why first.** These are the moments where trust is won or lost. Every card today looks the same ("Read this page?", the raw address, **Yes, go ahead** / **No thanks**), which trains the Allow reflex (UX_REVIEW #1). Approved cards vanish without a trace. The Noted line, the safety control for memory, has the same weight as every other footer line.

## Scope

| In | Out |
| --- | --- |
| Confirm cards in a chat: Read this page, Open this link, Look this up, Add this reminder | Step cards (later spec) |
| The same card in the Logbook's details pane and in the quick view | "Always for this site" grants (UX_REVIEW #1, needs its own D-entry and attack tests) |
| Receipts after a decision | Hold-to-confirm actions (none of today's four cards is irreversible) |
| The rewind card (Try again, Edit question) | |
| Noted, Updated and Forgotten lines; the "used" marker | The Notebook screen itself |

## Confirm card

### Anatomy at compact width (420 × 580 window, 386 px reading column)

```
┌──────────────────────────────────────────────┐  radius 14 · --surface · --elev-1
│ ⊕  Read this page?                           │  12 top · 16 sides
│                                              │  8
│    jreast.co.jp                              │  host line
│    /en/timetable/tokyo-sendai                │  path line
│                                              │  12
│    [ Read it ]  [ Skip ]                     │  32 px buttons, 8 apart
└──────────────────────────────────────────────┘  12 bottom
```

| Part | Size and position | Type and colour |
| --- | --- | --- |
| Card | Full reading width at compact, at most 520 px, left-aligned with the answer. Padding 12 16. Radius 14 | `--surface`, `--elev-1`, no border |
| Kind glyph | 16 px, 3 px down from the top of the title's first line so it centres on its 22 px line, 10 px before the title | `--text-2`. Globe (read), arrow-out (open), search (look up), bell (reminder) |
| Title | Starts 42 px from the card's left edge (16 padding + 16 glyph + 10 gap), wraps to two lines at most | `--fs-title` 16 / 22, 700, `--text` |
| Detail | Aligned with the title text (indent 26 px from the content edge: 16 glyph + 10 gap), 8 below the title | See "Detail by kind" |
| Consequence line (unusual only) | 8 below the detail, same indent | `--fs-small` 600, `--straw-ink`, with a 12 px warning glyph and a 6 px gap |
| Buttons | 12 below the last text line, same indent, 8 apart | Primary then secondary, both 32 high (`Button`), never small: a decision deserves full-size targets |

Note on the indent: the glyph column is 16 wide plus a 10 gap, so all text and the buttons line up 26 px in from the content edge. The glyph is the only thing in the left column.

**Height.** A one-line title with a two-line address: 12 + 22 + 8 + 20 + 18 + 12 + 32 + 12 = **136 px**. That's 23% of a 580 px window, and the card never grows past 200 px: longer detail clips with "Show all" (see below).

### Detail by kind

The renderer never parses an address. Main sends each card a `kind` and the parts below already split, so the host shown is the host the tool will use.

| Kind | Title | Detail | Primary | Secondary |
| --- | --- | --- | --- | --- |
| Read a page | Read this page? | Host on its own line, `--fs-ui` 700 `--text`. Path and query on the next, `--fs-small` `--text-2`, middle-truncated to one line (`/en/time…/tokyo-sendai`) | Read it | Skip |
| Open a link | Open this link? | As Read, plus "Opens in your browser" in `--fs-meta` `--text-2` 4 below | Open it | Skip |
| Look this up | Search the web for this? | The query in quotes, `--fs-ui` 500 `--text`, up to three lines, then clipped with "Show all". Below it, 4 apart, `--fs-meta` `--text-2`: "Goes to DeepSeek" (the service's name from `services.ts`) | Search | Skip |
| Add a reminder | Add this reminder? | Reminder title `--fs-ui` 700; then when, `--fs-small` `--text-2`, formatted by `describeWhen` ("Thu 20 Nov at 18:00"); then the list, `--fs-meta` ("In Reminders · Today") | Add it | Skip |

**Copy rules.** The primary button names the action in two words or fewer. "Skip" replaces "No thanks" everywhere, because the turn carries on without it rather than ending. Never "Yes, go ahead": a generic yes is what the reflex learns.

### The unusual variant

Only these make a card look different, so a card that looks different is worth reading:

| When (decided in main, never by the model) | Consequence line |
| --- | --- |
| The host contains non-ASCII letters or is punycode | "This address uses letters from another alphabet." The host is shown in its `xn--` form, with the readable form after it in `--text-2` |
| An `http://` address (not https) | "This page isn't private: anyone on your network could see it." |
| A search while `RunTaint` holds both private data and outside words (D-41, today's only search card) | "These words leave your Mac. Check they don't include anything private." |
| The monthly limit is passed (jobs) | "You're past this month's limit." |

Visual: a 1 px `--straw` inner edge (inset box-shadow, so the size doesn't change) and the consequence line. Nothing else changes: no colour fill, no icon swap, no shake.

### Placement and focus

- **Chat:** at the point the answer paused, after its tool chips, 8 below the last chip or paragraph. The answer's streaming caret is hidden while a card waits.
- **The composer stays usable.** Its placeholder changes to "Or ask something else" so it's clear typing is allowed. Sending a new question in this chat stops the turn (today's behaviour), and the card becomes a receipt reading "Skipped (you asked something else)".
- **Focus.** When the card appears, focus does **not** move to a button. The card itself (`tabindex="-1"`, `role="group"`, labelled by its title) is announced through a polite live region: "Otty is asking: Read this page? jreast.co.jp". The next Tab reaches the primary button. Enter never approves a card the user hasn't tabbed into.
- **Arming (K2).** Buttons ignore pointer input until the card has been at least 50% visible for 400 ms (`IntersectionObserver`, not the render time, so a card scrolled into view under the pointer is protected too). During those 400 ms they're at 45% opacity and fade to full over `--t-quick`. Keyboard activation is never delayed, because Tab already took a deliberate step.

### Receipt (K3)

After either button, the card folds into one line that stays in the chat and the saved thread.

```
✓ Read jreast.co.jp
✓ Added “Essay deadline” · Undo
– Skipped jreast.co.jp
```

| Part | Spec |
| --- | --- |
| Height | 28 px, no card surface: it's part of the answer's flow, like a tool chip |
| Glyph | 12 px in a 16 px box. Check in `--brand` for allowed; a dash in `--text-2` for skipped |
| Text | `--fs-meta` 12 / 16, `--text-2`; the host or reminder title in 600 `--text` |
| Undo | Only when the ledger has an undo for it (a reminder, yes; a page read, no). Quiet text button, `--fs-meta` 600 `--brand-text`, 6 after a middle dot |
| Motion | The buttons fade over `--t-quick`; the card's height folds to 28 over `--t-settle` with `--glide` while its background fades out, and the receipt text surfaces 120 ms before the fold ends. Reduced motion: an instant swap with a 200 ms fade |

A receipt from a reopened chat is drawn static. The receipt's text comes from main (the same words as the Logbook entry), so the two always match.

### Waiting on return (K8)

When the window becomes visible and a card has been waiting for over a minute, the card gets one slow ring: 2 px `--brand-line`, fading in and out over `--t-drift`, once. The header's Logbook icon carries the dot; the floating otter carries the waiting mood (B8).

### Card states

| State | Shows |
| --- | --- |
| Arriving | Surfaces 12 px over `--t-settle`; buttons arming |
| Waiting | Static. After 10 minutes the title gets a `--fs-meta` "waiting since 3:52" after the buttons |
| Pressed | The pressed button shows busy for at most 600 ms if main hasn't answered; the other is disabled |
| Paused | Pause everything is on: buttons disabled, a line in `--text-2` "Otty is paused. Carry on to decide." with a quiet **Carry on** button |
| Turn stopped | Becomes a "Skipped" receipt |
| Main didn't hear back (IPC fails) | The card stays; a `--fs-meta` line in `--danger-ink` "Couldn't send that. Try again." The button re-arms immediately |

### Other widths

| | Compact (< 640) | Medium (640–979) | Wide (≥ 980) |
| --- | --- | --- | --- |
| Card width | Reading column, at most 520 | 520 | 520, in a 680 reading column |
| Same card in the Logbook | Pushes a page; card at full width | Main column | Details pane (300 px): padding 12 14, title 14 / 20 700, buttons small (28) and stacked full-width if both don't fit |
| Quick view | Full quick view width minus 24; buttons 32 | — | — |

## Rewind card (Try again, Edit question)

The same Card, at the answer's position, replacing the action row while open.

| Part | Spec |
| --- | --- |
| Title | "Try this again?" or "Edit your question?", `--fs-title` |
| Detail | "This answer goes." (plus ", and your question comes back to the box." for Edit), `--fs-small` `--text-2` |
| Undo list | Label "Otty will also undo" (`--fs-label`, 12 above). Each item a 28 px row: 16 px checkbox, 8 gap, `--fs-small` text. Ticked by default |
| Can't be undone | Label "Can't be undone", then rows with a 12 px lock glyph in `--text-2` and `--fs-small` `--text-2` text |
| Buttons | Primary "Try again" / "Edit question", secondary "Keep this answer" |
| With nothing to undo | No lists; the card is title, detail and buttons (100 px) |

## The Noted line (N1–N3, N7)

The memory safety control. One line per change, always visible in full, never folded into a count.

### Anatomy

```
🔖 Noted: you're learning Japanese   Undo · Edit
```

| Part | Spec |
| --- | --- |
| Position | Below the answer's action row, 4 apart; several lines stack 4 apart. Aligned with the answer text's left edge |
| Line box | Minimum 24 px high, wraps to at most two lines; the actions flow inline after the text and never wrap on their own |
| Glyph | Bookmark, 12 px in a 16 px box, `--straw-ink`, top-aligned to the first line, 6 px gap |
| Label | "Noted:", "Updated:", or "Forgot:" in `--fs-small` 600 `--text-2` |
| Fact | `--fs-small` 600 `--text`, in the user's words as stored |
| Was (Updated only) | `(was: you're learning Spanish)` in `--fs-small` 500 `--text-2` |
| Actions | Quiet text buttons, `--fs-small` 600 `--brand-text`, 12 px apart, with a 28 px hit height. **Undo** always; **Edit** opens the Notebook at that note |

### Motion

- On a live answer: the line surfaces 200 ms after the action row (S7), then a 2 px `--straw` underline draws under the fact, left to right, over `--t-drift`, 500 ms after the line appears (N1). The underline stays at 40% opacity after drawing, so a reader scrolling back can still see what was noted.
- In a reopened chat: drawn static, underline included.
- **Undone (N2):** the fact gets a 1 px strike-through in `--text-2` over `--t-quick`, the label stays, and the actions become the word "Forgotten" in `--fs-small` `--text-2`. The line never disappears.
- Reduced motion: the underline appears at its resting opacity with a 200 ms fade.

### The used marker (UX_REVIEW #6)

Notes that were *read* for an answer, not written, fold into one 28 px icon button in the action row: bookmark glyph, tooltip "Used 2 notes from your Notebook". Clicking opens a menu (Foundations "Menu and popover") listing each note as a 30 px item, plus "Open the Notebook". The old "Used: …" line goes.

## Accessibility

- Card: `role="group"`, `aria-labelledby` its title, announced politely on arrival. Buttons have their visible names; the host is part of the accessible name of the primary ("Read it: jreast.co.jp").
- Receipt: plain text, with Undo labelled "Undo adding Essay deadline".
- Noted line: a polite announcement ("Otty noted: you're learning Japanese. Undo available."). Undo is labelled "Undo noting: …".
- Contrast: every text role per Foundations. The straw inner edge isn't the only signal: the consequence line carries the meaning.

## What main must provide

- `confirm` events gain `kind` (`read`, `open`, `search`, `reminder`) and structured parts (`host`, `path`, `query`, `service`, `title`, `when`, `list`) plus `unusual?: { reason }`, all worked out in main from the tool's arguments. `title` and `detail` stay for older saved chats.
- A `receipt` on the answer after a decision (`{ allowed, text, undo? }`), saved with the turn, so receipts survive reopening. Its text and Undo come from the ledger row (D-46).
- IPC: the new fields travel on the existing `confirm` event; no new channel. The renderer still only sends `respondConfirm(confirmId, allow)`.

## Preview scenes needed

`scene=confirm-read`, `confirm-open`, `confirm-search`, `confirm-reminder`, `confirm-unusual` (punycode host), `confirm-paused`, `receipts` (allowed, skipped, with Undo), `rewind` (with and without lists), `noted` (Noted, Updated, undone, two lines), each at 420, 760 and 1200 wide, light and dark.

## Done when

The scenes above match this spec at 100% and 200%; arming is covered by a renderer test (a click at 300 ms does nothing, at 450 ms it answers); a receipt survives reopening a chat; the smoke spec for confirm cards (today's steps) is updated for the new button labels.
