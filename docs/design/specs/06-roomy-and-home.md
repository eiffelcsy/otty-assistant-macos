# Spec 06 · The roomy window and Home

**Status:** draft for review, 2026-11-19. Planned as D-65 (the roomy window) and D-66 (Home) in the DEVLOG. Builds on Spec 05 (the frame), Spec 04 (the Logbook's Needs you view, which Home's inbox reuses), Spec 01 (cards), `docs/DESIGN.md` ("Home", catalogue W1, W8, W14, L1–L7) and BRAINSTORM ("Quick view and the Otty window").

**Why last.** The roomy window is the frame from Spec 05 with different window behaviour, and Home is a summary of things other screens already hold: the Needs you inbox (D-63), jobs and their schedule (D-27, D-34), and what left the Mac (D-31). Specced any earlier, Home would have had to invent its data.

**What changes from the draft.**
- **Expand / Shrink is ⇧⌘E, not ⌃⌘F.** ⌃⌘F is macOS's Enter Full Screen, and the roomy window can go full screen.
- **Home's first version shows only blocks backed by real data:** the greeting, Needs you, Today, Looking after, and the line about what left your Mac. Goals, Otty noticed and keepsakes keep their places in the layout (so it never reshuffles), but appear only when their features ship.
- **The otter grows 96 → 120 → 152 by band** (the draft had 96, 116, 150) to stay on the 4 px grid, and the draft's "status pill" becomes a plain line inside a quiet card, never a capsule.
- **No Dock badge.** A red number on the Dock asks to be cleared, which is the nagging the den's rules forbid. The bubble's dot and the sidebar's count carry it.

## Part 1 · The two states

