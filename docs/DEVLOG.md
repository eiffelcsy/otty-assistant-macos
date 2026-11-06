# Otty — Dev log

The working plan: what's next, how we'll build it, and how to check it works.

**How to use this doc**
- Every piece of work gets an entry here **before** it's built: goal, design, steps, done-when.
- When an entry ships, move a short summary to [CHANGELOG.md](CHANGELOG.md), delete it here, and add its checks to the smoke test below.
- Ideas that aren't planned yet live in [BRAINSTORM.md](BRAINSTORM.md). Promote one by writing an entry here.
- Status: ⏳ next · 🔨 in progress · 🧪 built, needs a Mac test · ⏸ parked.

## Architecture (current)

```
┌──────────────── main process (Node 24) ────────────────┐
│ index.ts       lifecycle, tray, hotkeys, IPC, badge    │
│ windows.ts     bubble · quick view · panel · pickup    │
│ capture.ts     selection (⌘C trick), snip, frontmost   │
│ llm.ts         ChatSession: turns, background work     │
│ loop.ts        the tool loop, shared by chats and jobs │
│ memory/        what Otty knows: store, guard, habits   │
│ math.ts        the calculator, mathjs behind allowlist │
│ providers/     one adapter per API format, profiles    │
│ store/         ChatStore on SQLite (otty.db): chats,   │
│                search, retention; schema in db.ts      │
│ files/         attachments; fileWorker.js reads docs   │
│ tools.ts       search_web, read_page, calculate, …     │
│ web.ts         DeepSeek Search & Fetch                 │
│ pageReader.ts  reads public pages from the Mac         │
│ knownUrls.ts   which addresses read_page may open      │
│ copyFormats.ts tables on the clipboard as HTML + tabs  │
│ ocr.ts         runs the otty-ocr Swift helper          │
│ explainCache   explain cards, warmed after an answer   │
│ language.ts    which language each answer uses         │
│ settings.ts    JSON + one safeStorage key per service  │
│ permissions.ts macOS TCC checks                        │
│ metrics.ts     OTTY_METRICS=1 idle measurements        │
└────────────────▲──────────────┬────────────────────────┘
          invoke │              │ events (chat:event, panel:open, quick:open, bubble:*)
┌────────────────┴──────────────▼────────────────────────┐
│ preload: window.otty (typed, narrow API)               │
└────────────────▲──────────────┬────────────────────────┘
┌────────────────┴──────────────▼────────────────────────┐
│ renderer (React), one bundle, four views               │
│  ?view=bubble → <Bubble/>  otter button + badge        │
│  ?view=quick  → <Quick/>   ask-at-cursor card          │
│  ?view=panel  → <Panel/>   chat, Recent chats, settings│
│  ?view=pickup → <Pickup/>  a snip with selectable text │
└────────────────────────────────────────────────────────┘
```

**Key decisions (still true)**
- Main owns the conversation and the API key. Renderers only see `ChatEvent`s.
- Explain terms are `[term](#explain)` and tips are `> 💡` blockquotes (see `Markdown.tsx` and `prompts.ts`).
- The bubble is a non-activating `type: 'panel'` window, so clicking it keeps the other app's selection.
- Pictures never touch disk beyond the moment of encoding.
- **Each request is the previous request, plus its output, plus new messages.** DeepSeek only reuses its cache for an exact match from the first token, so the system prompt depends only on settings, per-turn context goes in `turnNote` at the end of the user message and stays in the history, and `llm.test.ts` guards it byte for byte. The chat shows only the user's words. The one exception is the model's thinking, dropped from earlier replies between turns, which costs little.
- A user message carries `captures[]` (each with its app) plus `files`; saved chats are read through `store/upgrade.ts`, so old shapes keep loading.
- **Web safety:** answers never load remote images, built pages have a Content Security Policy (`electron.vite.config.ts`: `img-src 'self' data:`, and nothing else can be fetched), and `read_page` asks first unless `knownUrls.ts` finds the exact address in what the user sent or a search or page returned. Any new UI that shows a remote picture or a `blob:` URL has to plan around this.
- Saved chats live in `userData/otty.db` (built-in `node:sqlite`, no native module). Calls are synchronous on main and sub-millisecond for a normal turn: the question is written as it's sent (after the request is under way), and the end of a turn writes only that turn's rows. Schema changes are new migrations in `store/db.ts`, never edits to a released one.

## Roadmap

| ID | Item | Status | Depends on | Size |
| --- | --- | --- | --- | --- |
| D-14 | Otty's own snip: a cute paw cursor on a frozen screen and instant crop | ⏳ | — | M (2 days) |
| D-11 | Do it with me: step cards that paste, open, click menus and press shortcuts; quick-view follow-ups | ⏳ | — | M (2–3 days) |
| D-22 | Keep going: answers that carry on, background research jobs, Activity (Stage 1 of AUTONOMY.md) | 🔨 | — (steps 0–1 are in) | L (4–6 days left) |
| D-1 | Context-aware intents (local encoder classifier) | ⏳ later | its step 0, OCR helper (`intent_feedback`, with embeddings, is in schema v1) | L (4–6 days) |

**Where things stand (2026-11-06).** 0.4.0 is published. **0.5.0 is tagged**: smoke-test steps 55–58 passed on DeepSeek, and the `dmg` workflow makes its draft release. Steps 59–61 need other services and are **yet to be tested**, so nothing has run against a real Claude, OpenAI or local model. Steps 62–66 haven't been reported either. `main` is getting, unreleased: memory (D-10), math (D-12), and D-22 steps 0–1; see CHANGELOG → Unreleased. These passed their unit tests and the UI preview, but no real model has called `remember` or `calculate` yet, so run steps 67–76 first. `main` requires a PR with a green `ci` check, and branches must be up to date before merging.

