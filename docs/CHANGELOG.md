# Otty — Changelog

What has shipped, newest first. The plan for what's next is in [DEVLOG.md](DEVLOG.md).

## Unreleased

On `main`, for the next release. Tested with unit tests and the UI preview, not yet with a real model or in the real app (smoke-test steps 67–87).

### Fixes from the first smoke test (2026-11-08)

- **Math shows up even when the model writes `$x^2$`** or puts a ✓ inside a formula. `lib/mathText.ts` tidies both before drawing (prices and code are left alone), and the prompt now asks for `$$…$$` everywhere. The calculation in the linear-algebra example was right; only the drawing was wrong.
- **Step cards have Done and Done, check it** on the current step, next to *I'm stuck*. The second ticks it, looks at the screen and has Otty say whether it worked and what's next.
- **A dropped connection no longer leaves a job looking busy.** A reply that goes quiet for 90 seconds counts as a lost connection, the row says "Lost the connection. Trying again…", and after three tries it pauses with Keep going.
- **Try again on a job that couldn't finish** (including one you stopped). Failed jobs now keep their saved steps, so it carries on from the last one instead of paying for them twice, and a later report writes over the partial one.

### Otty's own app icon (2026-11-06)

- **The app and the `.dmg` now show painted Otty** on a meadow tile, instead of Electron's default icon. `tools/otty-art/prepare.py` makes it from the same art as the rest.

### Do it with me: step cards (D-11, 2026-11-06)

- **Answers become checklists.** Steps carried out on the Mac appear as a card with progress, ticks saved with the chat, and a button wherever Otty can do the step: **Replace in Excel**, **Open**, **Click File › Export To › PDF…**, **Press for me** and **Copy**.
- **Nothing happens without a click,** and only in the app the question came from. Actions are looked up in main, so only what's on the card can run. Paste never sends Return and won't go into a password field. `open` only reaches web pages, installed apps, a list of Settings panes, and revealing files in the home folder.
- **Risky steps ask twice.** Delete, Send, Sign Out, ⌘Q and the like show a warning and **Sure?**, decided in code.
- **I'm stuck on this step** looks at the screen and asks, and the card updates in place. A menu that isn't there becomes a step to do by hand, and the next answer hears about it.
- **Quick view:** it stays open while there are steps to do, and has a slim box for follow-ups.

### Keep going: Otty works while you look away (D-22, 2026-11-06)

- **Answers keep running.** Moving to another chat, or asking something new from a hotkey, no longer stops an answer. Each chat has its own turn, up to three at once, and coming back picks it up, confirm card included.
- **Background research.** For a big question Otty offers a job on a card showing the whole brief. The job sees only that brief, can only search and read, and its report arrives as a normal chat with follow-ups.
- **Survives anything.** Jobs are saved step by step in `otty.db`, so they carry on after a quit or sleep. An unfamiliar address waits for an answer, even until tomorrow. One left for over a day asks before spending again.
- **Limits in plain code:** 24 rounds, 30 lookups, 15 minutes, and the same call three times each end in a partial report that says so. A lost connection retries, then pauses.
- **Activity** lists everything, with Stop, Allow, Keep going and Open. The otter shows a still marker while work runs.
- **Forgetting holds.** With **Remember my chats** off, nothing about a job is written. Forgetting a chat stops and removes its jobs.

### Otty learns about you (D-10, #17, 2026-11-06)

- **Memory that saves itself, in the open.** Otty notes what you tell it and what lasts, with no card. A quiet *Noted* line under the answer shows each one, with **Undo** and **Edit**, and stays in the saved chat. "Forget that…" works too.
- **Habits, counted on the Mac.** Your main apps, your answer language, the quick actions you use and asking for shorter answers build up over days, with no model call. Only counts are kept. Delete a habit and it stays gone.
- **Settings → What Otty knows about you:** grouped, each with its source, to edit, pause or delete, plus **Add something**, **Forget everything Otty knows** and a master switch. **Don't learn from this chat** is in the panel's header and the quick view.
- **The rules are in code, not the prompt.** A memory only counts as told if the user's own words ask for it. Sensitive things need that, and passwords, keys and codes are refused even then. On any turn with a capture, file or web result, a memory has to rest on what the user typed, so a hostile page can't plant one, however the model rewords it.
- **Cache-safe.** What Otty knows goes at the end of that turn's message, up to about 1,500 characters, and the latest note wins. If an earlier note stops being true, the next one says so.

