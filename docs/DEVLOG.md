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
│ chats.ts       saved chat threads (JSON for now)       │
│ tools.ts       search_web, open_url, …                 │
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

## Roadmap

| ID | Item | Status | Depends on | Size |
| --- | --- | --- | --- | --- |
| D-1 | Context-aware intents (local encoder classifier) | ⏳ | D-3 (intent column), OCR helper; D-2's quick-action ids (shipped) are its intent ids | L (4–6 days) |
| D-3 | SQLite chat storage | ⏳ | — | M (1–2 days) |
| D-4 | CI pipeline (GitHub Actions) | 🔨 | — | S (half a day) |
| D-5 | Search across chats (storage-agnostic) | ⏳ | — (JSON first); D-3 adds the SQLite backend | M (1–2 days) |
| D-6 | Attach files (PDF, Word, images, text) | ⏳ | Shares the capture tray with issue #13; v2 retrieval uses the D-1 encoder | M–L (3–4 days) |

**Suggested build order: D-5 → D-3 → D-6 → D-1.** D-5 introduces the `ChatStore` interface on today's JSON file, so D-3 becomes "write a second backend and pass the same tests". D-6 is independent of storage; build it together with (or after) issue #13's capture tray. D-2 (home language) has shipped, so D-1's `translate` and `define` intents can target the home language already. D-1 still needs somewhere to keep its predictions and corrections (D-3). D-4 (CI) is running; what's left of it is small and independent.

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

## D-3 · SQLite chat storage ⏳

**Goal.** Replace `chats.json`, which is rewritten in full on every save, with a real local database. It should allow incremental writes, search, and room for new tables such as intent feedback.

- **Builds on D-5's `ChatStore` interface:** this is a second backend (`src/main/store/sqliteStore.ts`), not a rewrite of the callers.
- **Engine:** Node's built-in **`node:sqlite`** (`DatabaseSync`). Verified on 2026-11-01 under Electron 45.2.1 / Node 24.22.1: SQLite 3.53.4, with FTS5 and the `trigram` tokenizer available. No native module or rebuild step is needed. Wrap it behind a small `ChatStore` interface so `better-sqlite3` could replace it if `node:sqlite`'s API changes.
- **File:** `userData/otty.db`, mode 600, `journal_mode=WAL`, `foreign_keys=ON`. Migrations are keyed on `PRAGMA user_version`.
- **Schema v1**

  ```sql
  create table chats(
    id text primary key, title text not null, app text,
    language text, created_at integer not null, updated_at integer not null);
  create table messages(
    id text primary key, chat_id text not null references chats(id) on delete cascade,
    seq integer not null, role text not null, text text not null,
    context_kind text, context_text text,          -- images: kind only, never pixels
    app_json text, tools_json text, error text, intent text,
    created_at integer not null);
  create table llm_history(                        -- what the model sees, to resume a chat
    chat_id text not null references chats(id) on delete cascade,
    seq integer not null, json text not null, primary key(chat_id, seq));
  create table intent_feedback(                    -- used by D-1
    id integer primary key, predicted text, chosen text, probs_json text, created_at integer);
  create virtual table messages_fts using fts5(text, content='messages', content_rowid='rowid', tokenize='trigram');
  create index messages_chat on messages(chat_id, seq);
  create index chats_updated on chats(updated_at desc);
  ```

- **Write path:**
  - Insert the user message as soon as it's sent, so a crash mid-answer keeps the question.
  - At the end of the turn, upsert the assistant message and replace that chat's `llm_history` rows, in one transaction.
  - Writes are sub-millisecond, so they can stay synchronous on main. Revisit only if profiling says otherwise.
- **`chats.ts` becomes the store**, with `createChat`, `appendMessage`, `finishTurn`, `listChats(query?)`, `getChat`, `deleteChat`, `clearChats`. `ChatSession` calls those instead of `saveChat(thread)`.
- **Migration:** on first launch, if `chats.json` exists, import it in one transaction, then rename it to `chats.json.imported`.
- **New UX it enables:**
  - Faster search in Recent chats: D-3 implements D-5's `ChatStore.search` with FTS5 (trigram works for Chinese, which has no spaces) and must pass D-5's search conformance suite.
  - A retention setting ("Keep chats: 30 days / 1 year / forever") that replaces the hard cap of 50.