One window (`windows.ts`'s panel), two behaviours. The frame and the screens don't know which state they're in, except for the header height and the traffic-light row (Spec 05).

| | Floating (compact state) | Roomy |
| --- | --- | --- |
| Opens from | Clicking the bubble, "Open chat" in the menu bar, ↵ "continue in chat" from the quick view | Opening Otty from Applications, Spotlight or Launchpad, "Open the Otty window" in the menu bar, Expand, ⇧⌘E |
| Opens on | The screen and chat you left | Home, unless it came from Expand (then the same screen and chat) |
| Size | Last floating size; first time 420 × 580 | Last roomy size; first time 1280 × 800, centred on the display with the pointer |
| Position | Beside the bubble, as today | Last roomy position, if it's still on a connected display; otherwise centred |
| Level | Floats above other windows, on every desktop and over full-screen apps | A normal window on its own desktop |
| Traffic lights, ⌘-Tab, Dock icon, menu bar | None | Yes, while it's open |
| Full screen | No | Yes, from the green button or ⌃⌘F |
| Minimum | 360 × 420 | 720 × 520 |
| Closing it (⌘W, or the close button) | Hides it | Hides it and returns it to the floating state for next time; the Dock icon leaves after the window has gone (W14) |

**Never two windows for one thing.** While the roomy window is open, clicking the bubble, "Open chat" and ↵ "continue in chat" bring the roomy window forward (on that chat) instead of opening the floating one. The quick view still opens at the cursor: it's for a few seconds, beside your work.

**Each state remembers its own place.** Main keeps `{ floating, roomy }` bounds in its own settings file (not `SETTABLE`: the renderer can't set them), saved when a move or resize ends, and restored only if the bounds fit inside a connected display's work area. Dragging the floating window wide changes its layout (Spec 05) but it keeps floating, so a window made wide once never covers your work the next time you click the bubble.

### Expand and Shrink (W1, W14)

The button sits at the trailing end of the header: in the floating state "Expand" (16 px glyph, two arrows apart, `--brand-text`), and in the roomy state, "Shrink to floating" (arrows together, `--text-2`), so expanding is the invitation and shrinking is just available. Tooltip: "Expand  ⇧⌘E" / "Shrink  ⇧⌘E".

**Expand, in order:**

| t (ms) | Main | Renderer |
| --- | --- | --- |
| 0 | The press answers at once (`--t-tap`) | |
| 0 | Shows the Dock icon and the app menu; drops the window to the normal level and off other desktops; shows the traffic lights | The content dims to 30% over 200 ms (`--ebb`) |
| 0–720 | Moves and grows the window to the roomy bounds over `--t-travel` on the `--glide` curve | The header grows 44 → 52 with the window |
| 720 | Saves the state | The new layout is in place behind the dim; the content surfaces over `--t-settle` with a 4 px rise. The first visible message stays where it was (W3) |

**Shrink** is the same in reverse, except that the window first leaves full screen if it's in it, and the Dock icon and app menu go only after the window reaches its floating bounds (W14), so the Dock never flickers mid-move. Then the window goes back to floating above everything on every desktop.

**Kept across a switch:** the screen, the chat, every column's scroll position, the message box's words (main's draft, D-62), focus, and any card being answered. A running answer keeps streaming through the move.

**Reduced motion:** the window jumps to its new bounds, and the content fades over 200 ms.

**If the move can't be animated smoothly.** Electron's own animated `setBounds` has a length set by macOS. The plan is for main to step the bounds itself on the display's refresh for 720 ms; if that measures as dropping frames on a 60 Hz Mac, use the native animation instead, and keep the dim and surface timings in the renderer. Either way it's one move, never a resize followed by a reposition.

### The window itself

The floating window today is frameless and transparent, with corners the page draws (`--radius`, 24). The roomy window needs the system's traffic lights, corners and shadow, and a window can't change between frameless and framed after it's made. So the panel is made once with a hidden title bar (`titleBarStyle: 'hidden'`) and its buttons hidden while floating (`setWindowButtonVisibility(false)`). Both states then get the system's corners and shadow. D-65 starts with a small check of how that looks on the floating window: if the system corner reads right, `--radius` follows it so the composer stays concentric (Foundations, "Shape"); if it doesn't, the fallback is two windows that swap at the midpoint of the move, behind the dim, sharing everything through main.

### The Dock and the menu bar

**The Dock icon** is `build/icon.icns`, shown only while the roomy window is open. No badge, no bounce. Its menu (right-click):

```
New chat
Pause everything          ▸   (or "Let Otty carry on" while paused)
```

**The app menu bar**, while the roomy window is open, follows the Mac's layout and wording. Each item works on the screen on show; ones that don't apply are disabled, never hidden.

| Menu | Items |
| --- | --- |
| **Otty** | About Otty · separator · Settings… ⌘, · separator · Pause everything ▸ (For an hour, Until tomorrow morning, Until I say) or Let Otty carry on · Hide floating Otty · separator · Hide Otty ⌘H · Hide others ⌥⌘H · Show all · separator · Quit Otty ⌘Q |
| **File** | New chat ⌘N · Ask about highlighted text, Snap part of my screen, Capture the whole screen (each with its hotkey) · Attach files… · separator · Close window ⌘W |
| **Edit** | The standard roles (Undo, Redo, Cut, Copy, Paste, Paste and match style, Delete, Select all) · separator · Find ⌘F (find in this chat, find a chat, or search the Logbook, by screen) |
| **View** | Home ⌘1 · Chats ⌘2 · Logbook ⌘3 · Notebook ⌘4 · separator · Hide sidebar ⌃⌘S · Hide details ⌥⌘0 · separator · Shrink to floating ⇧⌘E · Enter full screen ⌃⌘F |
| **Window** | The standard window menu (Minimize ⌘M, Zoom, Bring all to front) |
| **Help** | How to use Otty · What's new · Copy diagnostics… |

The Pause items are built from the same list as the menu bar icon's (`menuTemplate()` in `controls.ts`), so the two never disagree. **The menu bar icon** stays as today, with one new item under "Open chat": "Open the Otty window".

**Quitting.** ⌘Q quits Otty, as on any Mac app: the otter, the hotkeys and anything running stop. Closing the window (⌘W) is how to put the roomy window away and keep Otty floating, and the File menu shows both, so the difference is visible.

## Part 2 · Home

Where Otty looks after you: the otter at the centre, how things stand in one sentence, then only the blocks with something in them. It opens first in the roomy window, and is ⌘1 at any width.

### What it holds (first version)

| Block | Shows | Comes from | When it's hidden |
| --- | --- | --- | --- |
| **Greeting** | The otter, a greeting, one sentence on how things stand, and what's running | `home()` (below) | Never |
| **Needs you** | Decisions waiting: questions from look-ups, chats waiting for an OK, runs more than a day late. Oldest first | The Logbook's Needs you view (D-63) | Nothing waiting |
| **Today** | A timeline of today's look-ups and checks: done, running, and due later today | `JobStore`, today's runs and due times | Nothing today |
| **Looking after** | Repeating checks and planned look-ups after today, soonest first | `JobStore`, scheduled jobs and series | Nothing planned |
| **What left your Mac** | One sentence: today's counts of questions, searches and pages, and changes with whether they can be undone | Sent log (D-31) and ledger (D-46) | Never (after onboarding) |
| **Try asking** | Three try-asking suggestions as rows | `shared/suggestions.ts` | Once Otty has been asked anything |

Kept for later, with their places in the layout set now: **Goals** (first in the side blocks), **Otty noticed** (after Goals), **New keepsake** (last). Each ships with its own feature, under the rules in DESIGN.md's Home table.

### Layout by band

| Band | Layout |
| --- | --- |
| Compact | One column, gutters 16, the composer at the bottom. Greeting, then Needs you, Today, Looking after, What left your Mac, Try asking, 12 apart |
| Rail and medium | One column at most 680, gutters 16. Greeting, then Needs you full width, then two columns 12 apart once the column is 600 or wider: Today on the left; Looking after and What left your Mac on the right. Narrower than 600: one column, as compact |
| Wide (Home's pane shows from 980) | Main column at most 720, gutters 24: greeting, Needs you, Today, Try asking. The details pane (300): Looking after, then What left your Mac, as the pane's labelled blocks (Spec 05). Goals, Otty noticed and the keepsake will join the pane |

At 1280 × 800, the first thing anyone sees: the sidebar (216), Home's column (764 less gutters, so 716 of content), and the pane (300). The greeting takes the top 300 px; Needs you and Today follow.

### Greeting

```
              ╭────╮
              │ 🦦 │          otter 96 / 120 / 152
         ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈      water line
          Good afternoon       greeting
  One thing needs you. Next:   sentence
   the visa page at 6pm.
 [● Reading train times · 3 of about 6 pages · back by 4:10]
```

| Part | Compact | Rail, medium | Wide |
| --- | --- | --- | --- |
| Top padding | 24 | 32 | 48 |
| Otter | 96, a round button | 120 | 152 |
| Water line | 220 × 22, `--water`, rising 18 px into the otter's base so it sits *in* the water | 260 × 22 | 300 × 22 |
| Greeting | 8 below the water, `--fs-heading` (20 / 26, 800) `--text` | `--fs-heading` | `--fs-display` (24 / 30, 800) |
| Sentence | 4 below, `--fs-body` `--text-2`, centred, at most 46 characters a line, `text-wrap: balance` | Same | Same |
| Now line | 12 below, when something is running | Same | Same |

`--water` is a new colour token: `rgba(99, 124, 66, .12)` light, `rgba(140, 155, 106, .16)` dark, from the draft. It's decoration only and never carries information.

**The now line** is a quiet card, not a capsule: 32 high, padding 0 12 0 8, radius 10, `--surface`, `--elev-1`, gap 8. An 8 px `--brand` dot stepping between full and 35% every 1.2 s (only while running and visible), then `--fs-small` `--text-2` with the title in 700 `--text`: "**Reading train times** · 3 of about 6 pages · back by 4:10". Two running: "**2 look-ups** · back by 4:30". Clicking it opens the run's Logbook entry. While paused: a still `--straw` dot and "**Paused** until 3pm · Carry on" with Carry on as a quiet `--brand-text` button.

**Greeting words** are by the Mac's clock: Good morning (5:00–11:59), Good afternoon (12:00–17:59), Good evening (18:00–4:59). No name until the Notebook can say how you like to be called.

**The sentence** comes from main (`home().status`), the first that applies:

| When | Sentence |
| --- | --- |
| Paused | "Otty is paused until 3pm. Nothing runs on its own." |
| Something needs you | "One thing needs you." / "Two things need you." (words up to nine), then " Next: the visa page at 6pm." if something is due today |
| Working | "Reading train times now. Back by about 4:10." |
| Something is due today | "Next: the visa page at 6pm." |
| Nothing | "Nothing needs you. Ask me anything." (L6) |

**The otter** is a 96 / 120 / 152 round button named "Otty". Until the den ships, a press gives the squish (B1) and a blink, and nothing else: it's the pet, not a menu. When the den ships it becomes the den's door (L7).

### Blocks

Every block is a Card (Foundations): `--surface`, `--elev-1`, radius 14, padding 12 16, gap 8. Its head is one 20 px row: a 12 px glyph in a 16 box (`--text-2`), 6 gap, the label in `--fs-label` (`--text-2`, uppercase), and a trailing `--fs-meta` `--text-2` tabular value (a count or the date). In the wide pane the head moves out, as the pane's block label (Spec 05), and the card keeps only its content.

#### Needs you

Head: "NEEDS YOU" with the count trailing in `--straw-ink` 700; glyph the inbox, in `--straw-ink`.

| Part | Spec |
| --- | --- |
| Item | Grid 16 · 1fr, 12 apart. Padding 12 0. A 1 px `--hairline` between items, starting at the text column. The first item's top padding is 4 |
| Glyph | 16 px, `--straw-ink`: the kind's glyph (globe for a page, search, bell for a reminder, clock for a late run). Unusual items (Spec 01's reasons) use the warning glyph |
| Folded item | One line, 36 high: the question in `--fs-ui` 600 `--text`, ellipsis; trailing "since 3:52" in `--fs-meta` tabular `--text-2`. The whole row is the button that opens it |
| Open item | The question in `--fs-ui` 700; 4 below, the subject in `--fs-small` (host in 700 `--text`, path in `--text-2`, one line, ellipsis); for unusual items, Spec 01's consequence line in `--straw-ink`; 8 below, the actions as small buttons (28), 8 apart: Spec 01's words for the kind ("Read it", "Add it", "Search", "Run it anyway") primary, "Skip" quiet, and at the trailing edge "Waiting since 3:52 · Train times to Sendai" in `--fs-meta` `--text-2`, which drops to its own line first when there's no room |
| A chat waiting | "A chat is waiting for your OK" with the chat's title as the subject, and one secondary button, "Go to chat" |
| Opening | The oldest item is open; the others are folded. Opening one folds the open one (`grid-template-rows` over `--t-settle`) |
| More | At most three items, then a 36 px row, "2 more in the Logbook", in `--fs-small` 600 `--brand-text`, opening the Logbook's Needs you view |

**Deciding** an item runs the same action as the card in the chat or the Logbook (the renderer sends its id; main looks it up, as today). The item then folds into Spec 01's receipt line ("Read it · Train times to Sendai carries on", 28 px) for 2.4 s, and ebbs; the count rolls (X3). When the last one goes, the block ebbs over `--t-settle` and the sentence above changes.

#### Today

Head: "TODAY" with the date trailing ("Wed 19 Nov"); glyph the clock.

The river: a column of ticks joined by a 2 px `--water` line.

| Part | Spec |
| --- | --- |
| Tick | Grid 44 (time) · 20 (dot) · 1fr, 8 apart. Padding 8 0. 36 high for one line |
| Time | `--fs-meta` tabular `--text-2`, right-aligned, on the first line's baseline. "8:00", or "now" for the running tick |
| Line | 2 px `--water`, centred in the dot column, from the first dot's centre to the last's |
| Dot | 10 px, a 2 px `--grass` ring on `--surface` (upcoming); filled `--grass` (done); a `--straw` ring with the word "Couldn't finish" in the sub-line (failed: never red) |
| Now dot | 14 px `--brand` with a 4 px `--brand-soft` halo, stepping (L2) only while running and visible. Its tick has padding 12 0, its time in `--brand-text` 700 |
| Text | `--fs-ui` 500 `--text`, the title in 700, one line, ellipsis: "**Japanese words quiz** prepared". Done ticks: all `--text-2`, the title 600. Sub-line, when there is one, 2 below in `--fs-small` `--text-2`: "Page 3 of about 6 · Add a note" on the running tick (Add a note as a `--brand-text` 600 text button, Spec 04's steering note) |
| Folding | More than six ticks: the earliest done ones fold into one 36 px tick, "3 earlier", with a hollow dot, which unfolds in place |
| Opening | Clicking a tick opens its Logbook entry |

Holds jobs that ran, are running or are due today, each by the time it started or is due. Otty's own calendar, meeting prep and the dashed "may suggest" nudges are later rows in the same river (DESIGN.md's Home table); they need no layout change.

#### Looking after

Head: "LOOKING AFTER" with the count; glyph the repeat arrows.

Rows 36 high, gap 8: a 14 px glyph in `--text-2` (repeat for a series, calendar for a one-off), the title in `--fs-ui` 500 `--text` (ellipsis), and the next time trailing in `--fs-meta` tabular `--text-2` ("Mon 9:00", "daily · 6pm", "Thu 18:00"), from `describeWhen`. Hover: a `--fill` wash with the same soft edges as the Logbook's entries. At most four, then a 36 px "All in the Logbook" row (`--fs-small` 600 `--brand-text`) opening Coming up. Clicking a row opens its Logbook entry, where Stop and Stop repeating live.

#### What left your Mac

No head in compact and medium (it's one sentence): a card with a 14 px "out" glyph in `--text-2`, 8 gap, and `--fs-small` `--text-2` with the counts in 700 `--text`, then " Logbook" as a `--brand-text` 600 text button opening What left my Mac.

| When | Words (from main) |
| --- | --- |
| Something left | "Today, **4 searches** and **2 pages** left your Mac, and **6 questions** went to DeepSeek. **2 changes**, both can be undone." |
| Something can't be undone | "…**2 changes**, 1 can't be undone." |
| Nothing left, chats remembered | "Nothing has left your Mac today." |
| Nothing left, Remember my chats off | "Nothing has left your Mac since Otty opened." (the log only covers this session) |
| Local model | "Everything stayed on your Mac today." when the web is off and nothing was sent |

Main counts from the log, never estimates. In the wide pane it's the block labelled "WHAT LEFT YOUR MAC".

#### Try asking

For people who haven't asked anything yet. Head: "TRY ASKING". Three rows, 36 high, gap 8: a 14 px glyph in `--brand-text`, the suggestion in `--fs-ui` 500. A row fills the message box and focuses it, and never sends (the rule for try-asking chips). Gone after the first question, for good.

### The message box on Home

The same message box as Chat (D-62), under Home's main column, with the placeholder "Ask Otty anything, or give it something to look after". Sending starts a new chat and switches to Chat with it, the question surfacing as it would in an empty chat (Spec 03).

### Live updates

Home asks main for `home()` when it opens and again on the events that change it (a job's status, a confirm opening or closing, a sent-log row, a ledger row, pause), at most once a second. Nothing polls while Home is hidden (`data-asleep`), and nothing on Home animates while idle except the now dot, which steps only while something runs (NFR-3).

### Motion

| Moment | Motion |
| --- | --- |
| Opening Home (L1) | Once per open, never on returning from a pushed page: the otter surfaces, then the greeting, then Needs you, 160 ms apart, each over `--t-settle` with a 12 px rise |
| A tick finishing (L3) | Its dot fills, its text goes to `--text-2`, and the now point drifts down to the next tick over `--t-travel` |
| An item decided | Folds to its receipt, which ebbs after 2.4 s; the next item opens over `--t-settle` |
| Blocks appearing or leaving | Grow open or fold through `grid-template-rows` over `--t-settle`, pushing what's below (W7) |
| Pressing the otter | Squish to 0.94 in 120 ms, back on `--buoy` over 480 ms, and a blink |
| Reduced motion | All become 200 ms fades; the now dot holds still at full |

### States to draw

Each band, light and dark: first open after onboarding (Try asking, nothing else) · nothing today · one waiting item · three and more · an unusual waiting item · a chat waiting · running (one and two) · paused · a failed run in Today · seven ticks folded · Looking after with five · Remember my chats off · a local model with the web off · long titles and Chinese titles · the window at 380.

### Accessibility

Home is a `main` region named "Home". The greeting is a heading (level 1) and the sentence is a live region, polite, so a change ("One thing needs you") is read once. Each block is a region named by its label. The river is a list; each tick is named in full ("8:00, done, Morning note read"). The now line's dot isn't the only signal: the words say "now" and "Paused".

## What main must provide

- **The window's two states** (`windows.ts`): `expand()`, `shrink()`, the remembered bounds, the level, the traffic lights, and the Dock icon and app menu shown and hidden in the order above. One IPC channel to ask for a switch (`window:state`, panel view only), and the state sent back with the window's events so the header knows its height.
- **The app menu** (`controls.ts`, beside `menuTemplate()`), and `app.on('activate')` opening the roomy window.
- **`home()`**, one read-only query (`home:get`), returning everything worded by main: `{ greeting, status, now: [], needs: { items (first three), total }, today: [], after: [], left: { words, counts } , firstRun }`. `needs` comes from the same code as the Logbook's Needs you view, so the two can't disagree.

## Preview scenes needed

`scene=home` with `&state=` each of `first`, `quiet`, `waiting`, `many`, `unusual`, `chat-waiting`, `running`, `two-running`, `paused`, `failed`, `folded`, `local`, at 380, 420, 760, 980 and 1280, light and dark, and `&state=floating|roomy` from Spec 05 for the traffic-light row. The Expand and Shrink move, the Dock icon and the menu bar can't be drawn in a browser; they're smoke and ✋ steps (DEVLOG).

## Done when

Expand and Shrink move one window between the two states with the chat, scroll and draft kept; the Dock icon and menu bar come and go with the roomy window and never flicker; opening Otty from Applications opens the roomy window on Home; Home shows only blocks with something in them, all worded by main; deciding a Needs you item on Home and in the Logbook does the same thing; and the idle budget holds with Home open and nothing running.