### Math that's right, and instant (D-12, 2026-11-06)

- **Instant answers.** Type `17.5% of 2,340` and the result is there, with no model call, even offline. **Explain the working** hands it to the model.
- **A real calculator.** `calculate` takes every step in one call, in exact decimals, with percentages, units and statistics, behind an allowlist that refuses anything else before it runs. The chip appears already done, and tapping it copies the result.
- **Thinking only where it pays.** `mathTier` sorts each question locally. Only real problems turn on thinking for that turn, so other questions are no slower. **Think deeper** is now **Always think deeper**.
- **Rendered equations.** `$$…$$` shows as real math with KaTeX, from the bundle. Prices like $5 stay text, and an unfinished equation stays text until it closes.

### Foundations for Keep going (D-22 steps 0–1, 2026-11-06)

- **The tool loop has moved** to `loop.ts`, so a background job can share it. Nothing changes for the user.
- **Allowed tools are a real limit.** `ToolContext.allowed` is checked first thing in `runTool`, and Claude's web search now has to be asked for. Explain cards and titles no longer carry the search tool.

## 0.5.0 — Any model, Pick up text and a proofreader (2026-11-05)

### Whole-screen shortcut (2026-11-05)

- **⌘⌥⇧Space captures the whole display under the cursor** in one press, with no crosshair. It's labelled **Whole screen** and follows the same tray rules as a snip. It's in the menus, the empty chat's tips and Settings, as a third shortcut.
- **Otty stays out of the picture:** its windows go invisible for the moment of the capture. It's sent at up to 2048 px, so text stays readable.
- **A shortcut another app owns now says so** in Settings, for all three, instead of just doing nothing.
- This is the shortcut from D-14. The paw cursor and frozen-screen overlay are still to come.

### Idle budget (D-16, 2026-11-05)

- **Measured for the first time,** with `OTTY_METRICS=1` (`metrics.ts`): idle Otty used 1.6% of a core, nearly all of it the otter's smooth float redrawing all day.
- **Now about 0.25%.** The float is stepped, and it only travels 1.5px, so it should look the same. Hidden windows pause their animations, and read 0.00%.

### Proofread card (D-17, 2026-11-05)

- **Check my writing.** A highlighted draft comes back with each change marked and a plain reason for it. It's a tile in the panel and a **check writing** key in the quick view.
- **The model writes, Otty marks up.** The model only returns the corrected text, and `shared/diff.ts` compares it with what was highlighted, so the marks are always true. Past 4,000 characters it shows the fixed text without marks.
- **Copy fixed text** and the answer's own Copy both give clean text. Drafts stay in their own language, and **In 中文** changes the reasons only.

### Chat titles written by the model (D-19, 2026-11-05)

- After the first answer, a background call writes a title of a few words in the chat's language, so Recent chats and search read better. The instant title stays if that fails, and it only runs when chats are remembered.

### Warm explain cards (D-18, 2026-11-05)

- **Cards open straight away.** The first three terms are fetched as soon as an answer ends, into one cache in main (`explainCache.ts`), so both windows share each call and ↵ "continue in chat" keeps them.
- **Failures aren't remembered,** so one network blip no longer sticks for the session. Cards use the least thinking, so **Think deeper** can't use up their limit.

### Read this page in one tap (D-15, 2026-11-05)

- **Summarize this page.** When Otty knows the page and nothing is highlighted, the panel offers a tile and ↵ in the quick view runs it. It works on every service that can read pages, and shows no card, because the address is the user's own.
- **It only offers what it can really read.** An address still has its query removed for privacy, but if that query mattered, like `youtube.com/watch?v=…`, Otty would be reading a different page, so it makes no offer. Tracking-only queries such as `utm_*` don't count.

