# Spec 03 · Chat and the message box

**Status:** draft for review, 2026-11-18. Planned as D-62 (DEVLOG). Builds on `docs/DESIGN.md` ("Foundations") and Spec 01 (cards and Noted lines inside answers). Covers UX_REVIEW #6, #7 (in part), #11 and A2, and catalogue items M1–M13, S1–S12 and V1–V14.

**Why third.** It's where people spend nearly all their time, and the message box is written three times today (twice in `quick/Quick.tsx`, once in `panel/Panel.tsx`), with drafts living in each window and lost when moving between them. One shared box, specified once, is A2.

## Scope

| In | Out |
| --- | --- |
| The chat column at every width | The quick view's own layout (uses this box and these messages; its frame is a later spec) |
| User messages with their captures, files and app | Drawing, chart and slide cards (their own spec; here only their slot) |
| Answers: tool line, text, code, tips, explain, actions, memory lines, errors | Step cards |
| Thinking, streaming, stopped, failed | Find in chat (keeps today's behaviour, restyled with Foundations) |
| The empty chat | |
| The message box with its tray, files, language choice and Send / Stop | |

## The chat column

| | Compact, 420 wide | Medium, 760 wide | Wide, 1200 wide |
| --- | --- | --- | --- |
| Column | 418 (window less its 1 px border) | 448 (760 − 72 rail − 240 list) | 736 (1200 − 216 − 248); from 1248 a 300 details pane joins (Spec 05) |
| Gutters | 16 | 16 | 24, reading column centred |
| Reading column | 386 | 424 | 680 max |
| Top padding | 16 | 16 | 24 |
| Bottom | The message box area (see below) | Same | Same |

**Spacing in the column.** A question and its answer are one turn. Inside a turn: captures to the question bubble 6; question to answer 12; tool line to answer text 8; answer text to the action row 4; action row to memory lines 4. Between turns: 20. Nothing in the column uses margins; turns are a `gap: 20` stack, and each turn is its own `gap` stack.

## User message

### Bubble

| Part | Spec |
| --- | --- |
| Alignment | Right edge of the reading column |
| Width | Content-sized, at most 85% of the reading column (328 at compact), at least 48 |
| Padding | 9 14 (so one line is 9 + 23 + 9 = 41 high with body text) |
| Shape | Radius 18, bottom-right corner 6 |
| Colour | `--brand-fill` with `--brand-ink` text, `--fs-body` 15 / 23, 500 |
| Long text | Wraps; past 12 lines, it clips at 12 with a 32 px fade to the bubble colour and a "Show all" quiet button under the bubble (`--fs-meta` 600 `--brand-text`, right-aligned) |
| Selection | Text is selectable; the selection colour is `--brand-ink` at 30% |

### Captures above it

Captures sit above their question, right-aligned to the bubble, 6 apart, at most four (`MAX_CAPTURES`).

| Capture | Spec |
| --- | --- |
| Highlight | A quote block up to 85% wide: 2 px `--straw` left edge, padding 2 0 2 12, `--fs-small` `--text`, three lines then an ellipsis. Above the text, 4 apart, the source line: the app icon (14 px, radius 3) and "Safari · Pricing, Acme Cloud" in `--fs-meta` `--text-2`, one line |
| Picture (snip or whole screen) | A thumbnail 72 high, width from its aspect ratio up to 200, radius 10, 1 px `--hairline` edge. Hover shows a 28 px "Pick up text" icon button at its top-right, 4 in, on a `--surface` 90% backing. Click opens the viewer (zooms from the thumbnail, U5) |
| Several pictures | Side by side, 6 apart, wrapping |
| Files | One row per file under the pictures: Foundations "Row" at 36 high inside a `--surface` box (radius 10, padding 0 10): a 16 px kind glyph, the name in `--fs-small` 600 (middle-truncated), the size or page count in `--fs-meta` `--text-2` at the right |
| App, for a question with no captures | A source line alone, right-aligned, 6 above the bubble |
| Hidden secrets | Today's hidden line, restyled: a 12 px shield and "Otty hid 1 key before sending" in `--fs-meta` `--text-2`, under the bubble, right-aligned, 4 below. Opens the hidden sheet |

## Answer

### Anatomy

```
⌕ Searched “HTTP 429” · Read wikipedia.org          tool line
                                                    8
The website will slow you down if …                 answer text
                                                    4
[⧉] [↻] [✎] [🔖]                                    action row
🔖 Noted: you’re on the starter plan  Undo · Edit   memory lines
```

| Part | Spec |
| --- | --- |
| Width | The full reading column. No bubble, no avatar, no indent |
| Tool line (S3) | One line of chips, 14 apart, wrapping. Each: a 12 px glyph in `--brand` and a label in `--fs-meta` `--text-2`. Running: the glyph steps between full and 35% every 600 ms. Done: stays. Denied or failed: glyph in `--text-2`, label "Skipped …" or "Couldn't …". When the answer finishes with three or more, they fold to one chip "3 steps" with a 12 px chevron (S4); click unfolds |
| Text | `--fs-body` 15 / 23, `--text`. See "Answer typography" |
| Action row | 4 below the text. 28 px icon buttons, 2 apart: Copy, Try again, Edit question, then the used marker (Spec 01) and the language switch when offered. Shown on the **latest** answer; on older answers it appears on hover or when the answer has keyboard focus, fading over `--t-quick` (UX_REVIEW #6). Copy's glyph becomes a check for 1.8 s |
| Memory lines | Spec 01 |
| Receipts and cards | Spec 01, in the order they happened, inside the text flow |

### Answer typography

| Element | Spec |
| --- | --- |
| Paragraph | 12 apart |
| Bold | 700 (not 800); `--text` |
| Headings | `##` and below render as `--fs-title` 16 / 22 700, 20 above and 8 below. `#` is treated as `##`: answers never get a display-size heading |
| Lists | Indent 20 from the text edge; markers in `--text-2`; items 4 apart, nested lists 4 above. Numbered markers tabular |
| Links | `--brand-text`, underlined at 1 px with a 3 px offset, `--brand-line` colour. Hover shows the host in a tooltip (V11), host in 700 |
| Explain terms | `--brand-text` 600, dotted 1 px underline at 3 px. Hover: a 4 px `--brand-soft` tint under the word (V3). Click: the explain card (below) |
| Inline code | Monospace 13.5, padding 1 5, radius 5, `--fill-strong` |
| Code block | Radius 10, `--surface-2`, 1 px `--hairline`. A 32 px bar: the language in `--fs-label` `--text-2`, 12 from the left, and a 28 px Copy icon button 2 from the right. Code: monospace 13 / 20, padding 10 12 12, scrolls sideways inside the block, never the column |
| Tables | Full reading width, scroll sideways inside their own box. Header row `--fs-label` `--text-2` on `--surface-2`; cells `--fs-small` padding 8 10, 1 px `--hairline` between rows only; numbers tabular and right-aligned |
| Tip (💡 blockquote) | A Card without shadow: `--straw-soft` fill, radius 12, padding 10 14, `--fs-small`; the label "Good to know" in `--fs-label` `--straw-ink` 4 above the text. Surfaces after the answer finishes (V13) |
| Proofread fixed block | Its own card (today's FixedCard), restyled: inserts in `--brand-soft` that settle from a stronger tint over `--t-drift` (V4) |
| Images | Never loaded remotely (unchanged): the placeholder row "Picture not shown, to keep you safe" in `--fs-meta` |

### Explain card (V1, V2)

Opens under the paragraph holding the term, as wide as the reading column, pushing what's below down over `--t-settle`.

| Part | Spec |
| --- | --- |
| Card | Radius 12, `--surface`, `--elev-1`, padding 12 14, 8 below the paragraph |
| Title | The term, `--fs-ui` 700, with its reading or translation after it in `--fs-small` `--text-2` |
| Body | `--fs-small` 13 / 18 `--text`, at most 6 lines then "More" |
| Close | 28 px × icon button at the top-right, 4 in. Esc closes it (today's behaviour) |
| Waiting | Two bars (100% and 70% wide, 10 high, radius 5, `--fill-strong`), stepping between two tints twice, then still |
| Cached | Opens with its text at once; no waiting bars |

### Thinking and streaming

| Moment | Shows |
| --- | --- |
| Sent, nothing back yet | Where the answer will start: the 20 px otter in its thinking frame with rising bubbles, 8 gap, "Thinking…" in `--fs-small` `--text-2` (S2) |
| A tool starts | The line beside the otter crossfades over `--t-quick` to the tool's own words ("Searching “HTTP 429”…"); its chip surfaces in the tool line |
| No first word after 6 s | A second line under it, surfacing: "Still with you. DeepSeek is slow right now." (S9), the service's name from the profile |
| First word | The otter row ebbs; text starts. New chunks fade in from a 1.5 px blur over 420 ms (S5); a 7 × 15 px `--brand` caret, radius 2, sits after the last character, stepping on and off every 600 ms |
| Done | The caret goes; actions, memory lines and tips surface 200 ms apart (S7) |
| You scroll up while it streams | Following stops (today). A floating "↓ New text" button appears 12 above the message box, centred: 28 high, padding 0 12, radius 10, `--surface`, `--elev-2`, `--fs-meta` 600 (S6). Click glides to the end and resumes following |
| Stopped | The caret goes; "You stopped this answer." in `--fs-meta` `--text-2` sits 4 below the text, with the action row |
| Failed | An error Card, never a raw code: the otter's head-tilt frame at 32 px on the left, the friendly message in `--fs-small`, and one primary small button ("Try again", "Open Settings" for a key problem, "Shorten this chat" for a too-long chat). Surfaces over `--t-settle`; no red fill, the 1 px edge is `--danger-ink` at 30% |

## The empty chat

Today's empty state teaches three hotkeys and four how-to rows. Following UX_REVIEW #5 and the rule (glanceable, one thing), it becomes:

| Part | Spec |
| --- | --- |
| Otter | 88 px, idle, centred, 40 below the header at compact (vertically centred in the free space at medium and wide) |
| Title | "Hi, I'm Otty", `--fs-heading` 20 / 26 800, 12 below the otter |
| Line | "Highlight anything and press ⌥ Space, or just ask below." `--fs-small` `--text-2`, centred, max 32 ch; the shortcut as a Foundations keycap inline |
| Try asking | Label "Try asking" (`--fs-label` `--text-2`), 24 below, then up to three suggestions as **rows**, not chips: 36 high, a 14 px "↵"-style glyph in `--text-2`, the suggestion in `--fs-small` 600, hover `--fill`. A click fills the box and never sends (M10) |
| Permission missing | The health line (window frame, A6) handles it; the empty state doesn't repeat it |

## The message box

One component for the panel, the Otty window and the quick view (A2).

### Area and box

| Part | Spec |
| --- | --- |
| Area | Padding 8 12 12 at every width; at wide, the box is centred under the reading column and as wide as it |
| Box | Radius 12 (concentric with the 24 px window corner and its 12 px inset), `--surface`, `--elev-2`, padding 6, a vertical stack of tray, files and the input row, 6 apart |
| Focus | 1 px `--brand-line` edge and a 3 px `--brand-soft` ring over `--t-quick` |
| Drag over | The box's edge becomes a 1.5 px dashed `--brand`, and the window's drop veil appears (W9) |

### Input row

`[snip] [attach] [ text ………… ] [語] [send]`

| Part | Spec |
| --- | --- |
| Tools | Snip and Attach, 32 px icon buttons, 16 px glyphs, 4 apart, bottom-aligned with the text's last line. Tooltips "Snip part of the screen ⌥⇧ Space" and "Attach files" (M11). While answering: dimmed, tooltip "After this answer" (M12) |
| Text | `--fs-body` 15 with 22 px lines, padding 5 6, grows from one line (32 high) to six (142), then scrolls (M1). Placeholder in `--text-3`: "Ask Otty anything…" in an empty chat, "Ask a follow-up…" after an answer, "Or ask something else" while a card waits |
| Language | Hidden until the user has used Chinese once (UX_REVIEW #7). Then a 32 px text button "中" (or "EN" when Chinese is on), `--fs-small` 700, which toggles the next answer's language; selected uses `--brand-soft` and `--brand-text`. Tooltip "Answer in 中文" |
| Send | A 32 px circle. Empty: `--fill-strong` with a `--text-3` arrow, not clickable. With text or captures: `--brand-fill` with `--brand-ink` (M2), filling over `--t-quick`. The arrow is drawn 1 px above centre |
| Stop | While answering, Send becomes Stop in place: `--fur` (`--silver` in dark) with a 10 px square, radius 2 (M4). Tooltip "Stop ⌘." |

**Height.** One line: 6 + 32 + 6 = 44 box, 8 + 44 + 12 = 64 area: chrome at 420 × 580 is 44 header + 64 = 108 px (the Foundations budget).

### Tray (captures waiting to be sent)

Above the input row, inside the box, when there are captures.

| Part | Spec |
| --- | --- |
| Row | Captures 6 apart, wrapping, padding 2 |
| Highlight | A 48 px high card, at most 220 wide: `--surface-2`, radius 8, padding 6 10, the first two lines in `--fs-meta`, the app icon 12 px before them |
| Picture | 48 × 48 (cover-cropped), radius 8, 1 px `--hairline`. If Screen Recording is off and it's wallpaper only, a lock glyph over it and the tooltip "Otty can't see your screen yet" (C4) |
| Remove | A 20 px × in the top-right corner, 4 outside the thumbnail, `--surface` with `--elev-1`, glyph 10 px; 28 px hit area. Removing collapses the item over `--t-settle` |
| Count | When there are two or more: "2 of 4" in `--fs-meta` `--text-2` at the row's end |
| Full | A fifth capture shows the tooltip "Otty can look at 4 things at once" on the tray for 2.4 s (C6) |

### Files

Under the tray. Each file a 36 px row inside the box (as in the user message), with a 20 px ×. Reading progress (M6): a 16 px ring in place of the kind glyph, filling from the worker's progress; when read, the glyph or a 24 px thumbnail fades in. A file with hidden secrets gets the 12 px shield (M7). A failed file: the row's text in `--danger-ink` with "Couldn't read this" and a Retry button.

### Keyboard

| Key | Does |
| --- | --- |
| Enter | Send (when there's anything to send) |
| Shift-Enter | New line |
| ⌘. | Stop |
| ↑ in an empty box | Edit the last question (opens the rewind card when something would be undone; M13) |
| Esc | Closes an open explain card first, then the window. The draft is kept |
| ⌘V with a picture | Adds it to the tray |

### Drafts (A2)

Text, captures and file ids are kept per chat in main, saved as the user types (debounced 300 ms). A chat with a draft shows "Draft:" in `--straw-ink` 600 before its preview in the chat list. Switching from the quick view to the window, or between chats, never loses a draft.

## Widths at a glance

| | Compact | Medium | Wide |
| --- | --- | --- | --- |
| Answer width | 386 | 424 | ≤ 680 |
| Bubble max | 328 | 360 | 578 |
| Message box | 394 wide | 432 | 680, centred |
| Actions on older answers | Hover or focus | Same | Same |
| Details pane | — | — | "This chat" (DESIGN.md), 300 px, when opened from the header |

## States to draw

Empty chat · one turn · a long thread (scrolled, header hairline showing) · thinking · tool running · card waiting · streaming · streaming while scrolled up (New text button) · done · stopped · failed (network, key, too long) · a Chinese answer (25 px lines) · code-heavy answer · a table wider than the column · four captures and two files in the tray · a file reading · a draft restored · paused (Send is replaced by "Paused · Carry on", a 32 px quiet button, and the placeholder says "Otty is paused") · dark.

## What main must provide

- Drafts: `getDraft(threadId)` / `setDraft(threadId, draft)` channels in `CHANNELS`, ids only for captures and files.
- The tool line's words for the thinking row come from the existing tool events; the service name for the slow line from the profile.
- "Has the user used Chinese" (a count, from habits) to decide whether the language button shows.
- The failure kind on error events (`network`, `key`, `too-long`, `other`), so the error card can offer the right button.

## Preview scenes needed

Today's `chat`, `compose`, `empty`, `tray`, `math`, `code`, `drawing`, `chart`, `find` scenes, restyled; plus `thinking`, `streaming`, `scrolled-up`, `stopped`, `failed-key`, `failed-long`, `chinese`, `table-wide`, `tray-full`, `file-reading`, `draft`, `paused` — at 420, 760 and 1200, light and dark.

## Done when

The quick view and the panel use one message box component; drafts survive window and chat switches (a smoke spec); chrome measures 108 px at 420 × 580; answer text spans the full reading column; actions show only on the latest answer unless hovered or focused, and stay reachable by keyboard.
