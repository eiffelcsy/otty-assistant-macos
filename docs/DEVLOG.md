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
| D-1 | Context-aware intents (local encoder classifier) | ⏳ | D-2 (`define` / translate targets), D-3 (intent column), OCR helper | L (4–6 days) |
| D-2 | Home-language help (English-first, 繁體中文（香港） on demand) | 🔨 | — | S–M (1–2 days) |
| D-3 | SQLite chat storage | ⏳ | — | M (1–2 days) |
| D-4 | CI pipeline (GitHub Actions) | ⏳ | — | S (half a day) |

**Suggested build order: D-2 → D-3 → D-1.** D-1 is the top priority, but it builds on the other two. Its `translate` and `define` templates target the user's home language (D-2), and its predictions and corrections need somewhere to live (D-3). Both are small, so they unblock D-1 within about three days. **D-4 (CI) is independent and small, so do it first or alongside D-2**, so every later PR gets checked.

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

## D-2 · Home-language help for English-first users 🔨

**Who it's for.** Bilingual and multilingual people who **work in English**: their apps, documents, errors and screenshots are almost all in English. They're fluent, but now and then a word, phrase or process is easier to get in their native language. v1 supports **繁體中文（香港）**, Traditional Chinese as written in Hong Kong, as the home language. Taiwan usage comes next (see BRAINSTORM).

**So the design is "English by default, home language on demand"**, not a global answer-language switch. The app's interface stays in English.

### Behaviour

1. **Setting: "My other language"** (Settings → Otty, and onboarding step 1): `homeLanguage: 'zh-HK' | null`. The picker reads 「繁體中文（香港）」.
   - Default: `zh-HK` if any of `app.getPreferredSystemLanguages()` is `zh-HK`, `zh-Hant-HK`, `zh-MO` or `zh-Hant-MO`; otherwise none. Taiwan (`zh-TW`) users aren't defaulted in, because HK vocabulary would feel off to them; they can still pick it by hand until the Taiwan variant ships.
   - Worked out when the setting is missing (`undefined`). A stored `null` means the user picked "None" and is never overwritten.
   - With none set, Otty behaves exactly as it does today, and none of the features below appear.