**Build order**
1. **Try memory and math on a real model:** smoke-test steps 67–76 on DeepSeek. How often a model calls `remember` well, and plans one `calculate`, is the part tests can't show. Then steps 62–66 for 0.5.0, and 59–61 when a Claude or OpenAI key is to hand.
2. **D-14 Otty's own snip.** The snip is the moment Otty is most visible, and today it's the plain macOS crosshair. Freezing the screen also makes snips instant, catches menus that would vanish, and lets Pick up text open over the original spot.
3. **D-11 step cards.** Answers become checklists that paste, open, click menus and press shortcuts for you, in any app: the safe first stage of "Show me how". The proofread card gains **Replace in Pages** here.
4. **D-22 Keep going, from step 2.** Otty's first step from reactive to autonomous: work carries on while you look away.
5. Then **D-1**, starting with its step 0, which may shrink it. It has the most moving parts (model, eval set). The OCR helper is already built. Signing and notarization (BRAINSTORM, "Trust") should land before builds go to other people; the `dmg` workflow can then sign with secrets.

---

## D-14 · Otty's own snip: a paw cursor and a frozen screen ⏳

**Goal.** Snipping should feel like Otty, not like a system tool, and be faster too. The whole-screen shortcut shipped ahead of this in 0.5.0.

**Today.** ⌥⇧Space runs `screencapture -i` (`capture.ts`): the macOS crosshair, a grey box and system styling. It can't be themed, it can't show Otty, and it can't pick a whole screen without extra keys. The floating otter also lands in the picture.

### The snip overlay
- **Freeze, then select.**
  - On the hotkey, Otty first snapshots the display(s), with its own windows left out (below).
  - It then shows its overlay over that frozen picture, softly dimmed. You select on the frozen image, and on release the crop happens locally: **instant**, with no second capture and no flash.
  - Like macOS's own "freeze", it catches what was on screen at the moment of the hotkey: an open menu, a tooltip, a hover state that would vanish when focus changes.
- **Look** (tokens from `styles.css`; no new hex values):
  - a soft dim over the screen, with the selection clear;
  - rounded corners (`--r-sm`) and a meadow hairline with a soft glow;
  - a small size pill (`640 × 320`) under the selection;
  - a one-line hint the first few times, then it gets out of the way: "Drag to snap · click for the whole screen · Esc to cancel".
- **The cursor: Otty's paw.**
  - It's a real CSS cursor (`cursor: image-set(paw.png 1x, paw@2x.png 2x) x y`), so it's drawn by the system with no lag, unlike a DOM element following the mouse.
  - It's 32 pt (64 px @2x). The hotspot is a small, precise pad dot at the tip, so aiming stays exact.
  - It has a dark outline and a soft light halo, so it's visible on white, black and busy backgrounds.
  - Two states: **open paw** (aiming) and **pinched paw** (while dragging), switched by a class on mousedown.
  - Faint full-width and full-height guide lines through the cursor help with precise edges. They're drawn in the overlay and disappear while dragging.
- **Interaction:**
  - drag to select, release to snap;
  - **click without dragging snaps the whole display under the cursor**;
  - Esc cancels;
  - Space while dragging moves the selection;
  - arrow keys nudge the selection 1 pt (⇧ for 10), and ↵ confirms, so it works from the keyboard.
- **A small "snap!"** on release: the selection pulses once and the paw does a tiny boop, then the overlay closes. With `prefers-reduced-motion`, it just closes.

