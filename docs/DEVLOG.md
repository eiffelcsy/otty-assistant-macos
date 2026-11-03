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
│ store/         ChatStore: saved chats + search (JSON)  │
│ files/         attachments; fileWorker.js reads docs   │
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

**Suggested build order: D-3 → D-1.** D-5 (search, shipped) added the `ChatStore` interface on today's JSON file, so D-3 is "write a second backend and pass the same tests". D-6 (file attachments v1) has shipped; issue #13's capture tray should fold the file chips and the capture into one list (today a message has one capture plus `files`). D-2 (home language) has shipped, so D-1's `translate` and `define` intents can target the home language already. D-1 still needs somewhere to keep its predictions and corrections (D-3). D-4 (CI) is running; what's left of it is small and independent.

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

- **Builds on the `ChatStore` interface** (`src/main/store/types.ts`, shipped with search): this is a second backend (`src/main/store/sqliteStore.ts`) picked in `store/index.ts`, not a rewrite of the callers.
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
- **The interface grows incremental writes:** `save(thread)` splits into `appendMessage` and `finishTurn` (the JSON backend can keep rewriting the file). `ChatSession` calls those instead of `save(thread)`.
- **Migration:** on first launch, if `chats.json` exists, import it in one transaction, then rename it to `chats.json.imported`.
- **New UX it enables:**
  - Faster search in Recent chats: `ChatStore.search` with FTS5 `trigram`, `snippet()` and `bm25()` blended with recency. Trigram needs 3+ characters per term, and many Chinese searches are 2 characters (電腦, 打印), so a shorter term falls back to `LIKE '%…%'`. The query rules are in `store/search.ts`; the backend is done when `searchContract('sqlite', …)` from `store/__tests__/search.contract.ts` passes.
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
