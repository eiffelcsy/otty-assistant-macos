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
│ llm.ts         ChatSession: tool loop, background work │
│ providers/     one adapter per API format, profiles    │
│ store/         ChatStore on SQLite (otty.db): chats,   │
│                search, retention; schema in db.ts      │
│ files/         attachments; fileWorker.js reads docs   │
│ tools.ts       search_web, read_page, open_url, …      │
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
| D-10 | Otty learns about you: memory that saves itself, in the open, with Undo (#17) | ⏳ | — (schema, `database()` and the per-turn note are in) | M (2–3 days) |
| D-12 | Math that's right, and instant: local instant answers, one-request batched `calculate`, tiered thinking, rendered equations | ⏳ | — | M (1–2 days) |
| D-14 | Otty's own snip: a cute paw cursor on a frozen screen, instant crop, and a whole-screen shortcut (⌘⌥⇧Space) | ⏳ | — | M (2 days) |
| D-11 | Do it with me: step cards that paste, open, click menus and press shortcuts; quick-view follow-ups | ⏳ | — | M (2–3 days) |
| D-1 | Context-aware intents (local encoder classifier) | ⏳ later | its step 0, OCR helper (`intent_feedback`, with embeddings, is in schema v1) | L (4–6 days) |

**Where things stand (2026-11-05).** `main` is 0.5.0, waiting for its smoke test and tag; see CHANGELOG. It has any model (D-20), Pick up text (D-21), a stable prompt (D-12 step 0), Read this page (D-15), the idle budget (D-16), warm explain cards (D-18), chat titles (D-19) and the proofread card (D-17). None of that has run against a real Claude, OpenAI or local model yet. 0.4.0 is smoke-tested, with its draft release waiting to be published. `main` requires a PR with a green `ci` check, and branches must be up to date before merging.

**Build order**
1. **Publish 0.4.0, then smoke-test steps 55–65 on a Mac, fix what they find, and release 0.5.0** by pushing a `v0.5.0` tag on the bump commit (the `dmg` workflow attaches the `.dmg` to a draft release). Start with a first real chat on Claude.
2. **D-10 memory.** The biggest step towards Otty feeling like *your* otter: it learns on its own and shows what it learned.
3. **The rest of D-12 math.** It fixes something people notice straight away: wrong sums and raw `\frac` in answers.
4. **D-14 Otty's own snip.** The snip is the moment Otty is most visible, and today it's the plain macOS crosshair. Freezing the screen also makes snips instant, catches menus that would vanish, and lets Pick up text open over the original spot.
5. **D-11 step cards.** Answers become checklists that paste, open, click menus and press shortcuts for you, in any app: the safe first stage of "Show me how". The proofread card gains **Replace in Pages** here.
6. Then **D-1**, starting with its step 0, which may shrink it. It has the most moving parts (model, eval set). The OCR helper is already built. Signing and notarization (BRAINSTORM, "Trust") should land before builds go to other people; the `dmg` workflow can then sign with secrets.

---

## D-10 · Otty learns about you: memory that just works, in the open (#17) ⏳

**Goal.** Otty gets to know the user the way a good assistant does, without being asked: their apps, their languages, the projects they keep coming back to, how they like answers. It uses that knowledge on its own, so answers feel written for *them* (examples from their apps, Spanish in mind, short answers without being told again). That's what separates Otty from a generic chatbot.

**Principle: trust from visibility and control, not from asking first.** A confirm card for every memory would make learning a chore, and people would say no out of habit. So Otty saves memories on its own and **always shows what it saved**, with **Undo** one click away. Nothing is hidden, everything can be edited, and some things are off limits.

### How Otty learns
1. **Told.** "Remember that my manager is Sam", or "I'm a nurse" said in passing. The model calls `remember({ text, kind })` and the memory is saved at once (`origin: 'told'`, confidence 1).
2. **Inferred from conversation.** When a turn reveals something lasting about the user ("I need this for my Spanish class" → *is learning Spanish*), the model calls `remember` with `origin: 'inferred'` and a confidence. The prompt allows at most two per answer, only for things likely to matter in a month.
3. **Observed on the Mac, no model needed.** Main counts what the user already sends: apps in the app note, answer languages, which quick actions they pick, the "In 中文" button, how often they ask for shorter answers. Past a threshold it writes or refreshes a `habit` memory (`origin: 'observed'`): "Mostly works in Excel and Safari", "Often wants answers in 中文", "Prefers short answers". Counts are kept per day in the `counters` table (kind, key, day, count: never content), so a habit builds over a week of use and across restarts, and old days can be ignored.
4. **Tidying.** When a new memory overlaps an old one, `remember` takes `replaces: id`, and the old one is updated in place ("now uses Numbers instead of Excel"). Without that, near-duplicates are found with `memories_fts` (trigram overlap) and merged.

### What the user sees
- **Under the answer**, a quiet line: *Noted: you're learning Spanish* · **Undo** · **Edit** (UIcon `bookmark`). Undo deletes it. Edit opens it in Settings. The line stays in the saved chat, so the source is never a mystery.
- **On the otter**, observed habits appear as a speech-bubble micro-reply now and then ("I noticed you're in Excel a lot. I'll use its menus in examples."). This shares the "speech-bubble micro-replies" idea in BRAINSTORM.
- **Settings → What Otty knows about you**: grouped by kind, each with its source ("From a chat on 3 Nov", which opens the chat, or "Noticed from how you use Otty"), and inline edit, pause and delete. **Add something**. **Forget everything Otty knows** (deleted and overwritten on disk, like forgotten chats).
- **"Forget that…"** in chat calls `forget({ id })`, which deletes it straight away with an Undo line. Removing is always safe, so it never asks.
- **"Don't learn from this chat"** in the panel's header (and the quick view's ⋯): this chat neither adds memories nor counts towards habits (`chats.learn = 0`). Memories are still used in the answers.
- A master switch, "Let Otty learn about me" (on by default). Off: nothing is learned or sent, and the list is kept for when it's turned back on.