### Web search and page reading beyond DeepSeek (D-20 step 5, 2026-11-05)

- **Claude searches the web for real**, with its own `web_search` tool: at most five searches an answer, with a "Searching the web" chip, and a long search resumes by itself. Each search is billed to the user's Claude account, and Settings → Privacy says so.
- **Every online service can read pages.** Without DeepSeek's reader, the Mac opens the page itself (`pageReader.ts`), so the site sees the user's internet address, and Settings → Privacy says that too.
- **Page reading keeps its checks.** It still asks before an unfamiliar address. Claude's `web_fetch` is left out because it would skip those checks. The reader only opens public addresses on normal web ports, and checks each redirect, so a hostile page can't send Otty to a router or anything else only this Mac can reach.
- Addresses in Claude's search results count as known. The model's own text and search words never do.
- **On this Mac** is labelled experimental in the picker.

### Pick up text (D-21, 2026-11-05)

- **Select the words in a picture.** **Pick up text** beside a snip opens it in a floating window with its words live: drag across them and press ⌘C, like text on a web page. ⌘A and **Copy all** work too. The window stays on top until it's closed, so the user can paste elsewhere and come back.
- **It all runs on the Mac:** no model, no key and no network. `otty-ocr` is a small Swift helper using Apple Vision, built by `tools/otty-ocr/build.mjs` and shipped in the app's resources. The picture reaches it over stdin, so it never touches disk, and it's gone when the window closes.
- **Tables stay tables.** Lines are sorted into rows (`readingOrder.ts`), because Vision reads a table column by column, and rows copy with tabs, so `copyFormats` pastes them as real cells.
- **What testing found.** Vision needs Chinese listed first or Chinese turns into symbols, but that hurts English ("due" read as "aue"), so the helper reads both ways and uses English for lines with no Chinese. A margin around the picture fixes text near an edge. Enlarging was dropped because it lost characters.
- A read takes about 0.4 s, but the first one after installing took 30–50 s while Apple's models loaded, so the window opens straight away and says "Reading the words…".

### Choose Otty's brain (D-20 step 4, 2026-11-05)

- **Pick a service, paste a key.** Settings and the welcome page now offer DeepSeek, Claude, OpenAI, On this Mac and Another service, and each fills in its own address and model (`shared/services.ts`). The address and API format sit under Advanced. DeepSeek stays the default.
- **One key per service.** Switching back never loses a key, and a key only ever goes to its own service. Before, the saved key went to whatever address was set. Keys from earlier versions move across on first launch, so upgrading needs no setup. A key that can't be unlocked counts as missing instead of crashing.
- **Each service says where things go,** both for questions and for web lookups, in Settings → Privacy.

### Any Anthropic-style server, including Claude (D-20 step 3, 2026-11-05)

- **Otty now speaks two API formats.** Set the server address, model and key, and pick **API format** in Settings: Automatic, OpenAI-style or Anthropic-style. Automatic goes by the address, so nothing changes for existing users.
- **Claude works** at `https://api.anthropic.com`, with `claude-sonnet-5-5` as the model to start on. It streams, uses tools and reads snips. Thinking blocks go back unchanged across tool rounds and turns, the prompt is cached, and a chat whose history changed quietly loses old thinking instead of failing.
- **Other Anthropic-style servers** get a plain request with none of Claude's extras. Their key goes out both ways, because servers differ, and with no key the SDK can't pick one up from elsewhere on the Mac.
- **Chats move between services.** A reply is only replayed to the server that wrote it. Anywhere else it's rebuilt from its text and tool calls.
- **A refusal shows a kind message** on any service, and the turn is forgotten. On Claude, the API first tries a fallback model (`fallbacks: "default"`).
- Friendly error messages are now shared, so both formats say the same thing.

### Local models and provider profiles (D-20 step 2, 2026-11-05)

