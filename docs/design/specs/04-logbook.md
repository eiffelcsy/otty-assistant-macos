# Spec 04 · The Logbook

**Status:** draft for review, 2026-11-18. Planned as D-63 (DEVLOG). Builds on `docs/DESIGN.md` ("Foundations", "Names", "Screens › Logbook") and Spec 01 (cards). Covers UX_REVIEW #4, #8 (in part), #12 and A4, and catalogue items R1–R11.

**Why fourth.** It replaces three lists that each answer part of "what has Otty been doing?": Activity (`panel/Activity.tsx`, tabs "What Otty is doing", "Left your Mac", "Changed"), `SentList.tsx` and `ChangeList.tsx`, plus the Settings buttons that open them. It's the trust surface that autonomy leans on, and the first screen built as a list beside its details (A4).

## What it holds

| Source | Entries |
| --- | --- |
| `JobStore` | Look-ups and checks: working, waiting its turn, scheduled, repeating, waiting for you, couldn't finish, done, stopped |
| Sent log (D-31) | Questions to the AI service, searches, pages read, explain cards and titles, connection checks |
| Ledger (D-46) | Changes: reminders added, notes kept, steps done for you, each with its undo |
| Memory notes | Noted, updated, forgotten |

Kept as long as chats are, and gone when they go, as today. Read-only: the Logbook never changes anything except through the same actions the chat offers (Undo, Stop, Skip, a card's buttons).

## Views

Text rows with counts, never pills.

| View | Shows | Empty copy |
| --- | --- | --- |
| **Needs you** | Cards waiting, look-ups that couldn't finish, runs more than a day late | "Nothing needs you." |
| **Coming up** | Scheduled and repeating checks, soonest first | "Nothing planned. Try “check this page again tomorrow at 9”." |
| **Everything** | All of it, newest first, with Now pinned at the top (default view) | "When Otty looks into something, sends something or changes something, it's written down here." |
| *Looking for…* **What left my Mac** | Sent-log entries only, nothing folded | Today's SentList empty copy |
| **What Otty changed** | Ledger changes, each with Undo or why it can't be | Today's ChangeList empty copy |
| **What Otty noted** | Notebook changes | "Otty hasn't noted anything yet." |

The Needs you count (`--straw-ink`, 800) also shows beside Logbook in the sidebar, and as the dot on the header's Logbook icon.

## Layout

### Compact (< 640), 420 wide

| Part | Spec |
| --- | --- |
| Header | Back, the title "Logbook", Pause (32 icon button) |
| View menu | 12 below the header, 16 in: the current view's name as a 32 px quiet button, `--fs-heading` 20 / 26 800 with a 14 px down chevron, then its subtitle on the same baseline in `--fs-small` `--text-2` ("this week"). Opens a Menu with all six views and their counts |
| Search | 12 below, a 36 px "Search the Logbook" field across the gutter |
| Now strip | When something is running: 12 below the search, a Card (see "Now") |
| Ledger | 8 below, edge to edge within the 16 px gutters |

### Medium (640–979)

72 rail · 240 list · main (Spec 05). The list column holds the views: three rows (Needs you, Coming up, Everything) as 36 px one-line rows, then the label "Looking for…" (`--fs-label`, 16 above, 4 below) and three 52 px two-line rows with their descriptions. The main column has the title as a plain `--fs-heading` (no chevron), the search and the ledger, gutters 16. Opening an entry pushes a details page within the main column, with Back.

### Wide (≥ 980)

216 sidebar · 248 list · main (ledger at most 680, centred), and from 1248 a 300 details pane (Spec 05); between 980 and 1247 an opened entry is a page in the main column. The pane shows the opened entry; with nothing opened, it shows Needs you's first item, or a quiet line "Choose an entry to see why it happened and what it touched."

## The ledger

### Day groups

| Part | Spec |
| --- | --- |
| Day header | 36 high: the day ("Today", "Yesterday", "Monday", then "Tue 11 Nov") in `--fs-ui` 700, 8 gap, the count ("6 entries") in `--fs-meta` `--text-2`. A 1 px `--hairline-strong` line under it |
| Sticky | Day headers stick under the search while their day scrolls, on a `--bg` backing |
| Folding | In Everything, days older than yesterday fold to their header plus one 36 px row "Show 9 entries" (R10). Needs you, the *Looking for* views and search results never fold |

### Entry

```
 3:44  ⌕  Searched “Sendai shinkansen times”         Undo
          DeepSeek search · Train times to Sendai
```

| Part | Spec |
| --- | --- |
| Grid | Columns 44 (time) · 16 (glyph) · flexible (text) · auto (action), 10 apart. Padding 10 0. One line: 40 high; two lines: 58 |
| Separator | 1 px `--hairline` under each entry, starting at the glyph column (54 in), so times read as a clean column |
| Time | `--fs-meta` tabular, `--text-2`, right-aligned, baseline-aligned with the first text line. Today: "3:44"; other days: the time; Coming up: "Thu", "in 2 h", "daily" |
| Glyph | 16 px, `--text-2`; `--straw-ink` for waiting; `--danger-ink` for couldn't finish |
| First line | `--fs-ui` 500 `--text`; the thing acted on (host, query, reminder title, note) in 700. One line, ellipsis |
| Second line | `--fs-small` `--text-2`, 2 below: where it went, and what it was part of ("DeepSeek search · Train times to Sendai"). One line, ellipsis |
| Action | One at most: a quiet text button (`--fs-small` 600 `--brand-text`): Undo, Decide, Skip, Stop. Done or undone entries show none |
| Hover | A `--fill` wash across the entry that fades out over the last 8% at each side (no hard edges) |
| Selected (wide) | `--brand-soft` wash, same shape |
| Undone | First line struck through in `--text-2`, and "Undone" as the action, in `--text-2` |

### Copy

One verb first, in the past tense for what happened ("Read", "Searched", "Asked", "Added", "Noted") and the present for what's waiting ("Waiting: read jreast.co.jp?"). Times come only from `describeWhen` and one locale (UX_REVIEW #12), so a repeat reads "Every Monday at 9:00 · next Mon 24 Nov at 9:00".

## Now (R3, R6)

When a look-up is running, a Card sits above the ledger in every view:

| Part | Spec |
| --- | --- |
| Card | Padding 12 16, `--surface`, `--elev-1`, radius 14 |
| Line 1 | A 7 px `--brand` dot (stepping between full and 35% every 1.2 s), 8 gap, the title in `--fs-ui` 700 ("Train times to Sendai") |
| Line 2 | `--fs-small` `--text-2`: "Page 3 of about 6 · back by 4:10" |
| Progress | 8 below: segments for the expected pages (at most 12, then a continuous bar), 3 apart, 4 high, radius 2; done segments `--brand`, the current one stepping, the rest `--fill-strong`. No indeterminate spinner |
| Actions | 10 below: **Add a note** (small secondary), **Stop** (small quiet). Stop shows "Stopping…" until the runner confirms (R8) |
| Several running | One card each, 8 apart, at most two shown, then "and 1 more" |
| Paused | The dot is `--straw` and still, line 2 reads "Paused", the progress stops stepping, and the actions become **Carry on** |

**Add a note (R7):** opens a 36 px field in the card, "Tell it something, like “only check JR East”". Enter attaches the note, which then shows under line 2 as "Your note: only JR East" in `--fs-small` 600, and goes into the run's next step. The note can narrow what the run does, never widen it (UX_REVIEW #8).

## Details

Opened entries show the same blocks, in a details page (compact and medium) or the pane (wide). Pane padding 16; blocks 16 apart; each block a label (`--fs-label` `--text-2`) 8 above a small card (`--surface`, radius 12, padding 12).

| Block | Holds |
| --- | --- |
| Title | The entry's first line, `--fs-title`, and its full time ("Today at 3:44") in `--fs-meta` |
| Decision (waiting entries) | The Spec 01 card for it, in its pane size |
| Why | One or two sentences from main: "Your look-up “Train times to Sendai” found this page in a search." |
| What it sent | Sent-log rows of this entry: where, and the words or address (masked as in the log), `--fs-small` |
| What it changed | Ledger rows, each with Undo or the reason it can't be undone |
| Part of | A row linking to the chat or the look-up it belongs to |
| Controls | For jobs: Stop, Skip once, Stop repeating, Run it anyway, Keep going, as small buttons, 8 apart, primary only for the one the state calls for |

## Search (Ask the Logbook)

v1 is plain matching (`shared/match.ts`) over entries' words, hosts and titles, not a model call, so asking never sends anything. The view's title becomes the search ("“CV”"), the subtitle "3 entries", and results are grouped by day, unfolded, with matched words in 700. A question like "did my CV leave my Mac?" matches on its content words ("CV", "Mac" ignored as too common); if nothing matches: "Nothing in the Logbook mentions “CV”." Never a reassurance the Logbook can't prove: no match means no entry, not that nothing happened before the Logbook's retention.

## Pause

Pause lives in the header at every width (and the sidebar card when wide). When paused, a 40 px line sits above the Now strip in every view: a 12 px pause glyph, "Otty is paused until 3pm. Nothing runs on its own." (`--fs-small`), and **Carry on** (small primary), with today's copy for the no-end case.

## Motion

| Moment | Motion |
| --- | --- |
| Changing view (R1) | The view row takes its fill over `--t-quick`; the ledger fades to 0 over 120 ms and resurfaces over `--t-settle`; the title and subtitle crossfade |
| Opening an entry (R2) | Wide: the pane's content crossfades over `--t-quick` (the pane itself never slides). Compact and medium: the page pushes in |
| A run finishing (R4) | The Now card folds over `--t-settle`; its new entry surfaces at the top of Today with a `found` glow at `--t-drift` |
| Undo | The entry's strike-through draws over `--t-quick`, and a toast confirms "Undone" |
| New entry while open | Surfaces at the top of its day; never moves the scroll position if the user is scrolled down |

## States to draw

Each view empty and full · Now with one and two runs · paused · a waiting entry open · a failed run open · a repeating series · a late run (Spec 01's unusual card) · an undone change · a folded week · search with results and with none · a very long host or query · dark.

## Accessibility

The views are a `listbox` (↑ and ↓ move, the ledger follows). The ledger is a list of day groups, each a `list` with its header as the label; entries are buttons named "3:44, Searched Sendai shinkansen times, DeepSeek search, part of Train times to Sendai". The Now card's progress is a `progressbar` with "Page 3 of about 6". Needs you's count is part of the Logbook link's name ("Logbook, 1 needs you").

## What main must provide

- One read-only query, `logbook({ view, search?, before? })`, returning entries already merged from the four sources and worded by main (first line, second line, glyph, time, action), paged by day. Registered in `CHANNELS`; the renderer sends ids for actions, as today.
- `entryDetails(id)` for the pane: why, sent rows, ledger rows, part of, controls.
- Job progress as `{ done, expected }` (expected may be a guess, shown as "about").
- Steering notes: `noteJob(id, text)`, stored as the user's typed words and passed into the run's next step by `JobRunner`.

## Preview scenes needed

`scene=logbook` with `&view=` each of `wait`, `next`, `all`, `sent`, `changed`, `noted`; plus `logbook-empty`, `logbook-running`, `logbook-paused`, `logbook-entry` (details open), `logbook-search`, `logbook-none` — at 420, 760 and 1200, light and dark. Today's `activity` scene is retired with it.

## Done when

Activity, SentList, ChangeList and the two Settings buttons are gone, each reachable as a Logbook view; every entry kind renders from main's words (no wording in the renderer); the Now card shows real progress; a smoke spec covers opening a view from Settings' links, undoing a change, and a steering note reaching a run.