### What Otty never learns
- **Sensitive things are only remembered when the user explicitly says "remember"**, never inferred or observed: health, money and debts, religion, politics, sexuality, exact addresses, ID numbers. Passwords, keys and codes are never stored, even when asked. Otty says so kindly instead.
- **The screen isn't the user.** Captures, files and web pages are other people's words: an email from Sam doesn't teach Otty about Sam. Only what the user says about themself, plus their own observed habits, becomes a memory. The prompt says this, and `remember` rejects text that only appears inside a capture or file of that turn (a substring check in main).
- Everything stays in `otty.db` on the Mac. Memories reach the model only as the prompt block below.

### How memories are used
- Each turn, `MemoryStore.forPrompt(question, app)` builds a "What you know about the user" block of up to about 1,500 characters. It goes in that turn's note at the end of the user message (and stays there), not in the system prompt, because it changes per question and would otherwise stop DeepSeek caching the history (see D-12 step 0). The order: everything told or set in Settings, then habits and inferences that match the question or the current app (`memories_fts`, app name), then the most used. Inferences under confidence 0.6 are only sent when they match.
- The prompt asks Otty to *use* memories quietly (pick examples from their apps, answer in their language, keep it short if they like short), never to recite them, and at most one light reference when it helps ("Since you're learning Spanish…").
- `use_count` and `last_used_at` are updated for memories that were sent.

### Build
- Schema (all in v1, so D-10 needs no migration): `memories` with `origin` (`told` / `inferred` / `observed` / `settings`), `status` (`active` / `paused` / `pending`), `confidence`, `kind` (`about` / `preference` / `habit` / `person` / `goal`) and `expires_at` for short-lived facts ("travelling to Japan next week": `remember` takes an optional `until`, and expired memories are deleted with the retention pass); `memories_fts`; `chats.learn`; `counters` for habits. Allowed values are checked in TypeScript, not with CHECK constraints, so adding one never needs a table rebuild.
- `src/main/memory/`: `MemoryStore` (`list`, `add`, `update`, `remove`, `clear`, `forPrompt`, `findSimilar`), `observe.ts` (habit counters and thresholds), `guard.ts` (sensitive-category and "came from a capture" checks, unit-tested).
- `tools.ts`: `remember` and `forget`, both without confirm cards. A new `ChatEvent` `{ type: 'memory', id, memoryId, text, action: 'added' | 'updated' | 'forgotten' }` renders the Noted line; the assistant message keeps `memories?: { id, text, action }[]` so it survives reopening.
- IPC `memory:list/add/update/remove/clear/optout`; `PublicSettings.learn: boolean`; `tools/ui-preview` `scene=memory`.