### Build
- **Windows** (`windows.ts`):
  - One transparent, frameless overlay window per display, **created hidden at startup** so it appears within a frame of the snapshot being ready.
  - Window level `screen-saver`, so it covers the menu bar and Dock. `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
  - Bounds equal the display's `bounds`, rebuilt on `screen` display-added, display-removed and metrics-changed events.
  - It takes focus while open (for Esc and the arrow keys). The frontmost app is recorded **before** the overlay opens, as today.
- **Snapshot:**
  - **Leaving Otty out:** use `withWindowsHidden` from `capture.ts`, as the whole-screen shortcut does. Content protection would avoid the blink, but newer macOS capture APIs may ignore it. It couldn't be tested without Screen Recording, so try it on a Mac first if the blink bothers anyone.
  - **How:** whichever of `desktopCapturer.getSources({ types: ['screen'], thumbnailSize: <display size × scale> })` (in-process, no file) and `screencapture -x -D n` (one per display, in parallel) is faster on an M1 at full Retina size. Prototype both and keep the winner.
  - **Budget: hotkey → overlay visible ≤ 150 ms, release → snip in the tray ≤ 50 ms.**
- **Crop** in main: from the overlay's points to the display's pixels (`scaleFactor`), then `encodeImage` (the existing downscale and JPEG). Multi-display coordinates are unit-tested.
- **Renderer:** a fourth view, `?view=snip` (`src/renderer/src/snip/Snip.tsx`), in the same bundle. IPC:
  - `snip:open` (main → overlay: the frozen image as an object URL). The built pages' CSP (`img-src 'self' data:`) blocks `blob:`, so add it to `img-src` in `electron.vite.config.ts`. It's safe: a `blob:` address can only come from the page itself, so nothing leaves the Mac. Answers still can't use it, because `Markdown.tsx` drops every image;
  - `snip:done` (overlay → main: rect or "whole display");
  - `snip:cancel`.
- **Cursor art** goes through `tools/otty-art/prepare.py`, like the other frames:
  - new sources `paw-open` and `paw-pinch`;
  - outputs `cursor-paw.png`, `cursor-paw@2x.png`, `cursor-pinch.png` and `cursor-pinch@2x.png`, each with its hotspot written to a small JSON file;
  - the script adds the outline and halo. Never hand-edited.
- **Permissions:** the snapshot needs Screen Recording, which snips already need. Without it, `desktopCapturer` throws rather than giving a blank, so show the existing "needs-screen" notice.
- **Fallback:** if the overlay can't be shown (a display change mid-snip, for example), fall back to `screencapture -i`, so snipping always works.
- **`tools/ui-preview`:** `?view=snip` with a sample frozen background, to tune the look and cursor in a browser.

### Tests
- Rect maths: normalising a drag in any direction, clamping to the display, points to pixels at scale 1 and 2, a second display at negative coordinates, a click becoming "whole display".
- Timing, in a dev log: hotkey → overlay visible, release → chip.

### Done when
- ⌥⇧Space shows Otty's paw on a softly dimmed, frozen screen within a blink. Dragging shows the pinched paw, rounded selection and size pill; releasing adds the snip at once, with no grey macOS box.
- Snipping an open menu keeps the menu in the picture.
- Clicking without dragging snaps that whole display.
- The paw is easy to see on white, black and a photo.
- With two displays, both work.
- Reduced motion turns off the boop.

### Smoke test (add to the checklist when it ships)
- Press **⌥⇧Space** → within a blink, the screen dims and freezes, with Otty's paw as the cursor. Drag → the paw pinches, and a rounded selection with a size pill follows. Release → a tiny snap, and the snip is in the quick view at once, without the floating otter in it. Open a menu in any app first, then ⌥⇧Space → the menu is in the snip.
- ⌥⇧Space, then click without dragging → the whole display is the snip. Esc → cancels quietly. Arrow keys and ↵ → nudge and confirm without the mouse. Check the paw on a white page, a black page and a photo: it's always easy to see.
- Turn on Reduce motion in macOS → no boop.

---

## D-11 · Do it with me: step cards that act on the answer ⏳

**Goal.** Most of Otty's answers are steps: "open System Settings → Privacy → Accessibility", "press ⌘⇧4", "paste this formula into B2", "choose File → Export → PDF". Today the user reads them and does all the work. Step cards turn those steps into a checklist under the answer, where each step can be **done for them with one click** or ticked off, in any app. It's the first, safe stage of "Show me how" (BRAINSTORM concept notes): Otty helps you through a task, but nothing happens until you click.

### The step card
- When an answer has 2+ steps the user will carry out on the Mac, the model calls `show_steps({ title, steps })` instead of writing a numbered list. Each step is `{ text, action? }`. The card shows under the answer: numbered steps, the current one highlighted, a **Done** tick on each, and "2 of 5" progress.
- A step with an `action` gets a button. Actions are the general verbs of using a Mac, not app integrations:

| Action | Button | What happens | Example |
| --- | --- | --- | --- |
| `paste { text, mode: 'replace' \| 'insert' }` | **Paste into Excel** / **Replace in Pages** | Clipboard save → activate the source app → ⌘V → clipboard restore | A formula, a rewritten paragraph, a translated reply, a Terminal command (pasted, never run: no Return is sent) |
| `open { target }` | **Open** | Opens a web page, an app (by name), a System Settings pane (an allowlist of `x-apple.systempreferences:` links), or reveals a file or folder in Finder | "Privacy & Security → Accessibility", "Open Disk Utility" |
| `menu { path: ['File', 'Export', 'PDF…'] }` | **Click File › Export › PDF…** | Clicks that menu item in the source app through System Events (Accessibility is already granted) | Any app's menu bar, which is where most "how do I" answers lead |
| `keys { combo: '⌘⇧4' }` | Keycaps, plus **Press for me** | Sends the shortcut to the source app | Screenshots, find, undo, app shortcuts |
| `copy { text }` | **Copy** | Clipboard only | A value to put somewhere Otty can't reach |
| (none) | — | A manual step: read, then tick | "Sign in to your bank" |

- **"I'm stuck on this step"** under the current step snips the frontmost window, adds it to a follow-up with the step's text ("I'm on step 3 and don't see Export"), and asks. This is the seed of the "teach me how to…" loop: Otty looks again and adjusts the remaining steps (`show_steps` with `replaces` updates the card in place).
- When a `menu` path doesn't exist (renamed in this version), the button says "I couldn't find that menu", the step becomes manual, and Otty is told so it can suggest the real name on the next turn.
- Step progress (done ticks, which actions ran) is saved with the chat and shown when it's reopened.

### Where it acts, and what keeps it safe
- **Only in the app the question came from** (`AppInfo` gains `bundleId` and `pid` from `frontmostApp()`), or the app an `open` step opened. Never in Otty itself.
- **Every action is the user's click.** The model proposes; nothing runs on its own.
- **Risky targets get a second click.** A `menu` or `keys` step whose label or path contains words like Delete, Erase, Empty Trash, Format, Send, Pay, Purchase, Sign Out or Reset shows a warning style and asks "Sure?" first.
- **Paste** never sends Return, and never goes into a secure (password) field. If the focused field is secure, macOS blocks it, and Otty says "That's a password field. Copy it instead?".
- **`open`** accepts only http(s), app names that exist in `/Applications` or `/System/Applications`, the System Settings allowlist, and paths in the user's home folder (reveal only, never open documents).
- **The step cards' rules apply to web pages too.** A `show_steps` from a turn that read a web page is fine, but the page's text never becomes an action without the model choosing it, and the user's click.

### Quick view
- Step cards render compactly in the quick view, and the card stays open while you work through the steps: it's pinned like **＋ add more** (D-8), so clicking into the app to do step 2 doesn't close it.
- **Follow-ups in the quick view:** after an answer, a slim input lets you ask a follow-up in the same chat. ↵ on an empty box still means "continue in chat". "I'm stuck" uses this.

### Build
- `tools.ts`: `show_steps` (returns "Shown to the user" at once). A new `ChatEvent` `{ type: 'steps', id, card }`; the assistant message keeps `steps?: StepCard`.
- `src/main/act/`: `paste.ts` (clipboard save/restore shared with `capture.ts`), `menu.ts` (System Events menu click by path, with a "not found" result), `keys.ts`, `open.ts` (with the allowlists), and `risk.ts` (risky-word check, unit-tested). IPC `steps:run(messageId, stepIndex)` and `steps:done`.
- `components/StepCard.tsx` with step icons from UIcons; `Quick.tsx` pinning while a card is active; the follow-up input.
- `prompts.ts`: when to use `show_steps` (things the user does on their Mac, 2+ steps) and when not (explanations, one-liners); use real menu names for the app in the note; prefer an action whenever one fits.
- REQUIREMENTS: a new FR for step cards; FR-7's table gains `show_steps`.

**Done when:**
- In Excel, "add up column B" gives a step card whose **Paste into Excel** puts `=SUM(B:B)` in the selected cell, and the clipboard is back as it was.
- "How do I let Otty read my screen?" → **Open** lands on Screen Recording in System Settings.
- In Pages, "export as PDF" → **Click File › Export To › PDF…** opens the dialog.
- "I'm stuck" on a step snips, asks, and updates the card.
- A Delete step asks "Sure?" first.
- In the quick view you can work through all the steps without it closing.

---

## D-22 · Keep going: Otty works while you look away 🔨

**Goal.** Stage 1 of [AUTONOMY.md](AUTONOMY.md). Otty stops doing only one thing at a time. An answer carries on when the user moves to another chat, and a bigger question becomes a job that runs in the background, survives a restart and waits as a normal chat when it's done.

**What's in.** Answers that keep running, read-only research jobs, an Activity view, and sleep and restart handling. **What's out:** schedules, recipes, anything Otty starts itself, and any job tool with side effects. Those are Stage 2.

**The promise doesn't change.** The user starts every job with a card, so NFR-5 still holds and needs no rewording yet.

### 1. Answers that keep running

Today `send()`, `open()` and `reset()` all stop the running turn, and that includes a new hotkey question (`opts.fresh`).

- **Turns belong to a chat, not to the session.** `ChatSession` keeps a map of running turns by thread id, each with its own `AbortController` and confirms. It still has one chat on show, and only that chat's events reach the windows.
- **Moving away no longer stops anything.** `open()` and `reset()` just change which chat is on show.
- **A new question in the same chat still replaces the running answer.** One history can't take two turns at once, and this is what people already expect from Stop.
- **Coming back mid-answer:** `open()` uses the live thread, not the saved one, and `load` says which answer is still streaming. Its confirm card, if any, is shown again.
- **Limit:** three running turns. A fourth stops the oldest one that isn't on show.
- These turns stay in memory, as today. A quit loses them. Only jobs survive.

### 2. Jobs

- **Started by a `start_job({ title, brief })` tool** from a chat turn, for questions needing many sources or more rounds than a chat gets. It returns straight away, and the chat carries on with a "Looking into…" chip. The prompt rule goes in the static system prompt.
- **Always a card first, every time,** through the existing `askConfirm`: what it will look into, that it uses the user's key, and that it only reads public pages. The card is what stops a hostile page from starting a job, because the model's own request never starts one.
- **A job sees only its brief.** No chat history, memories, captures or files. It has outside content and a way out (search queries and addresses), so under the Rule of Two it must not hold private data. The card shows the whole brief, so the user sees exactly what goes.
- **Tools:** `search_web` and `read_page`, and nothing else, enforced in `runTool` by the new allowed list. Not offered with `web: 'off'`, and refused there too.
- **Addresses:** the brief is written by the model, so its text must not count as known in `isKnownUrl`, even though it's a `user` message. The job keeps `seed_urls`: the addresses in the brief that were already known in the source chat. Everything else must come from a search or page. An unknown address makes the job wait (below).
- **One job runs at a time,** and up to five wait in a queue. That keeps spending and CPU predictable.
- **System prompt:** a new `jobPrompt`, fixed by settings, and the history only grows, so the cache rule holds for free. No model call touches `ChatSession` history.
- **Results become a chat.** A finished job writes a new saved thread: the brief, then the report. Reports use the same Markdown as answers, and appear in Recent chats and search. Follow-ups just work, which also delivers "Reply to a note". The thread's history holds the brief and report, not every page read.
- **Links, from the start:** `source_thread` and `result_thread`, so "why did this happen?" can be answered later.

**States:** `queued → working → waiting → done`, plus `paused` and `failed`. Only the runner changes them. On screen: Waiting its turn, Working, Waiting for you, Done, Paused, Couldn't finish.

### 3. Limits (the first supervisor, in plain code)

| Limit | Value | When reached |
| --- | --- | --- |
| Tool rounds | 24 | Tools off, and it writes up what it has |
| Lookups (searches + pages) | 30 | Same |
| Working time | 15 minutes | Same |
| The same call with the same arguments | 3 times | Same |
| Dropped connection | 3 tries with growing gaps | Paused |
| Other failures | Once | Failed, with friendly words and what it found so far, if anything |

Running out gives a partial report that says so, not a failure, using the same "tools off" final round as chat. Limits count rounds and lookups because `Provider` doesn't report tokens. Spend in tokens needs usage events, which belong with the usage meter idea.

### 4. Saved step by step

- **Migration v2.** `jobs`: id, title, brief, status, seed_urls, source_thread, result_thread, language, rounds, lookups, worked_ms, wait_json, wait_answer, error, created_at, updated_at, seen_at. `job_steps`: job_id, seq, json. Allowed values are checked in TypeScript, as in v1.
- **`JobStore` interface** in `src/main/jobs/`, async like `ChatStore`, and with a contract test.
- **Each history message is one appended row,** written as it happens.
- **Resuming:** load the steps. If the last assistant message has tool calls with no result, run those first, then carry on. Stage 1 tools only read, so re-running one is safe. **Stage 2 must add a once-only check before any tool with side effects can be a job tool.**
- **A confirm that can wait:** an unknown address sets `waiting` and saves the question in `wait_json`. No promise is held. Allow or Don't Allow writes `wait_answer` and the job carries on, even after a restart. The next job in the queue runs meanwhile.
- **Sleep:** `powerMonitor` `suspend` pauses the running job without counting it as a failure. `resume` restarts it after a short delay for the network.
- **Launch:** jobs left `working` resume. **If a job has sat for over 24 hours, it goes to Paused with a Keep going button,** so reopening Otty after a holiday never spends money unasked.

### 5. Privacy and forgetting

- **Remember my chats off:** jobs run in memory only. Nothing is written, they don't survive a quit, and the report stays until quit.
- **Forget all chats** stops every job and deletes all jobs and steps. **Deleting a chat** that came from a job deletes the job's rows too. Deleting the source chat stops a job started from it, because the user has said to forget that chat.
- **Retention:** `prune` also removes finished jobs past the cutoff. Steps are deleted as soon as a job finishes, because the report is what's kept.
- The renderer gets titles, states and counts, never histories.

### 6. What the user sees

- **Activity**, a new panel view with a header icon, and a dot while something unseen waits. Each row: title, state, "12 pages read", and Stop, Allow / Don't Allow, Keep going or Open. Answers still running in other chats appear here too.
- **The otter:** a job finishing, or waiting for an answer, turns on the existing dot. While work runs, a small still marker shows, not an animation, because minutes of smooth motion is what NFR-3 warns about. The dot clears on opening a window as today, and Activity keeps its own dot until each job is seen (`seen_at`).
- **`forward()` changes:** thinking and happy only follow the chat on show. A background answer finishing only sets the dot.
- Friendly copy throughout: "Otty's still looking into this", and never "job", "queue" or "failed".

### Build (one PR per step, each shippable)

0. ✅ **`src/main/loop.ts`.** The tool loop, out of `ChatSession.run`: it takes a history, tools, a `ToolContext`, a round limit and a signal, and reports events and each appended message. `llm.test.ts` passed untouched.
1. ✅ **Allowed tools.** `ToolContext.allowed` is enforced first thing in `runTool`, with `toolDefs(allowed)` to match. `ChatRequest.serverSearch` is opt-in, so Claude's web search only comes with a request that asks for it. That also took it off explain cards and titles, which never needed it.
2. **Turns per chat** (section 1), with the `load` and `forward()` changes.
3. **Migration, `JobStore`, runner and limits**, with a fake provider, and no UI yet.
4. **`start_job`, the card, results as chats, forgetting.** IPC `jobs:list/stop/answer/resume/open` and an `onJobs` event, separate from `ChatEvent`.
5. **Activity view**, with `scene=activity` in `tools/ui-preview`.
6. **Sleep, wake and the 24-hour rule.** Then re-measure NFR-3 with a job running and after it ends.

### Tests
- Chat: moving to another chat leaves the answer running and saving to its own thread; a same-chat question still replaces it; only the shown chat's events reach the windows; a deleted chat's running turn never writes back.
- Allowed tools: a job calling `open_url` is refused even though the model asked; `web: 'off'` refuses everything.
- `isKnownUrl`: an address only in the brief needs an answer; a seeded one doesn't; a search result's does not.
- Resume: killing the runner at every step and restarting gives the same history, with no dangling tool call, on both API formats.
- Limits: each one ends in a partial report. A repeated call stops at three.
- Cache: every job request extends the one before it, byte for byte.
- Remember off writes nothing to `jobs` or `job_steps`.

### Done when
"Compare the three cheapest ways to get from Hong Kong to Tokyo in May" shows a card, then a chip. The user asks something else in a new chat, and both finish. Quitting mid-job and relaunching carries on. Closing the lid and opening it carries on. A job meeting an unknown address waits, and Allow works after a restart. A job left for two days asks first. A job that hits a limit gives a partial report that says so. The report is a normal chat that takes follow-ups. Idle CPU stays under NFR-3 once nothing is running.

### Smoke test (add to the checklist when it ships)
1. Ask something long, then press ⌥Space on other text and ask that → both answers finish, and the first chat shows its full answer when reopened.
2. Ask for a big comparison → the card shows the brief → Allow → a chip, and Activity shows Working with pages counted. Deny → nothing runs.
3. Quit mid-job and relaunch → it carries on. Sleep the Mac and wake it → it carries on. Turn the Wi-Fi off mid-job → Paused, then it resumes.
4. When it's done → a dot on the otter and in Activity → Open → a normal chat. Ask a follow-up. Search for it in Recent chats.
5. Turn off **Remember my chats**, run a job, quit → no trace in `otty.db`. **Forget all chats** with a job running → it stops and is gone.
6. On a model on this Mac → Otty never offers a job.

### Later (in BRAINSTORM)
A one-tap way to start a job, a "keep going" offer on a partial report, speech-bubble news, and showing real spend once usage is reported.

---

## D-1 · Context-aware intents with a local encoder classifier ⏳

**Goal.** When the user highlights or snips something and presses ↵ without typing, Otty works out what they most likely want. Example: an error message → "how do I fix this?". If it isn't confident, it asks, offering its best guesses as one-tap chips. The same scores reorder the quick-action chips in the panel.

### Step 0: re-test the plan before building it
This design assumes a local classifier beats simply asking the model, and that hasn't been tested. Take about 40 real-style captures per intent (they become the eval set below either way), then compare a plain model call with a phase-0 centroid classifier on accuracy, time to first useful word, cost and privacy.

The local classifier's case is that it's private, free and instant, and can pick tiles before anything is sent. If a model call is close on accuracy, the cheaper plan is "Intent-lite" in BRAINSTORM for text captures, and D-1 shrinks to what's left. Write down the result here either way.

### Intents (v1)

| Intent | Typical input | What Otty does with no prompt |
| --- | --- | --- |
| `fix_error` | Stack traces, dialog errors, "permission denied", 錯誤訊息 | Explains the error in plain words, then gives numbered fix steps for that app |
| `explain` | A dense paragraph, jargon, a chart | Explains it simply (today's default) |
| `summarize` | Long article or email text | 3–5 bullet summary |
| `translate` | Text in a language other than English, or English text when a home language is set and the user seems to want it | Translates into English, or into the home language for English text (D-2) |
| `define` | 1–5 words: an unfamiliar word, idiom or acronym | Word-help card: plain meaning, home-language translation, an example (D-2) |
| `draft_reply` | An email or chat message addressed to the user | Drafts a short reply, with "Copy" or "Paste back" |
| `explain_code` | Code snippets | Explains what the code does, line by line if short |
| `solve` | A maths, homework or quiz question | Walks through the solution step by step |
| `other` | Anything else, or mixed | **Asks**: "What would you like to do with this?" plus the top 3 intents as chips and a text box |

Keep the list short. Each new intent needs eval data and a template, so it's added only when "other" keeps catching the same kind of request (track it in BRAINSTORM).

### Model and runtime

- **Approach: a frozen multilingual encoder plus a small trained softmax head.**
  - The encoder turns `"[app: Terminal]\n<text, first ~512 tokens>"` into one sentence embedding (mean-pooled).
  - The head is a single linear layer, 384 → 9 (one per intent), trained offline and shipped as a JSON weight file of a few KB.
  - Including the app name lets "Terminal + red text" lean towards `fix_error` without any rules.
- **Candidate encoders** (pick by eval):
  - **English-first, small (try first):** `Xenova/all-MiniLM-L6-v2`. Measure its int8 ONNX size, expected to be tens of MB. Captured content is almost always English for our users (see D-2), and typed prompts skip classification, so a multilingual model may not be worth about 5× the size.
  - **Multilingual (fallback):** `Xenova/multilingual-e5-small` or `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, about 118M parameters, expected around 110–130 MB int8. Switch only if the eval shows Chinese captures matter.
  - Bundle the chosen model via electron-builder `extraResources` rather than downloading it on first use, so the feature works offline and stays private.