- **Privacy unchanged:** no pixels are stored, and "Forget all chats" runs `delete` plus `VACUUM`.

**Done when:** an existing `chats.json` imports cleanly; Recent chats, reopen and forget all still work; search finds both English and Chinese text; killing the app mid-answer keeps the question.

---

## D-4 · CI pipeline (GitHub Actions) 🔨

**Progress.**
- ✅ Stage 1 + 2: `.github/workflows/ci.yml` runs typecheck, `npm run test --if-present` and build (`--if-present` because `main` has no tests until D-2 merges), with Dependabot (`.github/dependabot.yml`), the lockfile no longer ignored, and a README badge.
- ⏳ Make `ci` required on `main` (branch protection) once it's green.
- ⏳ Stage 3 (`.dmg` artifact): a `workflow_dispatch` workflow can only be started once it exists on `main`, so add it in a follow-up PR.

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

## D-5 · Search across chats (storage-agnostic) ⏳

Issue: #15.

**Goal.** A search box in Recent chats that finds any earlier chat by what was said in it, in English or Chinese. It works on today's `chats.json`, keeps working unchanged when D-3 swaps in SQLite, and could later run against an online database.

### One contract, many backends

- **A `ChatStore` interface** (`src/main/store/types.ts`) that `ChatSession` and the IPC handlers talk to, instead of importing `chats.ts` functions directly. D-3 already plans this interface; D-5 defines it first and adds search to it:

  ```ts
  interface ChatStore {
    list(opts?: { limit?: number }): Promise<ChatSummary[]>
    get(id: string): Promise<Thread | undefined>
    save(t: Thread): Promise<void>        // D-3 splits this into appendMessage / finishTurn
    delete(id: string): Promise<void>
    clear(): Promise<void>
    search(q: string, opts?: { limit?: number }): Promise<ChatSearchHit[]>
  }
  ```

  - **Async on purpose**, even though JSON and `node:sqlite` are synchronous, so a network backend fits without changing callers.
  - Backends: `jsonStore.ts` (today), `sqliteStore.ts` (D-3), and later a remote one. `store/index.ts` picks one at startup.
- **Backend-neutral query semantics**, written down so every backend agrees:
  - The query is normalised (NFKC, lower-case, trimmed, whitespace collapsed) and split on spaces into terms. Quotes keep a phrase together.
  - A chat matches when **every term** appears as a **case-insensitive substring** somewhere in it (AND). Substring rather than words, because Chinese has no spaces.
  - Searched: the chat title, user and assistant message text, and text captures. Not searched: tool JSON, hidden prompts, the `[I'm using …]` note, app names (a later filter).
  - Ranking: a title match first, then more matching messages, then most recently updated. Backends may break ties differently.
- **Backend-neutral result**, so the renderer never sees SQL or backend details:

  ```ts
  interface ChatSearchHit {
    chatId: string; title: string; app?: string; updatedAt: number
    messageId?: string                         // the best-matching message, to scroll to
    snippet: { text: string; ranges: [number, number][] }   // ~120 chars around the match
  }
  ```

  `ranges` are offsets into `snippet.text`. The renderer wraps them in `<mark>` itself, so a backend never returns HTML.

### Backends