**Done when:** "I'm learning Spanish for a trip" shows *Noted* without a card, and a later "how do I say thank you?" leans Spanish without being told; Undo removes it; after a week of mostly Excel, Settings shows an Excel habit and answers name Excel's menus; a health detail mentioned in passing is not noted, but "remember I'm diabetic" is; a pasted email from someone else teaches nothing; "Don't learn from this chat" learns nothing; Settings edits change the next answer.

---

## D-12 · Math that's right, and instant: calculator, tiered thinking, rendered equations ⏳

**Goal.** Otty gets numbers right, shows math the way a textbook does, and is **never slower for it**. Today it slips, for three fixable reasons:
1. **Thinking is off by default** (`settings.thinking: false`), so multi-step problems get one pass.
2. **There's no calculator**, so numbers come from the model's memory.
3. **Math notation shows raw.** `Markdown.tsx` only has `remark-gfm`.

**The latency rule.** Running the math takes microseconds. What costs time is everything around it:
- each tool call is **another model request**: the stream pauses, the result goes back, and the model needs time before its next word (0.5–2 s);
- thinking adds seconds before the first word;
- a cold mathjs load adds about 100 ms.

So the design aims for **zero extra requests where possible, at most one otherwise, and cache hits on that one**.

### Latency budget (targets, measured on an M1)
| Path | Target |
| --- | --- |
| Instant answer (the whole question is a calculation) | ↵ → result on screen ≤ 50 ms, no model call |
| `calculate` execution, p95 | ≤ 2 ms, whatever the expression |
| Calculations inside an answer | at most **one** extra model request per answer, with the history cached |
| Non-math questions | no slower than today: no thinking, no added work beyond a check of under a millisecond |
| mathjs ready | warmed at startup in idle time, so the first math question never waits for it |

### 1. Three tiers, decided locally in under a millisecond
`mathTier(text, captures)` in `src/shared/math.ts` (next to `script.ts`) returns one of four values:

| Tier | Example | What happens | Extra latency |
| --- | --- | --- | --- |
| `expression` | `2340*1.175`, `17.5% of 2,340`, `38°C to °F`, `sqrt(2)`, `mean(3, 7, 9)` | **Instant answer:** computed locally and shown at once as a result card (`= 2,749.5`) with **Copy** and **Explain the working**. No model call | none (≤ 50 ms) |
| `calculation` | "what's 17.5% of 2,340 plus 8% tax?", "split $86.40 between 3" | Model with `calculate`, **thinking off**. The calculator gives the accuracy, and these don't need reasoning | one request, cached |
| `problem` | "solve 3x + 7 = 25", "a train leaves at…", a homework snip with typed math words, 「解方程」 | Model with `calculate`, **thinking on** for this turn only | thinking plus one request, cached |
| `none` | everything else | as today | none |

- **`expression`** means the whole typed question parses as an allowlisted mathjs expression after normalising (below), with nothing left over but number words like "of", "to", "in" and units. Anything else falls through to the model.
- **`problem`** means equations with unknowns, solve / prove / word-problem cues, or a snip with typed math words. **`calculation`** is the other math cues: numbers with operators, %, money splits, how much / how many / average, and 計 / 算 / 幾多 / 百分之 / 打…折.
- The instant result card is local, so it also works offline and costs nothing. **Explain the working** sends the question to the model as a `problem` turn.
- It's saved in the chat like any answer: an assistant message with `calc: { expression, result }`, rendered as the card. Search finds it.
- Settings "Think deeper" becomes "always think", overriding the tiers.

### 2. The `calculate` tool, built for one request
- **Batch, with names:** `calculate({ steps: string[] })` evaluates the steps in order in one shared scope:
  ```
  ["base = 2340 * 17.5%", "tax = base * 8%", "total = base + tax"]
  ```
  It returns every named result in one go. The prompt says to plan all the numbers first, then call `calculate` once. Several calls in one model message (parallel tool calls) are also run together.