- **Runtime:** `@huggingface/transformers` (ONNX Runtime) inside an Electron `utilityProcess` (`src/main/intent/worker.ts`).
  - Inference never blocks main.
  - Load the model lazily on the first capture after launch, then keep it warm.
  - Check that the `.node` binary is unpacked from asar (`asarUnpack`) in packaged builds.
- **Phase 0 shortcut (optional, day 1):** before the head is trained, score by cosine similarity to per-intent example centroids. This gets the UX flowing end to end early.
- **Screenshots need text first.** Use the `otty-ocr` Swift helper (`tools/otty-ocr/`, `src/main/ocr.ts`). It uses Apple Vision `VNRecognizeTextRequest` with `en-US` and `zh-Hant` (Vision has no separate HK model; Traditional characters cover it).
  - The OCR text feeds the classifier.
  - It is also sent to the LLM next to the image, which means non-vision models can finally handle snips.
  - With no OCR result, the snip uses today's default.

### Decision rule

```
if the user typed something      → skip classification, send as is
p = softmax(head(embed(input)))
top = argmax(p)
if top ≠ other and p[top] ≥ 0.60 → send with that intent's template
                                   show "Otty thinks you want to: Fix this error · Not that?"
else                             → local clarify card (no LLM call): top-3 intents as chips + text box
```