- **Stretch goal, not fully supported.** Local models are implemented but have not been tested against a real Ollama or LM Studio.
- **A model on the Mac works with no key.** Point the model address at Ollama or LM Studio and Otty stops asking for one. Friendly messages cover the usual problems: the server isn't running, or the model isn't downloaded.
- **With a local model, nothing leaves the Mac.** Web tools aren't offered, the prompt says so, and `runTool` refuses a search even if the model asks for one by name. The key saved for an online service is never sent to it.
- **Each service gets what it expects** (`providers/profiles.ts`). Only DeepSeek gets the `thinking` field, which strict servers can reject. OpenAI gets `max_completion_tokens`. A model that can't use tools is asked again without them, because many local ones reject them outright.
- **The file budget follows the model's window:** the same 48K on DeepSeek, and much less on a small local model. Requests to DeepSeek are unchanged.

### One seam for every model service (D-20 step 1, 2026-11-05)

- **Nothing changes for users.** All the code that talks to a model service moved to `src/main/providers/`, behind a small `Provider` interface: `stream()` gives neutral events (text, thinking, whole tool calls, why it stopped) and `complete()` gives one short answer. `ChatSession`, explain cards and the connection test no longer know which service they're using.
- **The chat loop is now pinned by tests,** written against the old code first: the request shape, tool calls arriving in pieces, the tool limit, each friendly error, a lost connection, Stop, a failed turn, explain cards and the connection test.

### Cheaper, quicker follow-ups (D-12 step 0, 2026-11-05)

- **The system prompt no longer changes every second.** It ended with the time, so DeepSeek could never reuse its cache. It now depends only on settings, so a follow-up should only pay for what's new, and every new chat shares a cached start.
- **The time and answer language moved into a short note** at the end of each user message (`turnNote`), kept in the history exactly as sent. The chat still shows only the user's words. The time is now to the minute.
- **The Hong Kong writing guide is always in the prompt** when that home language is set, instead of only on Chinese turns. A test checks that each request starts with the previous one byte for byte, and dev builds log cache hits.

## 0.4.0 — Capture tray, web reading and saved chats (2026-11-05)

### Tables that paste as tables (2026-11-04)

- **A copied table lands as a real table.** Otty used to copy plain text, so Word got a mess of `|` marks. Text with a table now goes on the clipboard as HTML too, with borders and a shaded header, so Word, Pages and Mail paste a table. Its plain text is tab-separated, so spreadsheets get cells. This covers both `copy_to_clipboard` and the **Copy** button under an answer. Text with no table is copied exactly as before.
- **"Exactly as shown".** The prompt asks for every word, number and empty cell to be kept when copying a table from a screenshot. Tables sent as tab-separated rows or in a code fence are understood too.
- **Pasted HTML stays safe** (`copyFormats.ts`): pictures become their description, because Word would fetch a remote one, and only web and mail links survive.

### Safer answers and web reading (2026-11-04)

- **Answers can't load remote pictures.** A picture in an answer now shows only its description, because fetching it would send whatever its address held, with no click. Built pages also have a Content Security Policy, so they can only reach their own files.
- **`read_page` asks before opening an unfamiliar address.** It goes straight to addresses that came from the user, a search or a page, exactly as given (`knownUrls.ts`). Anything else shows a "Read this page?" card with the full address, so a tricked model can't quietly send private text to a stranger's server. Search no longer repeats the query in its "no results" message, which could have made an invented address look known.

### Fixes (2026-11-04)

- **Long window titles stay inside the window.** The app tag on a capture could run off the left edge of the chat; it now ends in an ellipsis.