2. **Which language an answer uses** (decided in main, per turn, first rule that applies wins):
   1. The turn asks for one explicitly: the **EN / 中 pill** in the composer or quick view, the "other language" button, or a quick action that implies a language (Explain in Chinese, Translate). The pill starts on Auto, applies only to the message being sent, then goes back to Auto, so one Chinese answer never quietly turns the rest of the chat Chinese.
   2. The user *typed* their question mostly in the home language. Script check on the typed text only (not the selection, not a chip label): Han characters make up ≥ 30% of the text, counting each Han character and each English word as one unit. (Counting letters undercounts Chinese: "PDF 點樣 save?" would be 22%.) Otty replies in kind, so a follow-up typed in Chinese gets a Chinese answer without touching the pill.
   3. Otherwise **English**. That includes no-prompt captures, **even of Chinese text**: our users work in English, and the pill or "Explain in Chinese" is one tap away.
   - **"Other language" button (中文 / EN) on each finished answer.** It does *not* re-send the question (that would duplicate the user bubble and the screen content, and can't work for reopened chats whose snip is gone). It sends a short follow-up in the same chat, shown as a small user line ("In 中文, please"), with the language set; the model already has its last answer in history.
   - Both user and assistant messages carry their resolved `language`, so the button knows which way to flip, explain cards inside an answer open in that answer's language, and reopened chats show it correctly. Chats saved before D-2 have no `language` and read as English.
3. **Keep the screen's words in English.** This is the most important prompt rule. When answering in the home language, Otty keeps on-screen labels, menu and button names, code, commands, file names and error messages **exactly as shown in English**, adding the translation on first mention. That way the user can still find the button they're being told to press.
   - Example: 按「File」（檔案）→「Print」（打印），然後選「Save as PDF」（另存為 PDF）。
4. **Word help (the "certain words / phrases" case):**
   - **Explain-term cards** get a home-language line at the top when a home language is set, e.g. **中文：應用程式介面**, followed by the usual simple English explanation. One call: the prompt asks for a fixed first line `中文：…`, which the card splits off.
   - A **中文 / EN** toggle on the card re-explains the term in the other language. The card opens in its answer's language; the cache key is `language + term`.
   - **Short selections (≤ 5 words, English)** get a **"What does this mean?"** chip that returns a compact card: the meaning in plain English, the Chinese translation, and one example sentence. It is shown in the panel *and* the quick view (highlight a word → hotkey is the main path). It becomes the `define` intent in D-1.
5. **Quick actions are ids, not prompt text.** `sendMessage` takes `opts.action?: QuickAction` (`'explain' | 'explain-home' | 'translate' | 'define' | …`). The renderer shows a label; main turns the id into the prompt and the language. This keeps prompts in `prompts.ts`, stops a Chinese chip label from tripping the script check, and gives D-1 its intent ids.
   - When a home language is set: **Explain in 中文**, and **Translate** whose direction comes from a local script check of the selection (English → Chinese, Chinese → English; the label says which, "Translate to 中文"). With none set, today's chips stay as they are.
6. **Hong Kong written Chinese: Traditional characters, HK vocabulary.** The system prompt asks for:
   - **Register:** standard written Chinese (書面語) as used in Hong Kong, not written Cantonese (no 係／唔／嘅). This is the default; see the open questions.
   - **Hong Kong character forms and vocabulary**, not Taiwan or Mainland usage. The prompt carries a short list of examples:

     | HK (use) | TW (avoid) | Mainland (avoid) | Meaning |
     | --- | --- | --- | --- |
     | 軟件 | 軟體 | 软件 | software |
     | 打印 | 列印 | 打印 | print |
     | 電郵 | 電子郵件 | 邮件 | email |
     | 網上 | 線上 | 在线 | online |
     | 用戶 | 使用者 | 用户 | user |
     | 數據 | 資料 | 数据 | data |
     | 伺服器 | 伺服器 | 服务器 | server |

   - **No Simplified characters** at all.
   - *Drift guard, only if testing shows slips:* when each turn finishes, run Chinese answers through `opencc-js` with Hong Kong output (`{ from: 'cn', to: 'hk' }`). Check whether its `tw` → `hk` mode helps with Taiwan vocabulary. Don't convert per streamed chunk, because phrases can split across chunks.

### Code changes

- `src/shared/types.ts`: `PublicSettings.homeLanguage`; `type AnswerLanguage = 'en' | 'zh-HK'` (keyed by language, not "Chinese", so `'zh-TW'` slots in later); `type QuickAction`; `sendMessage` opts gain `language?` and `action?`; `language?` on the `user` and `start` events and on both `ChatMessage` kinds; `explain(term, around, language)`.
- `src/main/language.ts` (new, no Electron imports so it can be unit-tested): `defaultHomeLanguage(systemLanguages)`, `isMostlyHan(text)`, `resolveLanguage({ typed, picked, home })`, `LANGUAGE_NAMES`, `languageBlock(lang)` (the per-turn prompt note with the HK vocabulary list).
- `src/main/prompts.ts`: `systemPrompt(language)` appends the language block **at the end** for this request only. The system prompt is rebuilt every round and never stored in `history`, so nothing has to be stripped before saving. Also `explainPrompt(term, around, language, home)`, `actionPrompt(action, …)` for define / translate / explain-home.
- `src/main/llm.ts`: `ChatSession.send(text, ctx, app, { language, action })` resolves the language per turn and passes it to `systemPrompt`.
- `src/main/settings.ts`: the `homeLanguage` default at load.
- Renderer: the language pill (only with a home language; resets after each send); the "other language" button on finished answers; quick-action list built from `homeLanguage` and the script check, in the panel and (define only) the quick view; explain card translation line and toggle; Settings and onboarding picker.
- Tests: add `vitest` with unit tests for `language.ts` (mixed text like "PDF 點樣 save?" and "點樣 open Settings" near the 30% line). D-4 CI runs them.
- `tools/lang-check` (dev only): flags Simplified characters and the TW / Mainland terms from the table in a batch of answers, for the 20-answer check and the drift-guard decision.

### Build order

1. ✅ Main core: types, `language.ts` + tests, settings default, prompts, per-turn language in `ChatSession`. Script checks (`isMostlyHan`, `isShortPhrase`) live in `src/shared/script.ts` so the renderer can use them too.
2. ✅ Composer: `components/LanguagePill.tsx` (EN / 中, neither lit = Auto, pressing the lit one returns to Auto, resets after each send) in the panel's composer field and beside "ask Otty" in the quick view. The "In 中文" / "In English" button (`lib/again.ts`) is shown on the **latest** finished answer only, because `again` asks for "your previous answer"; on an older answer it would redo the wrong one. It sends "In 中文, please" as a user line.
3. ✅ (panel) Quick actions as ids: `components/QuickActions.tsx` builds the tiles. Explain in 中文, two-way Translate and "What does it mean?" are done. In the quick view, ↵ with an empty box runs the first action, which is "What does it mean?" for a short phrase. The quick view has no tiles yet: decide after trying it.
4. ✅ Explain card: opens in its answer's language (`Markdown` gets `language`; `HomeContext` carries the home language). An EN / 中文 toggle sits in the card's title row (only with a home language). The cache key is `language:term`, and a slow reply for a language the user already switched away from is ignored. "Ask more about this" is asked in the card's language (「請再詳細解釋「…」。」), so the typed-language rule answers in kind.
5. Settings and onboarding pickers.
6. 20-answer check with `tools/lang-check`; decide on the drift guard; smoke test on a Mac.

### Done when

- With no home language, nothing changes. Smoke steps 1–18 still pass.
- With 繁體中文（香港） set:
  - Captures with no prompt → English answers.
  - Typing 「這是什麼意思？」 → a Chinese answer.
  - The pill set to 中 gives a Chinese answer for that message only; the next message is back on Auto.
  - The 中文 button on an English answer gives the same answer in Chinese, also in a reopened chat.
- "How do I save this as a PDF?" answered in Chinese keeps 「File」「Print」 in English with translations, and uses 打印, not 列印.
- Explain cards show the 中文 line. Short selections offer "What does this mean?" in the panel and quick view.
- Across 20 test answers: no Simplified characters, and none of the TW / Mainland terms from the table that differ from HK usage.

### Open questions (defaults chosen; revisit after a week of use)

- Standard written Chinese (default) or a more colloquial written-Cantonese tone? A casual Cantonese tone toggle is in BRAINSTORM.
- Should English answers also add home-language glosses for tricky terms inline, e.g. "latency (延遲)"? Default: no, it lives on the explain card. It's in BRAINSTORM as a possible "bilingual mode" toggle.

---

## D-3 · SQLite chat storage ⏳

**Goal.** Replace `chats.json`, which is rewritten in full on every save, with a real local database. It should allow incremental writes, search, and room for new tables such as intent feedback.

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
  - A search box in Recent chats (FTS; trigram works for Chinese, which has no spaces).
  - A retention setting ("Keep chats: 30 days / 1 year / forever") that replaces the hard cap of 50.
- **Privacy unchanged:** no pixels are stored, and "Forget all chats" runs `delete` plus `VACUUM`.

**Done when:** an existing `chats.json` imports cleanly; Recent chats, reopen and forget all still work; search finds both English and Chinese text; killing the app mid-answer keeps the question.

---

## D-4 · CI pipeline (GitHub Actions) ⏳

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