- Tune the 0.60 threshold on the eval set: aim for less than 10% wrong auto-sends, while keeping the clarify rate under about 30%.
- "Not that?" and the clarify chips record the user's choice locally in `intent_feedback` (schema v1): the app, the guess and the probabilities, the choice, the classifier version and the capture's embedding (Float32 bytes). Retraining needs only the embedding, so the capture's text is never kept there, and forgetting the chat forgets its feedback. That gives free labels for retraining. Nothing leaves the Mac.

### Data and training (`tools/intent/`, not shipped)

1. Write 30 hand-made examples per intent, mostly English, plus a few HK Chinese captures to measure how much they matter.
2. Generate about 300 more per intent with an LLM, in varied app contexts, then dedupe and spot-check them.
3. Hold out an **eval set of real captures**: about 40 per intent, mostly English with about 15% HK Chinese, never used in training. Report the two languages separately.
4. Train the head with logistic regression on frozen embeddings, using a Python script. Export `intent-head.json` with labels, weights, bias, the encoder id and a version.
5. Targets: macro-F1 ≥ 0.85, `fix_error` recall ≥ 0.9 (the motivating case), p95 latency ≤ 60 ms on an M1 for 512 tokens.

### Code changes

- `src/shared/types.ts`: `Intent` union; `PanelOpenPayload.intent?: { top: Intent; probs: Record<Intent, number> }`; `ChatMessage` user gets `intent?: Intent`.
- `src/main/intent/`: `classifier.ts` (spawns the worker, `classify(text, app)` with a 300 ms timeout and a fallback to null), `worker.ts`, `head.ts` (softmax over JSON weights), and `labels.ts`.
- `src/main/index.ts`: run `classify` in parallel with `frontmostApp()` after the capture, then attach it to the payload.
- `src/main/prompts.ts`: `intentPrompt(intent, language)`. These are hidden instructions appended to the user turn; the visible question stays e.g. "Fix this error".
- `Quick.tsx` / `Panel.tsx`: the ↵ path follows the decision rule; a clarify card component; quick-action chips sorted by `probs`.
- `docs/REQUIREMENTS.md`: a new FR for intents.