- **Exact decimals:** mathjs configured with `number: 'BigNumber'`, `precision: 34`, so `0.1 + 0.2 = 0.3` and money sums are exact without display tricks. Results are formatted to 14 significant digits, with thousands separators in the display text only.
- **Forgiving input, so a retry is rare** (a retry costs a whole request):
  - NFKC normalisation (full-width digits);
  - `×` and `·` → `*`, `÷` → `/`, `−` → `-`, `²` → `^2`;
  - `%` and "x% of y";
  - `°C`, `°F`, `km/h` and similar → mathjs unit names;
  - thousands separators accepted when unambiguous (`2,340` with exactly 3 digits after the comma and no function call around it).
  
  Errors are one line with the fix ("unknown unit 'kms', did you mean 'km'?").
- **Safety without a second process:**
  - The expression is parsed to an AST and walked against an **allowlist** of node types and functions: arithmetic, `sqrt`, `round`, `abs`, `log`, trig, `min` / `max` / `mean` / `median` / `std` / `sum`, `to` / `in` units, assignments.
  - Arrays are capped at 1,000 items, the length at 500 characters, and big factorials and powers are capped.
  - `import`, `createUnit`, `evaluate`, `parse`, `range`, matrices beyond the cap and every function not on the allowlist are rejected before evaluation.
  
  So evaluation is bounded and synchronous, and there's **no utility-process round trip**. A worker would add more latency than it could ever save.
- **Lean and warm:**
  - `src/main/math.ts` builds the mathjs instance from only the factories the allowlist needs (`create({ …dependencies })`), not `all`, which cuts load and init time.
  - It's created in `setImmediate` after the windows open, beside the database.
  - Target: init ≤ 30 ms off the critical path; evaluate ≤ 2 ms p95.
- **UI with no flicker:** the chip appears already done ("Calculated 2,340 × 17.5% = 409.5"), with no "running" state, since it's faster than a frame. Tap it to copy the result. The text written before the call stays on screen, and the stream picks up again after a single cached request.