### Saved chats on SQLite (D-3, 2026-11-03)
- **Chats now live in a small database, `otty.db`**, using the SQLite built into Electron's Node (`node:sqlite`): no native module, nothing to rebuild. Every turn costs the same however long the chat: saving a normal turn takes about 0.5 ms, opening a chat under 1 ms, and searching 2,000 chats about 35 ms.
- **The question is saved the moment it's sent**, just after the request goes out so it never delays the answer. If Otty is force-quit mid-answer, the question is still there.
- **"Keep chats for" 30 days / 1 year / forever** (Settings → Privacy, default 1 year) replaces the cap of 50 chats. Old chats are forgotten at launch, after each answer and when the setting changes. Recent chats lists the newest 500, and search reaches the rest.
- **Forgetting really forgets:** deleted chats are overwritten on disk (`secure_delete`, and FTS5 secure-delete while forgetting), and the write-ahead log is folded back in. "Forget all chats" rebuilds the search index, so it takes well under a second even for thousands of chats.
- **Upgrading is automatic:** the first launch imports `chats.json` in one transaction, before anything is shown, then deletes the file. If the import fails, the file stays and the import runs again next time. A database that can't be opened falls back to keeping chats for that session only.
- Search narrows with an FTS5 trigram index (`instr()` for 1–2 character terms such as 打印), then ranks the newest 200 candidates with the same rules as before (`store/search.ts`).
- The schema already has room for what's planned, so those features need no migration: `memories` with status and expiry (D-10), per-day `counters` for habits and usage, `chats.pinned` (pinned chats are never forgotten by retention) and `chats.learn`, message times, and `intent_feedback` with embeddings (D-1). Allowed values are checked in code rather than with CHECK constraints, so adding one never rebuilds a table. The JSON store is gone.

