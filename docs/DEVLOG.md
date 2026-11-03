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
│ windows.ts     bubble · quick view · panel windows     │
│ capture.ts     selection (⌘C trick), snip, frontmost   │
│ llm.ts         ChatSession: SSE client + tool loop     │
│ store/         ChatStore: chats + search (JSON;        │
│                SQLite otty.db opt-in, D-3)             │
│ files/         attachments; fileWorker.js reads docs   │
│ tools.ts       search_web, read_page, open_url, …      │
│ web.ts         DeepSeek Search & Fetch (D-9)           │
│ settings.ts    JSON + safeStorage API key              │
│ permissions.ts macOS TCC checks                        │
└────────────────▲──────────────┬────────────────────────┘
          invoke │              │ events (chat:event, panel:open, quick:open, bubble:*)
┌────────────────┴──────────────▼────────────────────────┐
│ preload: window.otty (typed, narrow API)               │
└────────────────▲──────────────┬────────────────────────┘
┌────────────────┴──────────────▼────────────────────────┐
│ renderer (React), one bundle, three views              │
│  ?view=bubble → <Bubble/>  otter button + badge        │
│  ?view=quick  → <Quick/>   ask-at-cursor card          │
│  ?view=panel  → <Panel/>   chat, Recent chats, settings│
└────────────────────────────────────────────────────────┘
```

**Key decisions (still true)**
- Main owns the conversation and the API key. Renderers only see `ChatEvent`s.
- Explain terms are `[term](#explain)` and tips are `> 💡` blockquotes (see `Markdown.tsx` and `prompts.ts`).
- The bubble is a non-activating `type: 'panel'` window, so clicking it keeps the other app's selection.
- Pictures never touch disk beyond the moment of encoding.
- A user message carries `captures[]` (each with its app) plus `files`; saved chats are read through `store/upgrade.ts`, so old shapes keep loading.

## Roadmap

| ID | Item | Status | Depends on | Size |
| --- | --- | --- | --- | --- |
| D-8 | Capture tray: several captures in one question, across apps and desktops (#13) | 🧪 on PR #27 | — | M |
| D-9 | Real web search and page reading with DeepSeek Search & Fetch | 🧪 on PR #27 | — | S |
| D-3 | SQLite chat storage: scaffold 🧪 on PR #27; make it the default, incremental writes, retention | ⏳ next | #27 merged | S–M (1 day) |
| D-10 | Otty learns about you: memory that saves itself, in the open, with Undo (#17) | ⏳ | D-3 default on | M (2–3 days) |
| D-11 | Do it with me: step cards that paste, open, click menus and press shortcuts; quick-view follow-ups | ⏳ | — | M (2–3 days) |
| D-1 | Context-aware intents (local encoder classifier) | ⏳ later | D-3 (`intent_feedback` is in schema v1), OCR helper | L (4–6 days) |
| D-4 | CI pipeline: `.dmg` workflow 🧪 on PR #27; branch protection is the owner's repo setting | 🔨 | — | S |

**Where things stand (2026-11-03).** 0.3.2 is on `main`. PR #27 (`feat/capture-tray`) holds D-8, the D-3 scaffold and D-9, with CI green. It hasn't been run on a Mac yet.

**Build order**
1. **Run smoke steps 38–46 on a Mac, fix what they find, merge #27, release 0.4.0.** Then move D-8 and D-9 to CHANGELOG and REQUIREMENTS out of "built".
2. **Finish D-3.** Small, and it unblocks the rest: memories live in `otty.db`, the 50-chat cap goes, and a crash mid-answer stops losing the question.
3. **D-10 memory.** The biggest step towards Otty feeling like *your* otter: it learns on its own and shows what it learned, and the schema is already there.
4. **D-11 step cards.** Answers become checklists that paste, open, click menus and press shortcuts for you, in any app: the safe first stage of "Show me how".
5. Then **D-1**. It has the most moving parts (model, OCR helper, eval set), and its feedback table is ready once D-3 is the default. Signing and notarization (BRAINSTORM, "Trust") should land before builds go to other people; the `.dmg` workflow (D-4) can then sign with secrets.

--- | --- | --- | --- | --- |
| D-1 | Context-aware intents (local encoder classifier) | ⏳ | D-3 (intent column), OCR helper; D-2's quick-action ids (shipped) are its intent ids | L (4–6 days) |
| D-3 | SQLite chat storage (scaffolded, opt-in) | 🔨 | — | M (1–2 days) |
| D-4 | CI pipeline (GitHub Actions) | 🔨 | — | S (half a day) |
| D-8 | Capture tray: several captures in one question, across apps and desktops (#13) | 🧪 | — | M |
| D-9 | Real web search and page reading with DeepSeek Search & Fetch | 🧪 | — | S |

**Suggested build order: D-3 → D-1.** D-5 (search, shipped) added the `ChatStore` interface on today's JSON file, so D-3 is "write a second backend and pass the same tests". D-6 (file attachments v1) has shipped; issue #13's capture tray should fold the file chips and the capture into one list (today a message has one capture plus `files`). D-2 (home language) has shipped, so D-1's `translate` and `define` intents can target the home language already. D-1 still needs somewhere to keep its predictions and corrections (D-3). D-4 (CI) is running; what's left of it is small and independent.

---

## D-9 · Real web search and page reading (DeepSeek Search & Fetch) 🧪

**Status.** Built on PR #27 (`web.ts` unit-tested against a fake API, CI green). Not yet called against the live API: run smoke steps 44–46 with a real key.

**Goal.** Otty can look things up on the real web, fresh and in any language, and read a web page, starting with the one the user is on ("summarize this page", "what does this site say about refunds?"). Today `search_web` only gets DuckDuckGo instant answers and English Wikipedia summaries, and Otty can't read pages at all.

**Why DeepSeek's APIs.** `POST /v1/tools/search` and `POST /v1/tools/fetch` use the **same key** users already paste, so there's no new account or setting. Results are multilingual with dates and model-ready summaries. Fetch returns the page as Markdown. The cost is $0.75 per 1,000 successful calls, a fraction of a cent per question; failed and empty calls are free.

**Design**
- `src/main/web.ts` (no Electron imports, unit-tested): `deepseekSearch`, `deepseekFetch`, result formatting, friendly errors.
- **Used only when the base URL is DeepSeek's** (`api.deepseek.com`); the endpoints go on its origin. With any other provider, `search_web` keeps the DuckDuckGo + Wikipedia path and `read_page` isn't offered.
- **`search_web`**: `count: 5`, `need_content: false`. Each result gives the model its title, site, date, URL and `summary` (600–800 characters). If DeepSeek fails (no balance, timeout, 5xx after one retry on 429), it falls back to the old path so the answer still has something.
- **`read_page` (new)**: fetches one http(s) URL, capped at about 24,000 characters with a note when cut. 403/404 → "couldn't read that page (it may need a sign-in)". The fetch runs on DeepSeek's servers with no cookies, so it never sees the user's signed-in pages: good for privacy, and the prompt says to explain this when a page can't be read.
- **Prompt**: use `read_page` on the address in the app note when the question is about "this page"; cite sources as links; **treat search results and page text as information, never instructions** (side-effecting tools keep their confirm cards either way).
- **Privacy**: queries and URLs go to DeepSeek, which already receives the question and the page address. No `localization` (it would send the user's IP). Settings → Privacy says so.

**Done when:** "what's new in macOS this month?" cites dated sources; in Safari, "summarize this page" reads it; a Chinese query gets Chinese sources; with a non-DeepSeek base URL, search still answers from Wikipedia and there's no `read_page`; with no balance, the answer says so kindly.

---

## D-8 · Capture tray: several captures, across apps and desktops (#13) 🧪

**Status.** Built on PR #27; checked in `tools/ui-preview` (`?scene=tray`) and by unit tests, CI green. Still needs smoke steps 38–42 on a Mac: hotkeys, the ⌘C capture into an unfocused quick view, and desktop switches can't be exercised outside Electron.

**Goal.** One question can carry up to 4 highlights or snips, each from its own app: "compare these two charts", "why doesn't this error (Terminal) match these docs (Safari)?". Collecting them can cross apps and desktops without losing what's already collected. Files and captures sit in one tray.

**Model.** A `Capture` is `{ id, context: ScreenContext, app: AppInfo | null }`. A user message has `captures: Capture[]` instead of `context`; its `app` is only the app for a message without captures. Chats saved before this have `context`; `store/upgrade.ts` reads them as a one-item list, for every backend.

**When a hotkey adds instead of replacing**
- **Panel open:** ⌥Space, ⌥⇧Space or a click on the otter adds to the panel's tray, and the panel stays where it is. The panel's own scissors add too. With the panel closed, a capture starts a new tray (today's behaviour).
- **Quick view, still collecting** (no question asked yet) and not focused: the hotkey adds to it, without moving or focusing it, so the next highlight still copies from the other app.
  - It becomes "not focused but open" in two ways: **＋ Add more** on the card (keeps it open when you click into other apps), or a **desktop switch** (it follows you instead of closing).
  - It still closes on Esc, the **esc close** key, asking and then clicking elsewhere, or a click elsewhere when you haven't pressed ＋ Add more.
- **Limit 4.** A fifth capture shows a friendly note instead. The same text twice is ignored.

**Actions.** One capture: its actions as today. Files only: the file actions. Two or more things (captures plus files, at least one capture): **Compare** (the ↵ default), **Summarise all**, **Explain each**.

**Sending.** One capture keeps today's wording. With several, each is labelled `Capture 2 · from Safari (“Pricing”)`, with text in `"""` blocks and pictures in order, then the question. The system prompt explains the labels. The answer language follows the joined text captures.

**Desktop switches (macOS).** `windows.ts` subscribes to `NSWorkspaceActiveSpaceDidChangeNotification`. On blur the quick view waits a moment and stays if the desktop just changed. It doesn't take focus back, so captures keep copying from the frontmost app.

**Done when:** snip in Terminal, highlight in Safari, ask "why don't these match?" in the panel, and get one answer that uses both, with both app tags on the message; the same works in the quick view with ＋ Add more, and across two desktops; an old chat with one capture still reopens and searches; a fifth capture is refused kindly.

---

## D-10 · Otty learns about you: memory that just works, in the open (#17) ⏳

**Goal.** Otty gets to know the user the way a good assistant does, without being asked: their apps, their languages, the projects they keep coming back to, how they like answers. It uses that knowledge on its own, so answers feel written for *them* (examples from their apps, Spanish in mind, short answers without being told again). That's what separates Otty from a generic chatbot.

**Principle: trust from visibility and control, not from asking first.** A confirm card for every memory would make learning a chore, and people would say no out of habit. So Otty saves memories on its own and **always shows what it saved**, with **Undo** one click away. Nothing is hidden, everything can be edited, and some things are off limits.

### How Otty learns
1. **Told.** "Remember that my manager is Sam", or "I'm a nurse" said in passing. The model calls `remember({ text, kind })` and the memory is saved at once (`origin: 'told'`, confidence 1).
2. **Inferred from conversation.** When a turn reveals something lasting about the user ("I need this for my Spanish class" → *is learning Spanish*), the model calls `remember` with `origin: 'inferred'` and a confidence. The prompt allows at most two per answer, only for things likely to matter in a month.
3. **Observed on the Mac, no model needed.** Main counts what the user already sends: apps in the app note, answer languages, which quick actions they pick, the "In 中文" button, how often they ask for shorter answers. Past a threshold it writes or refreshes a `habit` memory (`origin: 'observed'`): "Mostly works in Excel and Safari", "Often wants answers in 中文", "Prefers short answers". Counts stay in memory; only the resulting sentence is stored.
4. **Tidying.** When a new memory overlaps an old one, `remember` takes `replaces: id`, and the old one is updated in place ("now uses Numbers instead of Excel"). Without that, near-duplicates are found with `memories_fts` (trigram overlap) and merged.

### What the user sees
- **Under the answer**, a quiet line: *Noted: you're learning Spanish* · **Undo** · **Edit** (UIcon `bookmark`). Undo deletes it. Edit opens it in Settings. The line stays in the saved chat, so the source is never a mystery.
- **On the otter**, observed habits appear as a speech-bubble micro-reply now and then ("I noticed you're in Excel a lot. I'll use its menus in examples."). This shares the "speech-bubble micro-replies" idea in BRAINSTORM.
- **Settings → What Otty knows about you**: grouped by kind, each with its source ("From a chat on 3 Nov", which opens the chat, or "Noticed from how you use Otty"), and inline edit, pause and delete. **Add something**. **Forget everything Otty knows** (delete plus `VACUUM`).
- **"Forget that…"** in chat calls `forget({ id })`, which deletes it straight away with an Undo line. Removing is always safe, so it never asks.
- **"Don't learn from this chat"** in the panel's header (and the quick view's ⋯): this chat neither adds memories nor counts towards habits (`memory_optouts`). Memories are still used in the answers.
- A master switch, "Let Otty learn about me" (on by default). Off: nothing is learned or sent, and the list is kept for when it's turned back on.

### What Otty never learns
- **Sensitive things are only remembered when the user explicitly says "remember"**, never inferred or observed: health, money and debts, religion, politics, sexuality, exact addresses, ID numbers. Passwords, keys and codes are never stored, even when asked. Otty says so kindly instead.
- **The screen isn't the user.** Captures, files and web pages are other people's words: an email from Sam doesn't teach Otty about Sam. Only what the user says about themself, plus their own observed habits, becomes a memory. The prompt says this, and `remember` rejects text that only appears inside a capture or file of that turn (a substring check in main).
- Everything stays in `otty.db` on the Mac. Memories reach the model only as the prompt block below.

### How memories are used
- Each turn, `MemoryStore.forPrompt(question, app)` builds a "What you know about the user" block of up to about 1,500 characters. The order: everything told or set in Settings, then habits and inferences that match the question or the current app (`memories_fts`, app name), then the most used. Inferences under confidence 0.6 are only sent when they match.
- The prompt asks Otty to *use* memories quietly (pick examples from their apps, answer in their language, keep it short if they like short), never to recite them, and at most one light reference when it helps ("Since you're learning Spanish…").
- `use_count` and `last_used_at` are updated for memories that were sent.

### Build
- Schema: `memories` (origins `told` / `inferred` / `observed` / `settings`, `confidence`, kinds `about` / `preference` / `habit` / `person` / `goal`) and `memory_optouts` are in schema v1 on PR #27. v1 hasn't shipped, so it was changed in place.
- `src/main/memory/`: `MemoryStore` (`list`, `add`, `update`, `remove`, `clear`, `forPrompt`, `findSimilar`), `observe.ts` (habit counters and thresholds), `guard.ts` (sensitive-category and "came from a capture" checks, unit-tested).
- `tools.ts`: `remember` and `forget`, both without confirm cards. A new `ChatEvent` `{ type: 'memory', id, memoryId, text, action: 'added' | 'updated' | 'forgotten' }` renders the Noted line; the assistant message keeps `memories?: { id, text, action }[]` so it survives reopening.
- IPC `memory:list/add/update/remove/clear/optout`; `PublicSettings.learn: boolean`; `tools/ui-preview` `scene=memory`.

**Done when:** "I'm learning Spanish for a trip" shows *Noted* without a card, and a later "how do I say thank you?" leans Spanish without being told; Undo removes it; after a week of mostly Excel, Settings shows an Excel habit and answers name Excel's menus; a health detail mentioned in passing is not noted, but "remember I'm diabetic" is; a pasted email from someone else teaches nothing; "Don't learn from this chat" learns nothing; Settings edits change the next answer.

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
- **Screenshots need text first.** Add a small Swift helper, `otty-ocr`, built with `swiftc` and shipped in `extraResources`. It uses Apple Vision `VNRecognizeTextRequest` with `en-US` and `zh-Hant` (Vision has no separate HK model; Traditional characters cover it).
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
- "Not that?" and the clarify chips record the user's choice locally (`intent_feedback` table, D-3). That gives free labels for retraining. Nothing leaves the Mac.

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

## D-3 · SQLite chat storage ⏳ next

**Built (scaffold, on PR #27).**
- `store/db.ts` opens `userData/otty.db` (mode 600, WAL, foreign keys; `node:sqlite`, checked under Electron 45.2.1 / Node 24.22.1, SQLite 3.53.4 with FTS5 trigram). Migrations are keyed on `PRAGMA user_version`.
- `store/sqliteStore.ts` passes the shared search contract and its own tests (pictures never stored, reopen, import order, re-save replaces). SQL narrows candidate chats (FTS5 trigram for 3+ characters, `instr()` for shorter terms) and `searchThreads` ranks them, so both backends answer identically.
- Opt-in with `OTTY_STORE=sqlite`; the first start imports `chats.json` and renames it `chats.json.imported`.
- **Schema v1:**
  - Messages are stored as `ChatMessage` JSON (pictures emptied), with `id` and `role` as columns. Message shapes change (D-8 replaced `context` with `captures`); `store/upgrade.ts` reads old shapes for both backends, so a new field needs no migration.
  - `chat_search` is one FTS row per chat holding `searchableText()`. An external-content index on `messages` keyed by `rowid` was dropped: `VACUUM` can renumber the rowids of a table without an `INTEGER PRIMARY KEY`.
  - `memories` + `memories_fts` (for D-10) and `intent_feedback` (for D-1) are already there. `database()` in `store/index.ts` shares one connection.

**Left to do**
1. **Default on.** After smoke step 43 passes, `useSqlite()` becomes true unless `OTTY_STORE=json`. Keep that escape hatch for one release, then drop the JSON backend from `store/index.ts` (its tests stay as the contract's reference).
2. **Import before first use.** Today the import runs in the background, so a very early `list()` could come back empty. `chatStore()` should hold a ready promise that every call awaits (import is sub-second for 50 chats).
3. **Incremental writes.** `ChatStore` gains `appendMessage(thread, message)` (insert the user message as it's sent, creating the chat row) and `finishTurn(thread)` (upsert the answer, replace `llm_history` and the search row, in one transaction). The JSON store implements both with `save`. `ChatSession.send` calls `appendMessage`; `run`'s `finally` calls `finishTurn`.
4. **Retention.** A "Keep chats" setting in Settings → Privacy: 30 days / 1 year / forever, default 1 year. It replaces the cap of 50, prunes on launch and after each turn, and runs `VACUUM` when it removed anything.

**Done when:** a 0.3.2 `chats.json` imports on first launch with no flash of an empty list; Recent chats, reopen, search (English and 「打印」) and forget all work; killing Otty mid-answer keeps the question; "30 days" removes older chats.

---

## D-4 · CI pipeline (GitHub Actions) 🔨

**Progress.**
- ✅ Stage 1 + 2: `.github/workflows/ci.yml` runs typecheck, `npm test` and build on every PR (about 40 s), with Dependabot (`.github/dependabot.yml`), the lockfile committed, and a README badge.
- ⏳ Make `ci` required on `main`. It has been green since 0.2, but `main` is still unprotected (checked 2026-11-03). This is a repository setting for the owner to change:
  1. On GitHub: the repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**.
  2. Name it `main`, set **Enforcement status** to **Active**.
  3. **Target branches** → **Add target** → **Include default branch**.
  4. Tick **Require a pull request before merging** (approvals can stay at 0 for a solo repo) and **Require status checks to pass**. Under the latter, **Add checks** → type `ci` → pick it (it is listed once it has run in the last week). Tick **Require branches to be up to date before merging** if you want every PR re-tested on top of the latest `main`.
  5. Tick **Block force pushes** (on by default). Leave `dmg` out of the required checks: it only runs when packaging changes.
  6. Optional: under **Bypass list**, add yourself (Repository admin) for emergencies, with **For pull requests only**.
  7. **Create**. Check: a PR's merge button now waits for `ci`.
- 🧪 Stage 3: `.github/workflows/dmg.yml` builds an unsigned arm64 + x64 `.dmg` (about 150 MB each; `npm run build:mac` checked locally on 2026-11-03). It runs:
  - on **Run workflow** in the Actions tab (any branch, once it's on `main`),
  - on a `v*` tag, where it also attaches the `.dmg` to a **draft** GitHub Release,
  - on PRs that change packaging (`electron-builder.yml`, `build/`, `package.json`, the lockfile or the workflow), so a broken `.dmg` shows before merging. PR #27 is its first run.
  The `.dmg` is kept as a run artifact for 14 days. Signing comes with the Developer ID work.

**Goal.** Every PR and every push to `main` is checked automatically, so nothing that fails typecheck or build gets merged. Later, CI also produces a downloadable `.dmg`.

**Stage 1: checks on every PR** (`.github/workflows/ci.yml`)
- Trigger: `pull_request` and `push` to `main`. Cancel superseded runs per branch (`concurrency` with `cancel-in-progress`).
- Runner: `macos-latest`. Otty is a macOS app, and the D-1 OCR helper will need `swiftc`. Everything except OCR could run on Linux, but one runner keeps it simple.
- Steps: checkout → `actions/setup-node` (Node 24, npm cache) → `npm ci` → `npm run typecheck` → `npm run build`.
- The `postinstall` downloads the Electron binary. Cache `~/Library/Caches/electron` keyed on the Electron version, so runs stay fast.
- **Prerequisite: commit the lockfile properly.** `package-lock.json` is listed in `.gitignore`, on a line missing its trailing newline, yet it's still tracked. `npm ci` needs it, so remove that ignore line and keep the lockfile up to date.

**Stage 2: tests** (once there's something to test)
- Add `vitest` and an `npm test` step. First targets:
  - `language.ts` (`isMostlyHan`, `resolveLanguage`) from D-2
  - the store's migrations and import from D-3
  - the intent head's softmax and decision rule from D-1
  - `cleanUrl` and `titleFor`
- Tests that need Electron APIs mock them. No UI or E2E tests yet.

**Stage 3: unsigned build artifact** (manual trigger, or on tags `v*`)
- `npm run build:mac` → upload `dist/*.dmg` as a workflow artifact, so testers can grab a build without a dev setup.
- Signing and notarization stay a separate item (see BRAINSTORM). When they land, the secrets (Developer ID certificate, App Store Connect key) go into GitHub Actions secrets and this job signs the `.dmg`.

**Also:**
- Make the `ci` check required on `main` (branch protection) once it's green.
- Add a CI status badge to the README.
- Optional: Dependabot for npm and GitHub Actions, weekly.

**Done when:** a PR shows a green `ci` check running typecheck and build in under about 5 minutes with a warm cache; a deliberate type error turns it red; `main` requires it.

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
43. Quit Otty, start it with `OTTY_STORE=sqlite npm run dev` → Recent chats shows the same chats as before, `chats.json` is now `chats.json.imported`, and `otty.db` is in the app's data folder. Search English and 「打印」 → the same results as with JSON. Ask something, quit, relaunch → it's saved. Settings → Privacy → forget all chats → the list is empty.
44. Ask "What's new in macOS this month?" → a "Looking up …" chip, and an answer citing dated sources as links that open in the browser.
45. In Safari on a public article, press **⌥Space** with nothing highlighted → "Summarize this page" → a "Reading <site>" chip and a summary of that page. On a signed-in page (e.g. your webmail) → Otty says it can't read it and suggests highlighting instead. Ask in 中文 about a Hong Kong topic → Chinese sources.
46. Settings → set the base URL to another provider → search still answers (Wikipedia), and asking to read a page doesn't offer to. Settings → Privacy shows the DeepSeek line.