### 3. Render math
- `remark-math` and `rehype-katex` in `Markdown.tsx`: panel, quick view, explain cards.
- **Only `$$…$$` counts as math** (`singleDollarTextMath: false`), so "$5 and $10" stays text. `$$…$$` inside a sentence is inline; on its own line it's a block.
- KaTeX's CSS and fonts come from the bundle, not a CDN: the built pages' CSP allows nothing else.
- `throwOnError: false`, so bad TeX shows as source text. KaTeX inherits `color`, so dark mode works with no new tokens.
- **Load cost:**
  - KaTeX and its CSS are imported once with the renderer bundle (the windows are created at startup, so they're already loaded when an answer arrives).
  - Rendering only runs on messages that contain `$$`; a quick check skips the plugin otherwise, so streaming non-math answers costs nothing extra.
  - While a math answer streams, an unclosed `$$` renders as text until it closes, so the layout doesn't jump.
- Find-in-chat (D-7) searches rendered text, so TeX source inside KaTeX won't match; acceptable. Copy keeps `$$…$$`.

### 4. Prompt rules (`prompts.ts`, in the static system prompt)
- Plan every number first, then **one** `calculate` call with all the steps. Never do arithmetic from memory, even "easy" sums.
- Homework and "how do I solve": numbered steps, then the answer in bold with units, then a check line (put the answer back in, or estimate the size).
- Round for the question (money to 2 places, people to whole numbers), then say what it means in plain words.
- Write math as `$$…$$`; prices stay "$5".

### Tests and measurement
- `math.test.ts` (no Electron):
  - exact decimals, percentages, units, statistics;
  - the batch scope;
  - normalising `×`, `÷`, `−`, `²`, full-width digits and `2,340`;
  - the allowlist rejecting `import`, `evaluate`, `range(1,1e9)`, `factorial(1e6)` and long input;
  - **a timing test**: 1,000 mixed expressions with p95 ≤ 2 ms.
- `mathTier`: about 60 labelled examples in English and 中文 across the four tiers, including prices in prose, dates, phone numbers and "macOS 15.1" as `none`.
- **A latency eval** (`tools/math-eval/`, not shipped):
  - 40 real-style questions run against the API, recording correctness, time to first token, total time, tool rounds and cache-hit tokens;
  - compared before D-12, D-12 with thinking on every math turn, and D-12 tiered;
  - the tier thresholds are tuned on this.
  - Target: **≥ 95% correct, and `calculation`-tier answers no slower to start than today's.**
- `tools/ui-preview` `scene=math`: an instant result card, inline and block math, light and dark.

### Done when
- Typing `17.5% of 2,340` shows **409.5** instantly with no model call; **Explain the working** then explains it.
- "What's 17.5% of 2,340 plus 8% tax?" shows one Calculated chip and the right total, with the second request reading its history from the cache (dev log).
- "Solve 3x + 7 = 25" thinks, then shows rendered steps and a check.
- "What's the capital of France?" starts as fast as before.
- "$3,200 a month, $1,150 rent, what share?" keeps the dollars as text and answers 35.9%.
- 「3,000 蚊打八折係幾多？」 gets 2,400 with Chinese working.
- Follow-up turns in any chat show cache hits in the dev log.

### Smoke test (add to the checklist when it ships)
- Type `17.5% of 2,340` and press ↵ → **409.5** appears at once (no "thinking", works with Wi-Fi off), with **Copy** and **Explain the working**. Explain → the model explains it.
- Ask "What's 17.5% of 2,340 plus 8% tax?" → one "Calculated … = …" chip, no flicker, and the right total, with the answer starting about as fast as a normal question. Ask "Solve 3x + 7 = 25" → a short pause while it thinks, then rendered steps (a real fraction bar, not `\frac`) and a check line. Ask "What's the capital of France?" → no extra pause.
- Ask "I earn $3,200 a month and spend $1,150 on rent, what share is that?" → the dollar amounts stay plain text, and the answer is about 35.9%. Ask 「3,000 蚊打八折係幾多？」 → 2,400 with Chinese working. Toggle dark mode → equations stay legible. Copy an answer → the pasted text has `$$…$$`.
- In a dev build, ask a follow-up in a long chat → the log shows `prompt_cache_hit_tokens` covering the history, on the follow-up and on the round after a tool call. Start a new chat → its first request hits the cache for the system prompt and tools. Switch EN / 中 between turns → still hits.

### Later (in BRAINSTORM)
A sandboxed code runner for data in CSVs and tables; recomputing a worked solution's final answer; dates in `calculate`; instant answers also in the quick view's empty state ("type a sum").

---

## D-14 · Otty's own snip: a paw cursor, a frozen screen, and a whole-screen shortcut ⏳

**Goal.** Snipping should feel like Otty, not like a system tool, and be faster too. And the whole screen should be one shortcut away.

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

### The whole-screen shortcut (⌘⌥⇧Space, `Command+Alt+Shift+Space`)
- **No overlay:** it snaps the display under the cursor straight away, with Otty's windows left out. A soft shutter flash (none with reduced motion) and the bubble's happy face confirm it.
- **Where it goes:** like any snip, it follows D-8's tray rules: added to an open panel or a collecting quick view, otherwise a new quick view. Its chip says **Whole screen** and the app note names the frontmost app.
- **Size:** a whole screen is sent at up to 2048 px on the long side, not the usual 1600, so text stays readable, as JPEG q85. Its token cost is noted under FR-4.
- **Privacy:** a whole screen can include notifications and other windows. Nothing is sent until the user asks, the preview sits in the tray with its ✕, and the welcome page and Settings say what "whole screen" captures.
- **Everywhere else:**
  - Settings gets a third shortcut field, "Capture the whole screen". `PublicSettings.screenHotkey` defaults to `Command+Alt+Shift+Space`.
  - It's in the menu-bar menu, the bubble's right-click menu, and the empty chat's how-to list.
  - `prettyKey` shows ⌘⌥⇧Space.
- **When a shortcut is taken** by another app (registration fails), Settings shows "Another app is using this shortcut. Pick a different one.", not just a console warning. That covers all three shortcuts.

### Build
- **Windows** (`windows.ts`):
  - One transparent, frameless overlay window per display, **created hidden at startup** so it appears within a frame of the snapshot being ready.
  - Window level `screen-saver`, so it covers the menu bar and Dock. `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
  - Bounds equal the display's `bounds`, rebuilt on `screen` display-added, display-removed and metrics-changed events.
  - It takes focus while open (for Esc and the arrow keys). The frontmost app is recorded **before** the overlay opens, as today.
- **Snapshot:**
  - **Leaving Otty out:** for the moment of the snapshot, the bubble, panel and quick view get `setContentProtection(true)`, which keeps them out of the capture without hiding them, so there's no flicker. It's turned off right after, so Otty still shows up in the user's own screenshots and screen shares.
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
- **Permissions:** both the snapshot and the whole-screen shortcut need Screen Recording, which snips already need. Without it, the existing "needs-screen" notice.
- **Fallback:** if the overlay can't be shown (a display change mid-snip, for example), fall back to `screencapture -i`, so snipping always works.
- **`tools/ui-preview`:** `?view=snip` with a sample frozen background, to tune the look and cursor in a browser.

### Tests
- Rect maths: normalising a drag in any direction, clamping to the display, points to pixels at scale 1 and 2, a second display at negative coordinates, a click becoming "whole display".
- The size choice (2048 for whole screen, 1600 otherwise) and a JPEG under the size budget.
- Settings: the third shortcut saves, re-registers, and reports a taken shortcut.
- Timing, in a dev log: hotkey → overlay visible, release → chip.

### Done when
- ⌥⇧Space shows Otty's paw on a softly dimmed, frozen screen within a blink. Dragging shows the pinched paw, rounded selection and size pill; releasing adds the snip at once, with no grey macOS box.
- Snipping an open menu keeps the menu in the picture.
- Clicking without dragging snaps that whole display.
- ⌘⌥⇧Space adds a "Whole screen" snip of the display under the cursor, with the floating otter not in it, and the chip readable.
- The paw is easy to see on white, black and a photo.
- With two displays, both work.
- A shortcut taken by another app shows the friendly message.
- Reduced motion turns off the flash and boop.

### Smoke test (add to the checklist when it ships)
- Press **⌥⇧Space** → within a blink, the screen dims and freezes, with Otty's paw as the cursor. Drag → the paw pinches, and a rounded selection with a size pill follows. Release → a tiny snap, and the snip is in the quick view at once, without the floating otter in it. Open a menu in any app first, then ⌥⇧Space → the menu is in the snip.
- ⌥⇧Space, then click without dragging → the whole display is the snip. Esc → cancels quietly. Arrow keys and ↵ → nudge and confirm without the mouse. Check the paw on a white page, a black page and a photo: it's always easy to see.
- Press **⌘⌥⇧Space** → a soft flash, then a "Whole screen" snip of the display under the cursor, readable when opened. With the panel open, it's added to the tray. On a second display, it snaps that one.
- Settings → the third shortcut, "Capture the whole screen", shows ⌘⌥⇧Space. Set a shortcut another app uses → "Another app is using this shortcut". Turn on Reduce motion in macOS → no flash or boop.

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
59. Settings → pick **Claude** → paste a key → **Save**: the test names the model. Ask something that needs a tool → the chip and answer work. Ask a follow-up, then reopen the chat from Recent chats and ask another.
60. On Claude, ask "What's new in macOS this month?" → a "Searching the web" chip, then an answer citing sources. Ask it to read one of those sources → no card. Ask it to read an address nobody gave it → a "Read this page?" card.
61. On OpenAI or a custom address, ask Otty to read a public page → a "Reading <site>" chip and a summary. Ask it to read `http://192.168.1.1` → it says it can only read public pages. Switch services mid-chat → the conversation carries on, and switching back keeps each key.
62. In Safari on a public article, open the panel with nothing highlighted → a **Summarize this page** tile. Tap it → a "Reading <site>" chip and a summary, with no card. Remove the app tag → the tile goes. In the quick view, press ⌥Space with nothing highlighted, then ↵ → the same summary. On a YouTube video page, or with a model on this Mac → no offer. On a page that needs a sign-in → a friendly "can't read it".
63. Ask something with a dotted term, wait 3 seconds, tap it → the card opens straight away. Turn on **Think deeper** → cards still work. Turn Wi-Fi off, tap a new term, then back on and tap again → the second tap works.
64. Highlight a long paragraph → ⌥Space → ↵ → Recent chats shows a short real title, not the cut-off text. Search a word from the title → the chat is found. Ask a question in 中文 → a Chinese title.
65. Highlight a draft with mistakes in Mail → ⌥Space → **check writing** → the marked-up card, with a reason for each fix. **Copy fixed text** → paste → no marks. Press **In 中文** → the reasons change and the fixed text doesn't. Check a correct paragraph → it says it reads well. Reopen the chat → the same card. Toggle dark mode → the changes stay legible.