**Done when:** the eval targets above are met; ↵ on a highlighted Terminal error gives fix steps with no prompt; ↵ on an ambiguous selection shows the clarify card; the packaged `.dmg` works offline.

**Risks:** bundle size if the multilingual encoder is needed (about +120 MB); OCR quality on low-contrast snips; a synthetic-data gap, which the real eval set and on-device feedback mitigate.

---

## Smoke-test checklist

Run on a Mac before every release. Keep it current: each shipped item adds its checks here.

1. `npm install && npm run dev`. The otter appears in the bottom-right corner, and Otty appears in the menu bar.
2. First run: onboarding shows. Paste the key → **Test** → the result names the model. With a text-only model it warns that snips won't work.
3. Grant Accessibility and Screen Recording to your terminal app, then restart `npm run dev`.
4. Highlight text in Safari → press **⌥Space** → the quick view opens at the cursor with a text chip and an "In Safari · page title" tag. Press ↵ → the answer streams in.
5. Check that the clipboard still holds what you copied before (paste somewhere).
6. Click the otter with text highlighted → same flow, in the panel next to the otter.
7. **⌥⇧Space** → draw a box over a chart → ask "what is this?" → the answer describes the image.
8. Click a dotted term → the explainer card appears → **Ask more** sends a follow-up.
9. "Remind me to call mum at 5pm" → the confirm card appears → Allow → the reminder shows in the Reminders app. The tool chip shows a clock icon, not an emoji.
10. "Find me the Wikipedia page for otters and open it" → a search chip appears, then the open_url confirm.
11. Wrong key → a friendly error appears. Wi-Fi off → a friendly error appears.
12. Drag the otter, quit, relaunch → the position is remembered.
13. Toggle dark mode → everything stays legible.
14. In Safari, press **⌥Space** → the tag shows the page. The first time, macOS asks to let Otty control Safari. Ask "what is this site?" → the answer uses the page.
15. Ask in the full panel, then press **⌥Space** and ask something new → open **Recent chats** → the earlier chat is there. Open it and ask a follow-up → it remembers.
16. Quit and relaunch → Recent chats still lists them, and a snip shows as "Screen snip (not saved)".
17. Settings → Privacy → turn off "Remember my chats" → Save → the list is empty and the clock button is gone.
18. Ask from the quick view, then click elsewhere before the answer finishes → a straw-coloured dot appears on the otter. Click the otter → the panel shows the answer and the dot clears.
19. Settings → My other language → **English only** → Save → no EN / 中 pill, no "In 中文" button, no 中文 tiles or explain-card toggle. Answers are English even when you type Chinese.
20. Pick **繁體中文（香港）** → Save. Highlight English text → ↵ with an empty box → an English answer. Type 「這是什麼意思？」 → a Chinese answer in Traditional characters.
21. Press **中** on the pill and type a question **in English** → a Chinese answer. The next message is back on Auto (English).
22. On the latest English answer press **In 中文** → the same answer in Chinese. Reopen the chat from Recent chats → the button still works.
23. Ask "How do I save this as a PDF?" in Chinese → 「File」「Print」 stay in English with translations, and it says 打印, not 列印.
24. Highlight a single English word → ↵ → "What does it mean?" with a 中文 line. Open an explain term → the card shows the 中文 line; its EN / 中文 toggle switches the explanation.
25. Put the cursor near the bottom of the screen, highlight text → **⌥Space** → ask for a long answer, then open an explain term → its card stays open with an explanation, and the **esc close** and **↵ continue in chat** row stays visible, and the answer scrolls. Then press **Esc**, close the quick view, highlight a longer passage elsewhere → **⌥Space** → the whole card shows, with the box and the esc / ↵ row, not cut off inside a smaller dark box.
26. With a few saved chats, press **⇧⌘F** in the panel (or ⌘F on an empty chat) → Recent chats opens with the search box focused. Type a word from an answer → matching chats show a snippet with the word highlighted.
27. Search 「打印」 or another two-character Chinese term → the right chat. Search "platypus" → "No chats mention “platypus”". Esc clears the search; Esc again closes the panel.
28. Click a search result → the chat opens scrolled to the matching message, which glows briefly. Ask a follow-up → the view follows the new answer.
29. Panel → paperclip → pick a PDF, a `.docx` and a photo → three chips say "Reading…", then show pages / Word document / a thumbnail. Press ↵ with an empty box → **Summarize** runs, and the answer cites pages like "(page 2)".
30. Drag a PDF from Finder onto the panel → the "Drop files" veil shows, then a chip. Copy a file in Finder and paste into the box → a chip.
31. Attach a 300-page PDF and ask about it → the sent message says "Otty read the first … of 300 pages". Attach a scanned PDF, a `.numbers` file and a 30 MB file → each chip explains, kindly, why not. Attach 6 files → a chip says Otty takes up to 5.
32. Reopen that chat from Recent chats → the file chips are there (no thumbnails), and a follow-up about the file still works. Search the file's name → the chat is found.
33. While a big PDF is being read, drag the otter and type → nothing freezes.
34. In a long chat press **⌘F** (or the search button in the header) → a find bar opens above the chat. Type a word from an earlier answer → every match is highlighted and the bar says "1 of N"; the view scrolls to the current one.
35. Press ↵ and ⇧↵ → the current match moves and wraps around. Search a Chinese term such as 「計劃」, including one that is an explain term → it is found. Type nonsense → "No matches".
36. With the bar open, ask a follow-up → the view stays on the current match while the answer streams in, and new matches are counted. Esc closes the bar and clears the highlights; Esc again closes the panel.
37. Watch the otter in the bubble and the panel header for 10 seconds → it blinks every ~5 s with no flicker or jump around the face. Ask something → it bobs with bubbles while thinking, then shows its eyes-closed smile. On a dark background its edges have no white fringe.
38. Open the panel. Highlight text in Safari → **⌥Space** → it's added to the panel's tray with "In Safari", and the panel doesn't move. Snip part of a Terminal window with **⌥⇧Space** → a second item, "In Terminal". The tiles are now **Compare these**, **Summarize all**, **Explain each**.
39. Press ↵ with an empty box → the sent message shows both captures with their app tags, and the answer talks about both. Reopen the chat from Recent chats → both are there (the snip as "Screen snip (not saved)"). Search a word from the Safari text → the chat is found.
40. Add four captures, then a fifth → "Otty can look at 4 things at once"; remove one with its ✕ → the note goes away. Highlight the same text twice → only one copy.
41. Highlight text → **⌥Space** → in the quick view press **＋ add more** → click into another app (it stays open), highlight → **⌥Space** → the capture is added without the card moving or taking focus. ↵ → Compare runs. Click elsewhere → it closes.
42. Open the quick view, then switch to another desktop (Ctrl→) → it's still there, unfocused. Highlight something there → **⌥Space** → added. Click **esc close** → it closes. A chat saved by 0.3.2 still opens.
43. Upgrade from 0.3.2: with a few chats saved by 0.3.2, start this build → Recent chats shows them straight away (no empty flash), `chats.json` is gone and `otty.db` is in `~/Library/Application Support/Otty`. Search an English word and 「打印」 → the right chats. Settings → Privacy → **Forget all chats** → the list is empty.
44. Ask a long question and, while the answer streams, force-quit Otty (`kill -9` its process). Relaunch → the chat is in Recent chats with the question, and a follow-up works.
45. Settings → Privacy → **Keep chats for** shows **1 year**. Pick **30 days** → Save → chats older than 30 days are gone, and Recent chats says "Otty keeps chats for 30 days on this Mac".
46. Ask "What's new in macOS this month?" → a "Looking up …" chip, and an answer citing dated sources as links that open in the browser.
47. In Safari on a public article, press **⌥Space** with nothing highlighted → type "Summarize this page" → a "Reading <site>" chip and a summary of that page. On a signed-in page (e.g. your webmail) → Otty says it can't read it and suggests highlighting instead. Ask in 中文 about a Hong Kong topic → Chinese sources.
48. Settings → set the base URL to another provider → search still answers (Wikipedia), and asking to read a page doesn't offer to. Settings → Privacy shows the DeepSeek line.
49. Snip a page with a very long window title, then send it → the app tag above the snip ends in "…" and stays inside the chat, in the panel and the quick view.
50. Ask "Read https://example.com" → Otty reads it with no card. Search for something and ask it to read a result → no card. Ask it to read an address nobody gave it → a "Read this page?" card shows the full address, and **No** sends nothing.
51. In a built app, ask Otty to reply with exactly `![test](https://example.com/p.png)` → the word "test" appears, and no picture loads. Snips, file thumbnails, icons and painted Otty still show.
52. Snip a table with Otty and ask "copy this table to my clipboard exactly as it is" → a "Copied to your clipboard" chip. Paste into Word → a real table with borders and a shaded header row, with every cell in place, empty cells included. Try one with Chinese text.
53. Paste the same copy into Pages, Mail, Numbers and Excel → a table in the first two, and separate cells in the spreadsheets. Paste into TextEdit in plain-text mode or Terminal → tab-separated rows with no `|` marks.
54. Ask a question that gets a table in the answer, with words around it → press **Copy** under the answer → Word shows the words and a real table. Copy an answer with no table → it pastes exactly as before.
55. In `npm run dev` with DeepSeek, send a question, then a follow-up in the same chat → the terminal's `[cache]` line shows most of the follow-up's tokens as hits. Ask "what time is it?" → the right time, and no answer mentions the note. With 中 picked, ask in English → the reply is in Chinese with Hong Kong wording. Then switch to English → the reply is in English. The chat shows only your own words.
56. Snip something with text → press **Pick up text** beside the picture in the quick view → a window opens by the cursor with the picture at about its real size. "Reading the words…" shows, then "Drag across the words". The first read after installing can take up to a minute. Repeat from the panel's tray and from a picture in a sent message.
57. Drag across some words → they highlight exactly where they are in the picture. Press ⌘C and paste into Notes → the same words. Press ⌘A then ⌘C, and try **Copy all**. Snip a table, drag across a row, and paste into Word → real table cells. Try Chinese and English together.
58. With the window open, switch to another app, paste, and come back → it's still there on top. Press Esc → it closes, and the app you were in has focus. Snip something with no words → "Otty couldn't find any words in this picture". Turn the Wi-Fi off → it still works.
> **Status (2026-11-06):** steps 55–58 passed on 0.5.0. Steps 59–61 are **yet to be tested**, because they need other services. Steps 62–66 have no result yet.