- **JSON (ships first):** a linear scan over the cached threads. With 50 chats (or a few thousand after D-3's retention setting) this takes well under 10 ms. Build snippets in TypeScript.
- **SQLite (D-3):** FTS5 with the `trigram` tokenizer, `snippet()` and `bm25()`, blended with recency. Trigram needs 3+ characters per term, and many Chinese searches are 2 characters (電腦, 打印), so a shorter term falls back to `LIKE '%…%'` on `messages.text`. Same result shape.
- **Remote (future):** Postgres `ILIKE` with `pg_trgm`, or the provider's own full-text search. Search runs on the server and returns `ChatSearchHit`s.
- **One conformance test suite** (`src/main/store/__tests__/search.contract.ts`): the same fixture chats and expected hits (English, Traditional Chinese, 1–2 character Chinese terms, mixed case, quoted phrases, no match) run against every backend. A new backend is done when it passes.

### UX (`History.tsx`)

- A search field at the top of Recent chats: magnifier icon, placeholder "Search your chats". It shows only when there are saved chats.
- Results update as you type (150 ms debounce). A request id drops answers to older keystrokes.
- Each result shows the title, the app and its age, and a one-line snippet with the matches highlighted.
- Clicking a result opens the chat, scrolls to the matching message and briefly highlights it (the `load` event gains an optional `focusMessageId`).
- Empty state: "No chats mention “…”". Esc clears the search; a second Esc closes the list as today.
- ⌘F in the panel opens Recent chats with the search field focused.

### Code changes

- `src/shared/types.ts`: `ChatSearchHit`; `searchChats(q)` on the preload API; `focusMessageId?` on the `load` event.
- `src/main/store/`: `types.ts`, `jsonStore.ts` (today's `chats.ts` logic moves here), `search.ts` (normalising, term matching and snippets, shared by the JSON and any in-memory backend), `index.ts`.
- `src/main/llm.ts`, `src/main/index.ts`: use the store; add the `chats:search` IPC handler.
- `History.tsx` and `styles.css`: the search field, result rows and `<mark>` style, using existing tokens.
- `docs/REQUIREMENTS.md`: FR-10.5 for search.
- `tools/ui-preview`: a `scene=history` with mock search results.

**Done when:** searching "otter" and 「打印」 both find the right chats on the JSON backend; the conformance suite passes on JSON (and on SQLite once D-3 lands); clicking a hit scrolls to the message; with "Remember my chats" off there is no search field.

**Risks:** keeping two backends' ranking roughly alike (the suite checks which chats match, not their exact order); trigram's 3-character floor for Chinese (handled by the `LIKE` fallback).

---

## D-6 · Attach files (PDF, Word, images, text) as context ⏳

Issue: #16.

**Goal.** Users can add files from their Mac (a PDF, a Word document, a photo, a text or CSV file) to a question and ask about what's inside: "summarise this report", "what does clause 4 mean?", "what's in this picture?".

### Adding a file

- **Paperclip button** in the panel composer → the native open dialog (`dialog.showOpenDialog` in main).
- **Drag and drop** onto the panel or the quick view.
- **Paste** a file copied in Finder (⌘C on a file puts a file URL on the clipboard).
- **Finder selection + ⌥Space:** if Finder is frontmost and a file is selected, attach that file instead of copying its name. A small, high-value bonus; can come after v1.
- Files show in the **same capture tray as issue #13** (multiple captures per message): one chip per item with a type icon (UIcons), the name, the page count and a ✕. While a file is being read, the chip says "Reading…". If #13 hasn't shipped, D-6 builds the tray and #13 later adds "hotkeys add to the tray".

### Supported types (v1)

| Type | How it's read | Notes |
| --- | --- | --- |
| PDF | `pdfjs-dist` text extraction, page by page | Page numbers kept, so answers can say "(page 4)". A PDF with no text layer (a scan): send page images to vision models, otherwise say Otty can't read scans yet. OCR via the D-1 `otty-ocr` helper later |
| Word `.docx` | `mammoth` → plain text with headings | Pure JS, so it builds and tests on any OS. `.doc`, `.rtf` and `.odt` can come later via macOS `textutil` |
| Images (PNG, JPEG, GIF, WebP, HEIC) | `nativeImage`, downscaled and re-encoded like snips (FR-4.2); HEIC via `sips` | Same "this model can't see pictures" warning as snips |
| Text (`.txt`, `.md`, `.csv`, `.json`, code) | Read as UTF-8 | Binary or unknown files are turned away politely |

Later: `.xlsx` and `.pptx` (`SheetJS`, PPTX XML), Pages and Keynote (export via AppleScript).

### Reading and sending

- **Parsing runs in main, inside a `utilityProcess`** (`src/main/files/worker.ts`) with no network access, so a big PDF never freezes the app. The renderer only ever gets metadata and a thumbnail, never file paths or bytes it didn't already have.
- **Limits:** 5 files per message, 25 MB per file, and a check of a `.docx`'s unzipped size (zip bombs). Each limit has friendly copy ("That file is too big for Otty. Try one under 25 MB").
- **Context budget:** estimate tokens (about 4 characters each for English, about 1 per CJK character) and keep the attached text under a budget, about half of the model's context window (a setting, since providers differ).
  - **v1: send the whole text** when it fits. When it doesn't, send the first part and **tell the user** ("Otty read the first 40 of 120 pages"), and tell the model too.
  - **v2: local retrieval** for big files: split into chunks, embed them with the D-1 encoder, and send only the chunks closest to each question. Everything stays on the Mac.
- **Message shape:** the text goes into the user turn as a labelled block, `[File 1: report.pdf · 12 pages]` then the text with `--- page 3 ---` markers. Images go in as `image_url` parts like snips. `prompts.ts` asks the model to cite pages when it can, and to say when the answer isn't in the file.
- **Later turns** carry the file text in history, so follow-ups work. Providers with prefix caching (DeepSeek does it automatically) keep the repeated cost low.

### Saving and privacy

- **The original file is never copied.** Otty only reads it.
- Saved chats keep the attachment's name, type and page count. **The extracted text is saved with the chat** so a reopened chat can carry on (it's deleted with the chat). Pictures are stripped, as for snips: "Picture (not saved)".
- Open question: should saving document text be a separate privacy toggle ("Remember files I attach")? Leaning to no toggle, but saying it plainly in Settings → Privacy.
- The file name is searchable through D-5. Searching inside saved file text can come later.

### Code changes

- `src/shared/types.ts`: a `file` variant of `ScreenContext` (`{ kind: 'file'; id; name; mime; size; pages?; text?; truncatedAt?; images? }`), and contexts become a list (shared with #13).
- `src/main/files/`: `worker.ts`, `pdf.ts`, `docx.ts`, `image.ts`, `text.ts`, `budget.ts` (token estimate and truncation).
- `src/main/llm.ts`: `userContent()` builds the labelled blocks. `src/main/chats.ts` (or D-5's store): strip pictures, keep text.
- `src/main/index.ts`: `files:pick` and `files:read` IPC; Finder-selection attach.
- Renderer: the tray chips, drag-and-drop on `Panel.tsx` and `Quick.tsx`, the paperclip button, and quick actions for documents (**Summarise**, **Key points**, **Explain simply**).
- `package.json`: `pdfjs-dist` (Apache-2.0) and `mammoth` (BSD-2). Keep `package-lock.json` in sync.
- Tests: extraction on small fixture files (a 2-page PDF, a `.docx` with a heading, an empty scanned PDF, a CJK text file) and the budget and truncation rules.
- `docs/REQUIREMENTS.md`: a new FR for attachments.

**Done when:** dropping a PDF onto the panel and asking "summarise this" gives a summary that cites pages; a `.docx` and a photo both work; a 300-page PDF is cut to the budget with a visible note; a scanned PDF gives a friendly message on a text-only model; reopening the chat lets you ask a follow-up about the file; nothing freezes while a big file is read.

**Risks:** `pdfjs-dist` worker setup inside a `utilityProcess` and asar packaging; token cost of large documents on every follow-up (v2 retrieval fixes it); layout-heavy PDFs (tables, columns) extracting in a jumbled order.

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
25. Put the cursor near the bottom of the screen, highlight text → **⌥Space** → ask for a long answer, then open an explain term → the **esc close** and **↵ continue in chat** row stays visible, and the answer scrolls.
