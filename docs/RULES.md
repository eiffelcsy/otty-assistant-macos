# Rules and what checks them

Every bullet in `CLAUDE.md`, in order, and what fails when it's broken (D-48). The first cell is the bullet's opening words: `src/__tests__/rules/coverage.test.ts` fails when a bullet has no row here, or a row no bullet. A rule nothing can check says **prose only**, with the reason. Test names are in "quotes" (the coverage test checks they exist); a rule's own words are in *italics*.

Where the checks live:
- **rule test**: `src/__tests__/rules/<file>`, static checks that read the source.
- **test**: an existing unit test, by file and test name.
- **lint**: `.oxlintrc.json`, run by `npm run lint`.
- **smoke**: the smoke harness, `tools/smoke/`.

| Rule | Enforced by |
| --- | --- |
| Target is macOS | Prose only: it says where things run, not something code can get wrong. CI runs on macOS. |
| Electron 45 has an async | Typecheck: the old sync clipboard calls are gone from Electron 45's types. |
| Electron 45 no longer | Rule test `boundaries.test.ts` "runs install-electron after npm install". |
| The tool loop is src/main/loop | Test `allowedTools.test.ts` "refuses a tool the model calls without being offered it…" and "turns Claude's own search off unless search is allowed"; `anthropic.test.ts` "only searches when asked…". Rule test `boundaries.test.ts` (no electron in `loop.ts` or `runner.ts`). |
| The main process owns | Rule test `preload.test.ts` (no key, path or contents through the preload). Test `settings.test.ts` "stores keys encrypted, and never shows them to the window". Lint: renderer can't import electron, main or the preload. |
| Model services live behind | Test `anthropic.test.ts` "gets a plain request, with none of Claude's extras"; `llm.test.ts` "never gets the key saved for an online service"; `webOff.test.ts`; `profiles.test.ts`. Rule test `net.test.ts` (no `fetch` in main but `net.ts`, no `http`/`https` sockets, every Anthropic client has `fetch: send`); test `net.test.ts` (main) "refuses anything off this Mac while the model is on it…" (D-52). Prose only for *code outside `providers/` never builds a request*: too many shapes to grep for. |
| Chats are saved as | Rule test `migrations.test.ts` (released migrations match committed hashes). Test `sqliteStore.test.ts` "writes a turn incrementally…", "never writes pictures to disk", "moves a database from the first release forward…"; `search.contract.ts`, run by `sqliteStore.test.ts`. |
| DeepSeek's cache needs each | Test `llm.test.ts` "only ever adds to the previous request, byte for byte" and "keeps the system prompt the same whatever the turn". |
| Explain terms are markdown | Rule test `requests.test.ts` (titles and explain cards use `complete()` with `reasoning: 'least'`). Test `llm.test.ts` "keeps background calls out of the chat"; `explainCache.test.ts`; `Markdown.test.tsx` (proofread card). Prose only for keeping `prompts.ts` in sync: the eval catches drift. |
| Web safety | Test `Markdown.test.tsx` "shows a picture's description and never loads its address"; `knownUrls.test.ts` "never trusts the model's own words…"; `readPage.test.ts`; `pageReader.test.ts` "checks every redirect…"; `copyFormats.test.ts` "never puts a remote picture or an unsafe link in the HTML"; `anthropic.test.ts` "never adds web_fetch…". Rule tests `renderer.test.ts` (nothing remote in the renderer) and `boundaries.test.ts` (no `web_fetch`). The CSP is in the build. |
| UX for non-technical users | Smoke: every spec checks open windows for raw error text (`expectNoRawErrors` in `tools/smoke/fixtures.ts`). Tests for friendly failures, e.g. `llm.test.ts` "explains a lost connection"; confirm cards in `readPage.test.ts` and `chatLearning.test.ts` "asks on a card first, and a no starts nothing". Tone is prose only. |
| CI | CI itself: `npm ci` fails when `package-lock.json` is out of sync. |
| Docs | `rules/docsDrift.test.ts`: every path it and DEVLOG’s architecture name exists. |
| Otty is heading from | Prose only: a design direction, judged in review against `docs/AUTONOMY.md`. Its hard limits have their own rows (Tool safety, Jobs, Memory). |
| Estimates are effort | Rule test `docsDrift.test.ts` "every Size and Effort is on the effort scale…" (Size and Effort cells in DEVLOG, BRAINSTORM, LAUNCH_READINESS, AUTONOMY and UX_REVIEW) and "no plan gives a time estimate…" (those docs, DESIGN and the screen specs). |
| Keep the docs moving | Partly: `rules/docsDrift.test.ts` fails when a roadmap row and its entry disagree, or a shipped ID still has a DEVLOG entry. Writing the entries stays a process rule. |
| Attachments | Rule tests `preload.test.ts` (ids and names only) and `boundaries.test.ts` (`pdfjs-dist` and `mammoth` by `import()` only, as runtime dependencies; `maskSecrets` in the worker). Test `code.test.ts` (files) "hides well-known key shapes anywhere"; `trust.test.ts` "takes out key shapes but leaves NAME=value as the user wrote it". Test `hiddenLines.test.ts` (hinted lines never reach otty.db or a request, D-40). |
| Hotkeys | Smoke `launch.smoke.ts` (shortcuts registered). Prose only for *no panel views that only work in one column*: a layout judgement. |
| Window states | Test `roomy.test.ts` (the Dock before Expand's move and after Shrink's, the level, traffic lights and minimum size, bounds off every display, closing). Smoke `window.smoke.ts` (Expand mid-answer, ⇧⌘E, closing). |
| UI work | `npm run screens` compares every preview scene, light and dark, with committed screenshots (CI job `screens`). Using tokens is `renderer.test.ts`. |
| Pick up text | Rule test `boundaries.test.ts` "asks Apple Vision for Chinese before English". Test `ocr.test.ts`. Smoke `pickup.smoke.ts` runs the real helper on English and Chinese. |
| Otty is painted art | Prose only: the frames are generated, and a check would only repeat the script. |
| UI icons are Flaticon UIcons | Rule test `renderer.test.ts` (no emoji in renderer code; no hex colour outside the tokens). |
| Idle budget | Rule test `renderer.test.ts` (every `infinite` animation is reviewed). Test `metrics.test.ts`. Smoke `idle.smoke.ts` fails on a smooth endless animation on the idle otter. The number itself is measured by hand with `OTTY_METRICS=1`. |
| Whole-screen capture uses desktopCapturer | Test `wholeScreen.test.ts` "shows the friendly notice when macOS refuses…" and "hides the windows for the capture, then brings them back". |
| Logs and diagnostics | Test `log.test.ts` "masks a key, takes out the home folder and cuts a long line" and "tees main’s warnings and errors into otty.log…"; `settings.test.ts` "never saves a key in plain text, and says why" and "ignores the shell’s key in the installed app". Rule test `build.test.ts` (the fuses). Smoke `help.smoke.ts` (`@step-134`). Prose only for *never log a chat*: a log line's content can't be checked statically. |
| Services live in src/shared/services | Test `services.test.ts` "finds every preset at its own address"; `settings.test.ts` "never hands one service's key to another". |
| The proofread card's marks | Test `diff.test.ts`; `Markdown.test.tsx` "marks what changed against the highlighted text". |
| Memory | Test `memory.test.ts` "counts as told only when the user's own words ask for it", "isn't fooled by a page reworded by the model…", "keeps only counts"; `chatLearning.test.ts` "sends what it knows at the end of the message…", "never lets a memory problem break an answer". |
| Math | Rule test `boundaries.test.ts` (mathjs only in `main/math.ts`, by `import()`). Test `math.test.ts` "what it refuses"; `mathText.test.ts` "leaves prices and code alone". |
| Try again and Edit | Test `rewind.test.ts`. |
| IPC | Rule test `ipc.test.ts`: no handler outside `ipc/check.ts`, the preload's channels match `CHANNELS`, and a fuzz test sends wrong input to every channel and from wrong views. The split of `index.ts` (D-45) is prose only: a layout, judged in review. |
| Turns belong to chats | Test `chatLearning.test.ts` "carries on when the user moves to a new chat, and only the shown chat reaches the windows" and "still replaces the answer on a new question in the same chat". |
| Jobs | Rule test `jobs.test.ts` (only the runner changes a job). Tests `jobs.test.ts` (jobs) "resumes at every step after being killed…" and "waits about an address that's only in the brief…"; `toolSafety.test.ts` "keeps anything that changes something out of a job"; `jobs.test.ts` "job states", "saving steps" and the claim contract (D-42, D-43). Prose only for *copy never says job*: a word check would trip on code names. |
| Tool safety | Tests `toolSafety.test.ts` and `runGuards.test.ts` (the taint matrix, Claude's search going off, the lasting list from the table, a claim refused after a restart). `allowed` is required by the type. Smoke `ruleOfTwo.smoke.ts`; eval cases `injection-search-capture` and `injection-search-plain`. |
| Scheduled jobs | Test `scheduled.test.ts` "uses a single timer…", "asks first when it is more than a day late", "stays paused after a restart…"; `chatLearning.test.ts` "always shows a card in plain words…".. Tests `pauseUntil.test.ts` and smoke `schedule.smoke.ts` "Pause for an hour…" (D-39). |
| Used | Test `chatLearning.test.ts` "shows which memories matched the question, and only those". |
| Smoke harness | `tools/smoke/check-release.mjs` in CI; smoke `harness.smoke.ts` "every way out of the machine is refused". Rule test `boundaries.test.ts` (no test hooks in `src/`). |
| Eval | Test `eval.test.ts` (the scorers). Prose only for *run it after a prompt change*: it needs a key; `npm run verify` says when it applies. |
| Drawings | Test `sanitize.test.ts`, `draw.test.ts`, `slides.test.ts`, `drawing.test.ts`. |
| Action ledger | Tests `ledger.test.ts` (both backends, masking, forgetting, a failing ledger never throws) and `rewind.test.ts` "reads its list from the action ledger…". Smoke `ledger.smoke.ts`. |
| Logbook | Tests `logbook.test.ts` (each view's sources, order, folding, search, masked text, details without the brief), `jobs.test.ts` "hears a steering note once, at its next step, and the note opens nothing…", `receipts.test.ts` "takes a reminder back from the Logbook too…". Smoke `logbook.smoke.ts`, `ledger.smoke.ts`. |
| Home | Tests `home.test.ts` (the status sentence by priority, Needs you matching the Logbook's view, ticks in order and folded, counts from the logs, first run), `Home.test.tsx` (no empty blocks, deciding by id). Smoke `home.smoke.ts`. |
| What left the Mac | Typecheck (`activeProvider(sent: SentTag)`). Rule test `requests.test.ts` (every call passes a tag; searches and pages are recorded). Test `sent.test.ts`. |
| Monthly limit | Test `repeat.test.ts` "the monthly limit"; `trust.test.ts` "the monthly limit (D-33)". |
| Repeating jobs | Test `repeat.test.ts` "repeating jobs"; `trust.test.ts` "repeats (D-34)". |
| Charts | Test `chart.test.ts` "hands the model the same numbers the chart shows" and "keeps what the data says out of the diagram's code"; `eval.test.ts` "the chart scorer". |
| Usage meter | Test `usage.test.ts`; `trust.test.ts` "says so in friendly words, never money". |
| Health | Test `health.test.ts`, `suggestions.test.ts`. Prose only for *a chip never sends* until renderer tests (D-48 phase 2). |
| Confirm cards | Tests `receipts.test.ts` (a receipt however the card ends, Undo only when recorded, a skip on a new question), `cards.test.tsx` "ignores a click in its first 400 ms…" and "approves nothing on Enter on the card itself". Rule test `ipc.test.ts` (each `SETTABLE` key refuses what isn't one). Test `drafts.test.ts` and `MessageBox.test.tsx` for the one message box and drafts kept in main. |
| Step cards | Rule test `osascript.test.ts` (model text reaches `osascript` only through argv; no shell). Test `act.test.ts`; `chatLearning.test.ts` "shows a card with no chip, flags risky steps and acts only in the asking app". |
| Every iteration ends with | Partly: `rules/docsDrift.test.ts` fails when CLAUDE.md or DEVLOG's architecture names a path that's gone. The pass itself stays a process rule. |