### Web search and page reading (D-9, 2026-11-03)
- With DeepSeek as the provider, **search_web is a real web search** (DeepSeek's Search API): five dated results with summaries, which Otty cites as links. Other providers, or a failed search, fall back to Wikipedia and DuckDuckGo as before.
- **New read_page tool** (DeepSeek's Fetch API): "summarize this page" reads the page in the app note, up to about 24,000 characters. Pages that need a sign-in can't be read; Otty says so and suggests highlighting instead.
- Same key, no new setting. Search results and page text are treated as information, never instructions. Settings → Privacy says what goes to DeepSeek.

### Capture tray (D-8, #13, 2026-11-03)
- **One question can carry up to 4 highlights and snips**, each with the app it came from. With the panel open, ⌥Space, ⌥⇧Space, a click on the otter and the panel's scissors add to its tray; two or more things offer **Compare these**, **Summarize all** and **Explain each**.
- **The quick view collects too:** **＋ add more** keeps it open while you highlight in other apps, and it no longer closes when you switch desktops.
- Messages now carry `captures[]`; chats saved before keep opening as one-capture messages.

### Builds and CI (D-4, 2026-11-03)
- **`dmg` workflow:** an unsigned Apple Silicon + Intel `.dmg` from **Actions → dmg → Run workflow**, on every `v*` tag (attached to a draft release), and on PRs that change packaging.
- `main` is protected by a ruleset: changes go through a PR, the `ci` check must pass, and force pushes and deletion are blocked.

## 0.3.2 — Painted Otty (2026-11-03)

### Painted Otty (2026-11-03)
- **Otty is now painted art instead of a code-drawn SVG.** Two frames, idle and eyes-closed, made from generated portraits. The eyes-closed frame flashes on top for a blink every 5 seconds, and is held as Otty's happy face. Thinking still bobs with rising bubbles, happy still wiggles, and reduced motion turns them all off.
- The floating otter now peeks up from the bottom of its green bubble, clipped to the circle.
- `tools/otty-art/prepare.py` turns the source art in `tools/otty-art/source/` into the shipped 512px WebPs in `src/renderer/src/assets/otty/`. It cuts out the white background with a soft edge, fades the shoulders out, crops to a square, and builds the blink frame from only the eye area of the eyes-closed art, so nothing else shimmers mid-blink. New expressions go through the same script.

## 0.3.1 — Quick view fixes (2026-11-03)

### Fixes (2026-11-03)
- **Quick view no longer opens cut off.** Opening it again after a shorter one could leave the card stuck at the old, smaller height, with the box and the esc / ↵ row spilling out of it. Since #12 the card is capped to its window, and it was reporting that capped height back, so the window never grew. It now reports the height its contents need.
- **Explain terms open in the quick view again.** Tapping one closed its card straight away: the quick view re-renders to make room for the card, and `Markdown` built its link renderer inline, so every re-render remounted the terms. The renderers are now module-level, with the answer's text and language passed through context.

## 0.3 — Find in and across chats, attach files (2026-11-02)

### Find in this chat (D-7, 2026-11-02)
- **⌘F in a chat** (or the new search button in the header) opens a find bar above the conversation. It highlights every match, says "2 of 5", and steps with ↵ / ⇧↵ or the arrows. Explain terms are searched too, buttons aren't. Esc closes the bar first.
- Same matching rules as chat search (English or Chinese, quotes keep a phrase), now shared from `src/shared/match.ts`. Highlights use the CSS Custom Highlight API, so answers keep streaming while the bar is open, and the view stays on the current match.
- **Search across chats moved to ⇧⌘F.** ⌘F still opens it when no chat is open.

### Attach files (D-6 v1, 2026-11-02)
- **Ask about files from your Mac:** the paperclip in the composer, dragging files onto the panel, or pasting a file copied in Finder. Up to 5 files per message, 25 MB each. PDFs (read page by page), Word `.docx`, pictures (PNG, JPEG, GIF, WebP, HEIC, TIFF) and text files.
- Files show as chips with their name, page count or thumbnail, "Reading…" while Otty reads them, and a friendly reason when it can't (scanned PDFs, unsupported types, too big, too many). With files and an empty box, ↵ runs **Summarize**; **Key points** and **Explain simply** are one tap away.
- Documents are read in a separate utility process (`pdfjs-dist`, `mammoth`), so a big PDF never freezes Otty. Answers cite pages. A message's documents share a budget of about 48K tokens; past it, Otty sends the first part and says so on the message ("Otty read the first 40 of 120 pages") and to the model.
- Privacy: files are only read, never copied. Saved chats keep the file name and the text Otty read, so a reopened chat can carry on; pictures are never saved. File names are searchable. Settings → Privacy says this plainly (no separate toggle).
- Not in v1 (in BRAINSTORM): attaching in the quick view, the Finder selection with ⌥Space, scanned PDFs on vision models, local retrieval for big files.

### Search across chats (D-5, 2026-11-02)
- **Search box at the top of Recent chats**, and **⌘F** in the panel jumps straight to it. It finds chats by their title, anything said in them and text captures, in English or Chinese (substring matching, so 「打印」 works without spaces). Every word must appear; quotes keep a phrase together.
- Results show a one-line snippet with the matches highlighted. Clicking one reopens the chat scrolled to the matching message, which glows briefly. Esc clears the search first.
- Under the hood, saved chats moved behind a `ChatStore` interface (`src/main/store/`). The JSON file is its first backend; one conformance test suite defines search for every backend, so SQLite (D-3) only has to pass it.

### Fixes (2026-11-02)
- **Quick view no longer looks frozen near the bottom of the screen** (#12). The card now always fits its window: when there isn't room, the answer shrinks and scrolls, so the esc / ↵ row stays visible. The card still asks main for the height it would like, so it grows back when there's space.

## 0.2 — Quick view, saved chats, home language (2026-11-02)

### Home-language help, 繁體中文（香港） (D-2, 2026-11-01)
- **"My other language"** in Settings and on the welcome page: English only, or 繁體中文（香港）. Hong Kong and Macau Macs default to it; choosing English only is remembered.
- **Answer language per turn:** an explicit pick, then a language the quick action implies, then the language you typed in (Han characters count against words, so "PDF 點樣 save?" is Chinese), otherwise English. Chinese answers use Hong Kong written Chinese, Traditional characters only, HK vocabulary (軟件, 打印, 電郵…), and keep on-screen English words like 「File」 as they are.
- **EN / 中 pill** for the next message (panel and quick view), and an **In 中文 / In English** button on the latest answer.
- **Quick actions are ids** resolved in main: Explain in 中文, Translate in either direction, and "What does it mean?" for a short phrase (also what ↵ does in the quick view for a single word).
- **Explain cards** open in their answer's language, show a 中文 line, and have an EN / 中文 toggle.
- Fix: with 中 picked and the question typed in English, answers came back in English, because the system-prompt note lost to the question's own language. The turn's user message now also carries a one-line language reminder (in the request only, never saved).
- Smoke-tested on a Mac: no Simplified characters or Taiwan / Mainland vocabulary seen, so the `opencc-js` drift guard isn't needed for now (parked in BRAINSTORM).

### Visual refresh (2026-11-01)
- A calmer, more polished look that keeps the otter's warmth. Neutrals do most of the work and meadow green is kept for actions. Outlines became soft hairlines, with two-layer shadows for depth. There's now a radius scale (6 / 10 / 14 / 18 / 24) so nested corners line up, and fewer type sizes and weights.
- **Quick actions** are an even grid of quiet tiles with icons instead of outlined pills. The first tile is the ↵ default and shows a key cap.
- The capture and its actions sit in one **context card**: highlighted text shows as a quote with a straw rule, under a small-caps label.
- The **composer** is a single field holding the snip tool, the text and the send button. It shows a soft focus ring.
- Tool use is a quiet status line ("Searched …") instead of badges. The app tag is plain metadata. Tip cards are a soft straw fill with no border. The explain card has a quiet "Ask more about this →" link.
- Dark mode uses its own deeper green for user bubbles. Scrollbars, key caps and the onboarding step dots were refined.
- `tools/ui-preview` (dev only, `ui-preview` in `.claude/launch.json`) renders the real panel and quick view in a browser with a mock `window.otty`, for UI work without the Electron app.
### CI (2026-11-01)
- GitHub Actions `ci` runs on every PR and every push to `main`, on macOS with Node 24. It runs `npm ci`, then typecheck, then tests (when there are any), then build. The Electron binary is cached, and a newer push cancels the older run.
- Dependabot opens weekly update PRs for npm (minor and patch dev-dependency bumps grouped into one) and for GitHub Actions.
- `package-lock.json` is no longer listed in `.gitignore` (it was always tracked, and `npm ci` needs it). The README has a CI badge.

### Polish (2026-11-01)
- Tool chips use UIcons (search, globe, copy, alarm clock) instead of emoji.
- When an answer finishes while no Otty window is open (for example, the quick view was dismissed by clicking elsewhere), the otter shows a straw-coloured dot until you open the panel or quick view.
- **Test** in onboarding and Settings now names the model that answered, and sends a tiny image to warn up front when the model can't see screen snips.

### App awareness and saved chats (2026-11-01)
- Each capture notes the frontmost app's name, window title and, for Safari and Chromium browsers, the page address with its query and fragment removed. It shows as a removable "In Safari · …" tag and is sent to the model as a short `[I'm using …]` note. It can be turned off in Settings → Privacy.
- Chats are saved (text only, `userData/chats.json`, last 50). Hotkey questions start a new chat instead of wiping the old one. The panel has a **Recent chats** view to reopen or forget chats, plus a "Remember my chats" switch and **Forget all chats**.
- Fix: a stopped turn could truncate the next turn's history. Turns now run one after another.

### Quick view and icons (2026-10-31 → 11-01)
- Hotkeys open a small ask-at-cursor **quick view**. ↵ "continue in chat" swaps it for the full panel, which shows the same conversation (`useChat`).
- UI icons moved to Flaticon UIcons (rounded set). Colours became tokens in `styles.css`. Added a custom tray icon.

## 0.1 — MVP scaffold (2026-10-31)

Built in one day along the original six-phase plan:

| Phase | What |
| --- | --- |
| 0 | electron-vite + TypeScript scaffold, windows, typed preload API |
| 1 | Floating otter bubble (SVG, drag, click / right-click), tray menu |
| 2 | Selection capture (⌘C trick, clipboard restore), `screencapture -i` snips, permission checks |
| 3 | Streaming OpenAI-compatible client, system prompt, agent loop with 4 tools and confirm cards |
| 4 | Chat panel: context chips, quick actions, explain-term pop-ups, tip cards, friendly errors |
| 5 | Onboarding (key, test, permissions) and Settings |

Electron 45 setup notes: a `postinstall` downloads the Electron binary, and the async clipboard API is used (see CLAUDE.md).