59. Settings → pick **Claude** → paste a key → **Save**: the test names the model. Ask something that needs a tool → the chip and answer work. Ask a follow-up, then reopen the chat from Recent chats and ask another.
60. On Claude, ask "What's new in macOS this month?" → a "Searching the web" chip, then an answer citing sources. Ask it to read one of those sources → no card. Ask it to read an address nobody gave it → a "Read this page?" card.
61. On OpenAI or a custom address, ask Otty to read a public page → a "Reading <site>" chip and a summary. Ask it to read `http://192.168.1.1` → it says it can only read public pages. Switch services mid-chat → the conversation carries on, and switching back keeps each key.
62. In Safari on a public article, open the panel with nothing highlighted → a **Summarize this page** tile. Tap it → a "Reading <site>" chip and a summary, with no card. Remove the app tag → the tile goes. In the quick view, press ⌥Space with nothing highlighted, then ↵ → the same summary. On a YouTube video page, or with a model on this Mac → no offer. On a page that needs a sign-in → a friendly "can't read it".
63. Ask something with a dotted term, wait 3 seconds, tap it → the card opens straight away. Turn on **Think deeper** → cards still work. Turn Wi-Fi off, tap a new term, then back on and tap again → the second tap works.
64. Highlight a long paragraph → ⌥Space → ↵ → Recent chats shows a short real title, not the cut-off text. Search a word from the title → the chat is found. Ask a question in 中文 → a Chinese title.
65. Highlight a draft with mistakes in Mail → ⌥Space → **check writing** → the marked-up card, with a reason for each fix. **Copy fixed text** → paste → no marks. Press **In 中文** → the reasons change and the fixed text doesn't. Check a correct paragraph → it says it reads well. Reopen the chat → the same card. Toggle dark mode → the changes stay legible.
66. Press **⌘⌥⇧Space** → Otty blinks out for a moment, then a picture labelled **Whole screen** of the display under the cursor, without the floating otter or any Otty window in it, readable when opened. Ask about it → the answer treats it as the whole screen. With the panel open, it's added to the tray. On a second display, it snaps that one. With Screen Recording off → the friendly notice. Settings shows the third shortcut, and setting one another app uses shows "Another app is using this shortcut" after saving.
67. Say "I'm learning Spanish for a trip" → the answer shows *Noted: Is learning Spanish* with **Undo** and **Edit**, and no card. In a new chat, "how do I say thank you?" leans Spanish without being told. Press **Undo** → it says Undone, and the next new chat doesn't know it. Reopen the chat → the line is still there, still Undone.
68. Mention a health detail in passing ("I have diabetes, what can I eat?") → nothing is noted. Say "remember I'm diabetic" → it's noted. Say "remember my wifi password is otter123" → Otty kindly says it doesn't keep those, and nothing is noted.
69. Highlight an email from someone else → **Summarize** → nothing is noted. Say "forget that I'm learning Spanish" → *Forgotten*, with an Undo.
70. Press the brain button in the panel's header (or **don't learn** in the quick view), then say "remember I have a dog" → nothing is noted, and Otty doesn't claim it was. Reopen the chat → still off.
71. Settings → **What Otty knows about you** → edit one, and the next answer uses the new words. Pause one → it stops being used. Add "I'm a nurse", then "my password is x" → the second is turned down. **From a chat on…** opens that chat. **Forget everything Otty knows** asks once, then the list is empty. Turn **Let Otty learn about me** off → no Noted lines, and answers stop using the list.
72. Over a few days of use, mostly in one app → *Noted: Mostly works in Excel*. Delete it → it doesn't come back.
73. Type `17.5% of 2,340` and press ↵ → **409.5** at once, with Wi-Fi off too, and **Copy** and **Explain the working**. Explain → the model explains it. Try `38°C to °F`, `10 km to miles` and `what is 2 + 2?`. `macOS 15.1`, `12/25/2026` and `1 in 3` go to the model.
74. Ask "What's 17.5% of 2,340 plus 8% tax?" → one "Calculated … = …" chip with no flicker, and the right total. Tap the chip → it copies. Ask "Solve 3x + 7 = 25" → a short pause while it thinks, then rendered steps (a real fraction bar, not `\frac`) and a check line. Ask "What's the capital of France?" → no extra pause.
75. Ask "I earn $3,200 a month and spend $1,150 on rent, what share is that?" → the dollar amounts stay plain text, and the answer is about 35.9%. Ask 「3,000 蚊打八折係幾多？」 → 2,400 with Chinese working. Toggle dark mode → equations stay legible. Copy an answer → the pasted text has `$$…$$`.
76. In a dev build, ask a follow-up in a long chat with memories → the `[cache]` line covers the history, on the follow-up and on the round after a tool call. Check that in a built app (not `npm run dev`) equations render, which confirms the fonts get past the page's CSP.
