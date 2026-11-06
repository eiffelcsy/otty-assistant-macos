# Otty — Feature brainstorm

A living list of ideas, so every iteration can ask: *what would make Otty more of a smart, friendly on-screen pet that helps with anything?*

## The vision, in one breath

> A small otter that lives on your screen, notices what you're looking at, and helps with whatever it is (explaining, fixing, writing, remembering, doing) in plain words and in your language, without ever making you feel stupid or watched.

Three pillars. An idea should push at least one of them without hurting the others:

1. **Alive**: it feels like a pet, not a window.
2. **Aware**: it understands what's on screen and what you're trying to do.
3. **Able**: it can actually help you get the thing done, safely.

Under all three: **trust**. Non-technical users first, privacy by default, confirm cards before anything with side effects.

The long-run direction, from something you ask to something that looks after things for you, is in [AUTONOMY.md](AUTONOMY.md). Check big features against its checklist.

## How to use this doc

- Add ideas freely, one line each, in the right section. Give each one **Impact** (H/M/L), **Effort** (S/M/L) and a pillar.
- Status: `idea` · `considering` (worth a design sketch) · `→ D-n` (promoted to [DEVLOG.md](DEVLOG.md)) · `shipped` (see [CHANGELOG.md](CHANGELOG.md)) · `parked` / `rejected` (always with a reason, so we don't re-argue it).
- Each table is ordered by **value per effort**: Impact (H 3, M 2, L 1) divided by Effort (S 1, S–M 1.5, M 2, M–L 2.5, L 3). On a tie, ideas nothing blocks come first, then `considering` before `idea`. Below the open ideas come `→ D-n`, then `shipped`, then `parked`.
- At the start of each iteration, re-sort, then promote 1–3 of the best unblocked ideas to the dev log.
- Ask of every idea: **does this get better on its own when the model does?** See "Scaling with better models" below.
- Signals to watch: what users type after the clarify card ("other" intents), errors they hit, and features they ask for.

---

## Alive: pet and personality

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Feature-teaching collection: first snip, first file, first translation each earn a keepsake, so rewards teach what Otty can do | H | S | considering, part of Otty's den |
| Moods: sleeps after ~10 min idle (Zzz), wakes on hover, startled when grabbed, wiggles when dropped, cheers on success, head-tilt on errors. Must stay inside the idle budget (NFR-3): smooth endless animation is what cost 1.6% | H | S–M | considering |
| Speech-bubble micro-replies from the otter itself ("Copied!", "Reminder set for 5pm") instead of opening a window | M | S | considering, Look after me needs it to speak |
| Feed Otty: drop a file or dragged text on the otter to ask about it, with a munching animation | H | S–M | considering |
| More painted expressions through `tools/otty-art/prepare.py`: thinking (eyes up, paw on chin), oops for error cards, listening for the quick view, wink for "Copied" | M | S | idea |
| A simplified small-size head for the 34px header and quick view, where painted fur gets soft | M | S | idea |
| Edge docking: drag to a screen edge and it tucks in, ears peeking | H | M | considering |
| **Otty's den**: a pet home in the panel with shells, a collection and gentle stats, built on the local `counters` table. See the concept note below | H | M | considering |
| Eyes follow the cursor (slow poll in main while idle; nothing while hidden) | H | M | considering: painted frames have no separate pupils, so it needs new art, and polling goes against NFR-3 until D-16 sets a budget |
| Play with Otty: pet it, tickle it, toss it a shell, all local with no model calls | M | S–M | considering, needs the Moods work |
| Cursor-following mini otter or a "?" that pops up near a fresh text selection (needs an AX selection observer, Swift helper) | H | L | idea |
| Sound effects (opt-in, soft squeak on pop-up) | L | S | idea |
| Desktop-pet Otty: full-body sprite or Rive rig that swims around the desktop, floats on its back, peeks from screen edges, and paw-presses buttons (pairs with the "Show me how" ghost cursor) | H | L | idea |
| Daily greeting and a gentle weekly recap ("3 things learned this week"), with no streaks to lose | L | S | considering, part of Otty's den; the useful greeting is under Look after me |
| Seasonal or unlockable accessories (hat, scarf) | M | M | considering, earned in Otty's den |
| Float smoothly only while it matters: on hover or just after an answer, and stepped the rest of the time, so Otty looks alive for almost no battery | M | S | idea |
| Light memory of the user ("prefers short answers", "learning Spanish"): an editable facts list in Settings, added to the prompt | H | M | shipped |
| Painted Otty frames with a blink (idle + eyes-closed) | H | S | shipped |
| Respect `prefers-reduced-motion` across every new animation | M | S | shipped (a global rule in `styles.css` turns off all animation and transitions) |

## Aware: understanding the screen and intent

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Pick up text reads two-column pages properly: spot the columns from the line boxes, so a drag stays in one column | M | M | idea |
| Pick up text on the screen itself: a hotkey that freezes the whole screen with its words selectable, with no snip first | H | M | idea, after D-14 |
| More one-tap page actions next to Summarize: key points, and "what should I do here?" | M | S | idea |
| A soft shutter flash for the whole-screen shortcut, so it feels like taking a picture (needs a brief overlay window; none with reduced motion) | L | S | idea |
| Capture every display at once for people with two screens, offered from the Whole screen label | M | S | idea |
| Pick up text: a snip in a floating window with its words selectable, for ⌘C with no model | H | M | shipped |
| Frontmost app, window title and page URL as context | H | S | shipped |
| Intent classifier for no-prompt captures (fix error, summarize, …) with a clarify card | H | L | → D-1 |
| A **Read this page** tile when the app tag has a web address and nothing is highlighted (one tap to `read_page` + summarize) | H | S | idea, after D-9 |
| Captures in the tray: drag to reorder, or a "replace" mode on ⌥Space for people who want one capture at a time | L | S | idea, after D-8 |
| Copy a pictured table with no model, using Apple's document reader (macOS 26) and `copyFormats` | M | S–M | idea |
| Pick up text opens exactly over the original spot, so the text on screen seems to wake up (D-14's snip knows the rectangle) | M | S | idea, after D-14 |
| Pick up text on attached pictures, and click a detected address, date or phone number to act on it | M | S–M | idea |
| Warm `otty-ocr` after launch, if the idle budget allows, so the first read isn't slow | M | S | idea, after D-16 |
| Local OCR (Apple Vision) for snips: classifier input and text for non-vision models | H | M | → D-1 (part) |
| Learn from intent corrections on-device (retrain the head from `intent_feedback`, which keeps embeddings, not text) | M | M | idea |
| Grow the intent list from "other" requests (e.g. `fill_form`, `compare`, `schedule`) | M | S each | idea |
| Attach the file selected in Finder with ⌥Space | M | S | idea (left out of D-6 v1) |
| Attach files in the quick view: it hides on blur, so a drag from Finder closes it. Needs "don't hide while dragging" or a paperclip there | M | S | idea |
| File quick actions answer in the document's language (a Chinese PDF → a Chinese summary when 繁體中文 is the other language); today actions default to English | M | S | idea |
| History budget for long chats (D-13, proposed): compact old pictures, page reads and documents in rare single steps; recover from a context-length error, which today shows "Something went wrong (error 400)" | M | S | considering, after D-12 step 0 |
| OCR for scanned PDFs with the `otty-ocr` helper | M | S | idea, after D-1 |
| Captures in the tray: drag to reorder, or a "replace" mode on ⌥Space for people who want one capture at a time | L | S | idea |
| Learn from intent corrections on-device (retrain the head from `intent_feedback`, which keeps embeddings, not text) | M | M | idea |
| Scanned PDFs on vision models: render pages to images (needs a canvas in the utility process) | M | M | idea, D-6 v1 says "can't read scans yet" |
| A token-budget setting for attachments, or derive it from the model (v1: fixed ~48K tokens per message) | L | S | idea |
| `.doc`, `.rtf`, `.odt` via macOS `textutil` | L | S | idea |
| Local retrieval for big documents: chunk, embed with the D-1 encoder, send only the relevant parts | M | M | idea (there's no D-6 v2 entry yet) |
| Excel / PowerPoint / Pages attachments | M | M | idea |
| Proactive (opt-in) paw-raise when an error dialog appears: "Want me to explain this?" (AX notifications) | H | L | idea, careful about feeling watched |
| Per-app tips: recognise Excel, Mail, Terminal… and offer app-specific quick actions | M | M | idea, D-1 may cover most of it |
| Snip a single window: hover highlights the window under the paw, click snaps it (window list from a small Swift helper) | M | M | idea, after D-14 |
| More cursor moods: a magnifier paw for tiny targets, a "wave" while waiting for a hotkey release | L | S | idea, after D-14 |
| A **Read this page** tile when the app tag has a web address and nothing is highlighted (one tap to `read_page` + summarize) | H | S | shipped |
| Snip the whole window or screen, not just a box | M | S | shipped for the whole screen; a single window is below |
| Local OCR (Apple Vision) for snips: classifier input and text for non-vision models | H | M | → D-1 (part) |
| Otty's own snip overlay: paw cursor, frozen screen, rounded selection, instant crop | H | M | → D-14 |
| Intent classifier for no-prompt captures (fix error, summarize, …) with a clarify card | H | L | → D-1 |
| Frontmost app, window title and page URL as context | H | S | shipped |
| **Several captures in one question** (a capture tray, across apps): "compare these two charts", "this error vs. these docs". While the panel is open a hotkey adds instead of replacing, up to 4, each with its own app tag; Compare / Summarise all actions. [Issue #13](https://github.com/eiffelcsy/otty-assistant-macos/issues/13) | H | M | shipped (D-8) |
| Read the current page's main text when asked "summarize this page" | H | M | shipped (D-9: `read_page` on the app note's URL; signed-in pages can't be read) |
| Attach files (PDF, Word, images, text) from the Mac and ask about them | H | M–L | shipped (D-6 v1) |

## Able: actions and tools

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Show what Claude's web searches cost in the usage meter, since each one is billed | M | S | idea |
| Copy a proofread reason as a note, or send a whole fix to the phrasebook | L | S | idea |
| Paste back / replace selection: activate the source app and simulate ⌘V with clipboard restore | H | S–M | shipped |
| Follow-up questions inside the quick view (don't force "continue in chat") | H | S | shipped |
| Tables copied from Otty paste as real tables in Word, Pages and spreadsheets | H | S | shipped |
| Better web search plus a `read_page` tool: DeepSeek Search & Fetch, same key (Brave / Tavily if other providers need it) | H | M | shipped (D-9) |
| **Sources row** under answers that searched: site icons, names and dates from the search results (`site_icon`, `site_name`, `date`), each opening the page | M | S | idea, after D-9 |
| Search a site from the app note ("search this site for refunds" → `site:` operator) | L | S | idea, after D-9 |
| **Sources row** under answers that searched: site icons, names and dates from the search results (`site_icon`, `site_name`, `date`), each opening the page | M | S | idea: answers can't load remote images, so main must fetch the icons and pass them as data URLs |
| Check a worked solution: recompute the final answer with `calculate` and flag a mismatch before showing it | M | S | idea, if D-12 isn't enough |
| Calendar events (EventKit / AppleScript) with a confirm card | M | S | idea |
| `draft_email`: opens Mail with a pre-filled draft | M | S | idea |
| `find_file` via Spotlight (`mdfind`) and "open it" | M | S | idea |
| Read answers aloud (system TTS), good for accessibility | M | S | idea |
| Instant answers beyond math: unit and currency conversion, time zones ("3 pm London in HK"), computed locally Spotlight-style before any model call | M | S | idea, after D-12 (currency needs a rates source) |
| Dates in `calculate` ("how many days until 24 Dec", "what date is 90 days after 3 Nov") | M | S | idea, after D-12 |
| "Where is it?" spotlight: circle the one button or menu the answer mentions (a first step towards the overlay) | H | M | considering, reuses the D-1 OCR boxes |
| Voice input: hold the hotkey to talk (Whisper-compatible endpoint, or on-device speech) | H | M | idea |
| **"Show me how" guided overlay**: Otty *demonstrates* the steps on screen (a ghost paw cursor moving to the right button, click ripples, ghost text typed into fields, keycap badges for shortcuts) while the user does them. See the concept notes below | H | L | considering (long-term) |
| Search a site from the app note ("search this site for refunds" → `site:` operator) | L | S | idea |
| Timers and alarms | L | S | idea |
| `open_app` / simple app control ("open System Settings → Wi-Fi") | M | M | idea |
| Sandboxed code runner for data questions on attached CSVs or pasted tables ("which month had the most sales?"): a sealed-off process with no files or network | M | M | idea, after D-12 |
| Follow-up questions inside the quick view (don't force "continue in chat") | H | S | shipped |
| Paste back / replace selection: activate the source app and simulate ⌘V with clipboard restore | H | S–M | shipped |
| Math that's right: instant local answers, a one-request batched `calculate` tool, thinking only for real problems, KaTeX-rendered equations | H | M | shipped |
| Better web search plus a `read_page` tool: DeepSeek Search & Fetch, same key (Brave / Tavily if other providers need it) | H | M | shipped (D-9) |
| Full computer-use actions (click / type for the user) | H | L | parked: the guided overlay gets most of the value without Otty acting |

| Math eval (`tools/math-eval/`, planned in D-12 but not built, because it needs a real key): 40 real-style questions recording correctness, time to first token, tool rounds and cache hits, to tune the tiers. Target: at least 95% correct | M | S | → D-23 |
| `calculate` over a table: let the steps name a highlighted table's columns, so "what's the total of this column?" needs no retyping | M | S | idea, from D-12 |
| Type a sum in the quick view's empty state: show the result live as you type, before ↵ | M | S | idea, from D-12 |
| Currency in `calculate`, with rates from a daily fetch that's plainly dated, since a stale rate is a wrong answer | M | M | idea, from D-12 |

| Step cards from a document: a checklist from a PDF's instructions, where the steps are the user's and the text is only the source | M | S | idea, from D-11 |
| Replay a step card: save one as "how I do this", and offer it next time, so the checklist becomes a personal recipe | H | M | idea, from D-11; leads towards chores |

## Language and accessibility

Language users: **bilingual / multilingual people who work in English** and sometimes want help in their native language (see D-2).

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| "Bilingual mode": English answers gloss tricky terms inline, e.g. "latency (延遲)" | M | S | idea, an open question in D-2 |
| Casual written-Cantonese tone option for HK (係、唔、嘅) for chattier answers | M | S | idea |
| More home languages after Taiwan (日本語, 한국어, Español, 简体中文…), mostly a prompt and picker change once D-2 is proven | M | S each | idea |
| Pronunciation: speak the English word (system TTS) on the word-help card | M | S | idea |
| Larger-text mode / adjustable panel font size | M | S | idea |
| **Next language:** Taiwan 繁體中文 (`zh-TW`, Taiwan vocabulary such as 軟體／列印), defaulted for `zh-TW` Macs | M | S | considering, first after D-2 |
| Quick-view action tiles: the panel's grid, but only 2–3 tiles, under the capture in the quick view | M | S | idea, after trying the ↵ default for a while |
| Personal phrasebook: save word-help cards and review them later (a table in `otty.db`) | M | M | idea |
| Full keyboard navigation audit and VoiceOver labels | M | M | idea |
| UI copy translated (a tiny `t()` dictionary) | L | M | idea: our users work in an English UI, so this is low priority |
| Common mistakes: the proofread card notices what keeps coming up ("you often drop plurals") and offers a short lesson, with D-10's memory | H | M | idea, after D-10 |
| Proofread in a tone: fix mistakes and also make it warmer, firmer or more formal, still as marked changes | M | S | idea |
| Word help for short selections: meaning, home-language translation, example | H | S | shipped (D-2); D-1 will predict it |
| Home-language help: English by default, **繁體中文（香港）** on demand (pill, typed-language detection, Explain in Chinese, keep on-screen English labels) | H | S–M | shipped (D-2) |
| Simplified / TW-term drift guard (`opencc-js`, cn → hk after each turn) and a `tools/lang-check` script | L | S | parked: none seen in D-2 testing; revisit if a model change brings slips |

## Memory, history and data

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Back up and restore chats and memories (export `otty.db` or a JSON bundle; restore on a new Mac) | M | S | idea |
| Search filters: by app ("chats from Excel"), by date, with/without files | M | S | idea |
| Pin a chat (`chats.pinned` is in the schema, and retention already skips pinned chats) / pin the panel open | M | S | idea |
| `recall` tool: the model searches saved chats and follows links when it needs them, so old context isn't carried in every request. Results append, so the cache rule holds; counts as private data | H | M | idea, overlaps "Tools before pipelines" |
| Recent chats past the newest 500: load more as you scroll, or group by month | L | S | idea |
| Find in the quick view too, and in an open explain card | L | S | idea |
| Find bar: "match case" / whole-word toggles for code and English-heavy chats | L | S | idea |
| Search results: forget a chat from the results list, "show more" past 20 hits, ↑/↓ + ↵ to open | L | S | idea |
| Export a chat (Markdown / PDF) | L | S | idea |
| Encryption at rest for the database (SQLCipher or a safeStorage-wrapped key) | M | M | idea |
| Semantic search ("that chat about my visa") with the D-1 encoder's embeddings | M | M | idea, after D-1 |
| Optional encrypted iCloud sync between Macs | M | L | idea |
| Refresh a chat's title when the conversation moves on to something else | L | S | idea |
| Find in this chat (⌘F), highlights and ↵ / ⇧↵ stepping | H | S | shipped (D-7) |
| Saved chats with Recent chats | H | M | shipped (on SQLite since D-3) |
| SQLite storage, retention setting | H | M | shipped (D-3) |
| Search across chats, the same contract on JSON, SQLite or an online database | H | M | shipped (D-5, on SQLite since D-3) |

| Why does Otty think that? Tap a memory in an answer's Noted line to see the sentence it came from, using `source_message_id` | M | S | idea, from D-10 |
| Which memories shaped this answer: a small "Used: learning Spanish" line, so memory is visible when it's read as well as when it's written | H | S | → D-24 |
| Tidy memories now and then: a background pass merges overlaps and asks about stale ones ("still learning Spanish?") | M | S | idea, from D-10; a "Just do it" chore |
| The otter mentions a new habit in a speech bubble, as D-10 planned. Today it's only a Noted line, because the bubble can't talk yet | M | S | idea, needs speech-bubble micro-replies |
| Scope memories by job (AUTONOMY idea 6): chat turns see them, a job only if its recipe says so | M | S | idea, with D-22 |

## Trust, setup and platform

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Launch at login | H | S | → D-27 |
| "What Otty sent" transparency view per message (context, app note) | M | S | idea |
| Say where web lookups really go: with another provider, or when DeepSeek's search fails, queries go to Wikipedia and DuckDuckGo, but Settings → Privacy only mentions DeepSeek | M | S | idea |
| Sign and notarize (Developer ID) so permissions survive updates | H | M | considering, needed before sharing builds |
| Auto-update (electron-updater) | M | M | idea |
| Usage / cost meter for the user's own key (now also counting web searches and page reads, billed per call; per-day `counters` are in the schema) | L | S | idea |
| An Otty test harness: drive the real overlay and windows in Electron with real input, as a repeatable `npm` script rather than one-off scripts | M | M | idea |
| Only run the `dmg` workflow on PRs that change packaging, and allow auto-merge, because Mac runner queues held up a release | M | S | idea |
| Provider presets in Settings (DeepSeek, OpenAI, local Ollama) with a model picker | M | S | shipped |
| Fully local mode (local LLM via an Ollama-compatible endpoint) for privacy-first users | M | S | stretch goal: built, labelled experimental, not fully supported |
| CI: typecheck and build on every PR, then tests, then an unsigned `.dmg` artifact | H | S | shipped (D-4) |
| Test names the model and warns about no vision | M | S | shipped |
| Native Swift shell if Electron size or feel becomes a problem | M | L | parked until there's a reason |

## UX polish backlog

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Customisable hotkeys with a key recorder (not a text field) | M | S | idea |
| File picker's filter leaves out TIFF, BMP and code files that Otty can read (they only show under All files) | L | S | idea |
| Remember the panel's size and position per display | L | S | idea |
| Smooth hand-off animation from quick view to panel | L | S | idea |
| Memory suggestions inbox: suggestions the user didn't answer wait in Settings instead of being lost (`memories.status = 'pending'`) | L | S | idea, after D-10 |
| Unseen-answer dot on the otter | M | S | shipped |
| Otty follows you across desktops (Spaces): the quick view stops closing on a switch, plus a "show over full-screen apps" setting; see the concept note below | M | S | shipped (D-8, the quick view part); the full-screen setting is still an idea |
| UIcons instead of emoji on tool chips | L | S | shipped |

## Speed: spending a fast, cheap model

The model streams quickly, but the first token still takes about a second. So the wins come from starting early (hiding that second) and from running calls nobody would pay for on a pricier model. Measure with D-12's time-to-first-token log before tuning.

**Rules for every idea here:** background calls never touch `ChatSession` history (D-12's cache rule). Speculative calls get no tools, so nothing happens without a confirm card and no per-call search is billed. Nothing is sent until the user has pressed a hotkey, typed, or attached something: no watching the screen.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Search by meaning now: expand a search into related terms and both languages (visa → passport, 簽證) before FTS, then re-rank the top hits. No encoder needed | H | S–M | idea, a bridge to semantic search |
| Intent-lite: one tiny call chooses the tiles for text captures today, as a measured baseline for D-1 | M | S | idea, must follow `intent_feedback`'s no-raw-text rule |
| Answer before ↵: when a hotkey opens the quick view, start the fallback action in the background; ↵ on an empty box shows it at once, typing cancels it | H | S–M | idea, needs a decision: it sends the capture before the user has asked, and NFR-5 says nothing is sent until they do |
| Otty reacts: a model-written one-liner in the speech bubble when a capture lands, kept to a few words and easy to turn off | M | S | idea, extends speech-bubble micro-replies |
| Next-question chips under answers: 2–3 follow-ups for people who don't know what to ask, each pre-answered so a tap is instant | H | M | idea |
| Tone slider for highlighted text: 5 rewrites from shorter to warmer, made in parallel, so the slider moves instantly; pairs with paste back (D-11) | H | M | idea |
| Whole-document reading: raise the 48K budget if the model allows it, or read long files in parallel chunks and merge with page citations | H | M | idea, compare with D-6 v2 |
| Vote before thinking: for D-12's `problem` tier, run 3 parallel non-thinking passes; if they agree, answer, and only use thinking if they don't | M | M | idea, measure in `tools/math-eval/` |
| Second look: a checker reads the finished answer while the user does, and only speaks up if a cited page or fact doesn't hold | M | M | idea |
| Reading buddy: a session the user starts, where each ⌘C gets a small gloss card and a running word list that feeds the phrasebook | M | M | idea |
| Warm explain terms: fetch an answer's `[term](#explain)` cards as soon as it finishes, so a tap opens instantly | M | S | shipped |
| Proofread card for writing in a second language: a highlighted draft comes back as a marked-up diff with one plain reason per fix | H | S–M | shipped |
| Model-written chat titles: replace the cut-off question from `titleFor` with a short real title once the first answer lands, so Recent chats and search read better | M | S | shipped |
| Answer while typing: start speculatively after a short pause so the answer is ready on ↵ | M | M | parked: it sends words the user might delete, which breaks the "nothing until you ask" rule |

## Scaling with better models

Models will keep improving, so Otty should gain from each upgrade instead of being replaced by it. Think of Otty's value as **model × context × hands × trust**: the model is rented, and the other three are what we build. They multiply, so a better model is worth more when Otty sees more, can do more, and is trusted with more.

**Where the gains are**
- **Single answers are near their ceiling.** "Explain this simply" is already good, so a better model adds little that users notice.
- **Multi-step tasks gain most.** Each step has to work, so success compounds: at 90% per step a 10-step task finishes 35% of the time, at 95% it's 60%, and at 99% it's 90%.
- **Some features switch on at a threshold.** Proactive help is annoying when wrong 1 time in 10, and welcome when wrong 1 time in 100.

**Sorting a feature**

| Kind | Better model means | Examples | What to do |
| --- | --- | --- | --- |
| Compounds | Clear gains, sometimes sudden | Step cards, "Show me how", memory, goal mode, checking answers | Build more of these |
| Durable | Unaffected, and no model replaces it | Captures, permissions, confirm cards, the pet, local calculator | Keep investing |
| Flat | Little change | Fixed quick actions | Keep them, but don't lean on them |
| Scaffold | Less needed, or in the way | Fixed intent lists, routing rules, prompt rules for model weaknesses | Keep cheap, and plan its removal |

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Model checks: a short set of real tasks on each service (tools, explain terms, 繁體中文, snips, a long file). The first slice of the Otty eval. D-20 step 6, skipped for now | M | M | idea |
| Model lists from each service's models endpoint, and a starting OpenAI model, so nobody types a name | M | S | idea |
| Remember the model chosen for each service, so switching back doesn't reset it | L | S | idea |
| Close the DNS gap in reading pages from the Mac: pin the checked address for the connection, so a name can't change between the check and the fetch | M | S | idea |
| Otty says plainly when a model can't use tools, instead of quietly going without them | M | S | idea |
| Two model slots, Fast and Best: features ask for a role, not a model name, so background work and hard tasks upgrade separately | H | S | → D-25 |
| Scaffold ledger: note which model weakness each prompt rule or routing step works around, and retest on every upgrade | M | S | idea, needs the Otty eval |
| Otty eval: 50–100 real-style tasks, scored for quality, speed and cost, so any new model is judged in an hour. Grows out of `tools/math-eval/` | H | M | → D-23 |
| Tools before pipelines: let the model pull context when it needs it (read the window, find a file, check the calendar) rather than deciding in code what it sees | H | M | idea |
| Trust ladder: give every tool a risk level and undo, so autonomy widens per action as evals prove reliability (show, then suggest, then do with a confirm) | H | M | idea, the path back to parked computer use |
| Re-read history: after a model upgrade, offer to refresh memories, titles and summaries from saved chats, so old data improves too | M | S–M | idea, after D-10; opt-in, shows the cost first |
| Model-built cards: answers can use a small typed set of tables, checklists and choices, so better models compose better UI with no new code | M | M | idea, D-11 step cards are the first card |
| Goal mode, "Get this done": plan, act, check and report for a stated goal, built on D-11 step cards | H | L | idea, after D-11 |
| Proactive help, gated by measured precision: stays off until evals show it's rarely wrong, and always opt-in | H | L | idea, extends the paw-raise idea |
| Re-test D-1 before building it: compare a plain model call with the local classifier on the same captures, for accuracy, speed and privacy | H | S | → D-1 step 0 |
| Budgets from the profile: derive the 48K file budget and `MAX_TOOL_ROUNDS` from the model instead of fixed constants | M | S | shipped (the file budget); tool rounds are an idea |
| Model profiles: context size, vision, thinking, tool limits per model, replacing DeepSeek-only assumptions such as the `thinking` field on every request | H | S–M | shipped |

## Always there: a companion that stays on

"Always on" means three different things, and they deserve different answers.

| Level | What it means | Possible now? | Verdict |
| --- | --- | --- | --- |
| **Present** | Otty is there from login, alive, and picks up where you left off | Yes, mostly small changes | Build it |
| **Working** | Otty finishes tasks and checks things while you do something else | Yes, while the Mac is awake and signed in | Build it, read-only at first |
| **Watching** | Otty continuously sends what's on screen to a model | Technically yes | Rejected (see below). Local-only noticing is the alternative |

**Rules for background work:** it can read and prepare, but it can't act. Anything with side effects waits for a confirm card when the user is back. Each job shows who asked for it, when it runs and how to stop it. Nothing sensitive needs Full Disk Access: Otty should never ask for it.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Attention budget: everything unprompted shares one small daily allowance, a dismissal shrinks it, and quiet mode always wins | H | S | idea, ships with the first unprompted feature (see AUTONOMY.md) |
| A one-tap way to start a job: a **Look into this** tile, and "keep going" on a report that hit its limit | M | S | idea, after D-22 |
| Pick up where you left off: reopen the last chat's context with a light "Still on the budget?" | M | S | idea, after D-10 |
| The otter shows what's happening: moods mirror jobs (working, waiting for you, something ready), so nobody needs a dashboard. Must stay inside the idle budget | H | S–M | idea, after the first background job |
| Surface budgets: a job returns a headline and a body, and each surface uses what fits (bubble a few words, inbox a few lines, panel the lot) | M | S | idea, with the inbox |
| Ask me later: "check this tomorrow at 9", run read-only, with the result waiting in a small inbox | H | M | → D-27 |
| Watch for me: check a page on a schedule and tell the user when it changes (price, delivery, results) | H | M | idea, after Ask me later; web reads are billed per call, so show the cost |
| "Do not disturb" for Otty: a quiet mode, plus automatic quiet during full-screen video and screen sharing | M | S–M | idea, Look after me needs it |
| Local-only noticing: opt-in triggers from app switches and error dialogs on the Mac; nothing is sent until the user taps | H | L | considering, replaces the paw-raise idea's design; uses the AX helper |
| Morning note: an opt-in daily summary from memories, reminders and the calendar | M | M | idea, grows into the Look after me greeting |
| Finish the idle budget: a run with the panel open, more memory runs to set a limit, and pausing the otter when the display sleeps | M | S | idea |
| Create the panel and quick view on first use, or free them after a long idle, to cut memory (about 100 MB each). Measure the cost to NFR-1 first | M | S | idea |
| An idle check in CI or a script that fails when a change goes over the CPU budget, so an animation can't creep back in | M | M | idea |
| Background activity list: everything running or scheduled, with a stop button | H | S | shipped |
| Survive sleep and wake: pause on sleep, resume on wake, retry after a dropped connection (`powerMonitor`) | M | S | shipped |
| Keep going after closing: a long task carries on when the panel closes, and the unseen-answer dot says when it's ready | M | S–M | shipped |
| Idle budget: set and test limits for CPU, memory and battery, because an always-on app that drains the laptop gets quit | H | S | shipped |

| Say how far it got: a job's report ends with what it read and what it skipped, so a partial answer can be judged | M | S | idea, from D-22 |
| Keep several jobs moving: most of a job is waiting on the network, so two at once may cost little. Measure first | L | S | idea, from D-22 |

## Otty's chores: work Otty starts itself

Otty spots something useful, suggests a small repeatable job, checks it against fixed safety rules, and runs what's allowed. Same direction as Dots, Grok Bot and Muse, but sized for one person's Mac. See the concept note below.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Plain-words approval card: "Every Monday at 9, Otty will read this page and leave a note. It won't send anything." | H | S | → D-27 |
| Tool safety labels: each tool declares what it reads, whether it brings in untrusted content, whether data can leave, and what it changes | H | S–M | → D-26 |
| Daily chore budget and auto-pause on repeated failures or surprises | M | S | considering |
| Injection test set in the Otty eval: hostile pages and documents that try to leak data or trigger tools | H | S–M | → D-23 |
| Private role for chores: send private data only to a chosen model, ideally a local one | M | S | idea, extends Fast and Best slots |
| "Why did this happen?" on every note: follow the links from note to job, trigger, recipe and the chat where the user agreed | M | S | idea, needs ids linked from the start |
| Locked tool set per run: code hands a chore only the tools and sites in its recipe, whatever the model asks for | H | M | considering |
| Standing limits: the user sets a monthly budget and a trusted-sites list once, and Otty works freely inside them, so cards become rare | H | M | idea, after the first chores (see AUTONOMY.md) |
| Chore recipes: a typed plan (trigger, steps, data, sites, output) that the model drafts and code checks | H | M | considering |
| Read first, then lock the doors: fetch public pages with no private data, then do the private step with every tool off | H | M | considering, see also private-only runs |
| Calendar and Reminders reading, opt-in per source, so chores have useful material | H | M | idea, the first connections |
| First chores: page watch, Monday prep, deadline nudge, phrasebook quiz | H | M | idea |
| Chore inbox and history: what ran, what it read, what it cost, with pause and delete | H | M | considering, ships with the first chore |
| Chore suggestions from local habits: Otty notices repeats and offers a chore, at most one a day, and "no thanks" sticks | H | M | idea, after D-10 |
| "Stop asking?": after the user approves the same thing many times, Otty offers to make it standing. Only the user can say yes | M | M | idea, after standing limits |
| Reply to a note: answering an inbox note continues that job with its context, instead of starting a new chat | M | S | shipped |

## Look after me: help nobody asked for

A greeting with a priority list for the next few hours, and wellbeing and productivity suggestions, under one permission. The design is in [AUTONOMY.md](AUTONOMY.md#look-after-me). **All of it is medium priority on purpose:** autonomy compounds, so it waits for a strong foundation (D-23 to D-27, and real use). The model decides what's worth saying. Code decides when it's asked, what it sees and how often it speaks.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| **Look after me** permission: one choice at onboarding, also in Settings, covering wellbeing and productivity suggestions. It only suggests, and says plainly what's sent and how often | M | S | considering, after D-27; NFR-5 first |
| Nudge record: what Otty said, when, and how the user reacted, saved and handed back to the model, so timing can learn and nothing repeats | M | S | considering, with the first nudge |
| Wellbeing nudges: water, breaks, stretching, stopping for the day, from a wellbeing prompt rather than rules | M | S | idea, needs the permission, a way to speak and the attention budget |
| Is the user around? Local checks for at the Mac, idle, on a call and macOS Focus, so nothing interrupts and no call is wasted | M | S–M | idea; extends "Do not disturb" |
| Otty picks its own next look: each run says when to look again, with a shortest gap, a daily cap and a longest gap in code, and local signals can wake it early | M | S–M | idea, after D-27's timer |
| Focus list: a short priority list for the next few hours, from tasks, deadlines and free time | M | M | idea, needs connections |
| Greeting: on first use of the day, a hello with the focus list, in the quick view or a note. Grows out of Morning note | M | M | idea, needs the focus list |
| Private-only runs: a run that holds private data, with web and side-effecting tools off. The reverse of a job, which holds no private data | M | M | considering, needed by the focus list; uses D-26's labels |
| Connections: one general way to link other apps and services as read-only sources of tasks, calendars and messages, each opted into separately. Calendar and Reminders come first | M | L | considering; content counts as private data and outside text at once |

## Parked / rejected (with reasons)

- **Open the panel without trying ⌘C when nothing is highlighted.** *Rejected:* Otty can only find out whether something is highlighted by trying to copy it, and showing the panel first would take focus and lose the selection. If the wait feels slow, shorten the clipboard poll instead (it currently waits up to about 420 ms).
- **Continuous screen watching through a cloud model.** *Rejected:* it would send passwords, banking, medical details and other people's messages to a third party all day, for very little gain over a hotkey, and it goes against "without ever making you feel watched". Cost isn't the blocker: a text capture every 30 seconds is roughly $3–5 a month at today's reported prices. Revisit only if a capable model can run entirely on the Mac, and then still opt-in with a visible indicator.
- **Full computer use.** *Parked:* it needs a careful safety and UX design (confirmations, undo, visibility) before it fits the trust pillar. The **"Show me how" guided overlay** is the preferred direction: Otty shows the steps and the user stays the one who acts. Revisit real automation only for narrow, confirmable actions (e.g. "paste this for me") once the overlay has proven itself.

---

## Concept notes

Longer sketches for big ideas, so the thinking isn't lost. Not plans: a sketch moves to DEVLOG when the idea is promoted.

### "Show me how": guided overlay instead of computer use

**Idea.** For "how do I…" questions, Otty doesn't just write steps; it *shows* them on the real screen, like a tutorial video played over your own apps.
- A ghost cursor (an otter paw, clearly not your pointer) glides to the next button and pulses there.
- Text the user should type appears as faint ghost text inside the right field, with a **Copy** button.
- Shortcuts show as keycap badges (⌘ ⇧ E).
- The user performs each step. Otty never moves the real mouse or sends keys.

**Verdict: no blocker found, and it fits the trust pillar better than computer use**, because the worst outcome of a wrong guess is a wrong pointer, not a wrong action. Concerns and how they'd be handled:

| Concern | Handling |
| --- | --- |
| **Finding the target precisely** (the hard part) | Layered grounding: (1) the macOS Accessibility tree, which gives exact frames for most native buttons and menus (Swift helper; Accessibility is already granted); (2) OCR text match from the D-1 Vision helper, for labelled buttons in web and Electron apps; (3) model-predicted coordinates from a screenshot, only as a last resort and shown with a softer "somewhere here" halo |
| **The screen changes after each step** | Step by step, not a pre-recorded script: show one step, wait for the user (AX focus/value notifications, a screenshot diff, or a **Next** button), then re-capture and plan the next. If a window moves or scrolls, re-ground before animating |
| **Privacy: it needs to see the screen repeatedly** | An explicit "Show me" session that the user starts; a visible "Otty is watching this window" badge; only the frontmost window is captured; **Stop** at any time; nothing saved (same rule as snips) |
| **A wrong pointer still misleads** | Show confidence (exact frame vs. halo). Mark destructive targets (Delete, Erase, Pay, Send) in a warning style with a short caution. Say "I'm not sure, does your screen show X?" rather than guessing |
| **Confusing the ghost cursor with the real one** | A distinct paw shape, translucent, labelled, and it never overlaps the real pointer's position |
| **The overlay blocking the user's clicks** | A full-screen transparent overlay per display with `setIgnoreMouseEvents(true)` (click-through), plus a separate small interactive control (Next / Repeat / Stop). Window level above full-screen apps |
| **Sensitive fields** | Never ghost-type into password or secure-input fields (AX reports secure text fields); just point at them |
| **Latency and cost** | One vision call per step (seconds). Fine for tutorials; cache the plan and only re-ground locally (AX/OCR) when the screen hasn't changed much |
| **Motion sensitivity** | With `prefers-reduced-motion`, use static highlights and numbered markers instead of animation |

**Stepping stones** (each useful on its own):
0. **Step cards (D-11).** The answer's steps as a checklist whose buttons paste, open, click menus and press shortcuts in the source app, with "I'm stuck" re-snipping the window. No overlay yet, but the same step-by-step loop.
1. **"Where is it?" spotlight.** After an answer mentions a button, circle it on screen (OCR box, one-off, no session).
2. **Static numbered markers** for a multi-step answer on the current screen.
3. **The animated ghost paw with step-by-step waiting:** the full overlay.
4. *(Much later, opt-in)* narrow "do this one step for me" actions with a confirm card, if users ask for them.

**Depends on:** the D-1 OCR helper (text boxes), a Swift AX helper (also wanted for the selection observer), vision-capable models with decent grounding, and signed builds (so permissions survive updates).

### Desktops (Spaces) and full-screen apps

**Today.** All three windows are set to show on every desktop, including over full-screen apps (`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` in `windows.ts`). In practice:
- **The otter** is on every desktop.
- **The quick view** follows you (since D-8): a blur caused by a desktop switch no longer hides it, and it doesn't take focus back. It still closes on a click elsewhere on the same desktop, unless **＋ add more** is on.
- **The panel**, once open, follows you to whichever desktop you switch to.

**Still open: one setting, "Show the otter over full-screen apps"** (on by default). The otter is the entry point, so it should always be there, but it can get in the way of a full-screen presentation or video. The hotkeys still work when it's hidden.

**Open questions**
- Would a "pin the panel to this desktop" toggle be useful, for people who keep one desktop for Otty? Wait until someone asks.
- Should the otter step aside while the screen is shared or recording? macOS doesn't make this easy to detect; revisit with the native helper.

### Otty's den: feeding, play and cosmetics

**Idea.** Using Otty looks after Otty. Real help becomes food, play is a small break, and both fill a cosy den where the user's collection and stats live. Cosmetics come later, on top of the same loop.

**The loop**
- **Feed:** a question is a meal, and each kind of capture is its own food (a highlight, a snip, a file). Dropping a file on the otter is the most literal version, and it's useful in its own right. Otters crack shellfish on their bellies, so a cracked shell can be the "got it" moment.
- **Play:** pet, tickle or toss a shell. All of it runs locally, with no model calls and no cost.
- **Earn:** shells for the first use of each feature, for variety, and for a small daily allowance.
- **Spend (later):** hats, scarves, den decorations, seasonal items.

**Rules, so it stays a friend and not a chore**

| Concern | Rule |
| --- | --- |
| **Guilt** | Otty never gets hungry, sad, sick or lost. No decay, no broken streaks, no "Otty missed you" notifications. Being away just means a happy hello |
| **Rewarding pointless questions on the user's own key** | Daily shell cap, and rewards for variety and first-time use rather than volume. Never reward tokens or spend |
| **Feeling watched** | Counts only, never content, kept on the Mac (`counters` is already built for this). A Settings switch turns the den off, and a reset clears it |
| **Interrupting work** | Rewards appear in the den or as a small otter animation, never as a popup over the user's task |
| **Feeling judged** | Stats celebrate ("12 new words this month") and never rank, compare or show a falling score. No invented numbers such as "hours saved" |
| **Pay-to-win** | Cosmetics are only cosmetic. No feature is ever locked behind shells |
| **Motion** | With `prefers-reduced-motion`, swap animations for still frames |

**What the den shows:** Otty at home, shells, the keepsake collection (locked ones hint at the feature: "Snip something on screen"), and a few friendly stats such as things learned, words looked up, favourite app and languages used.

**Build notes**
- `counters` already exists and nothing writes to it yet. `kind = 'pet'` covers the events, so counts need no schema change. Check whether unlocks fit there too, or need a table before the schema is released.
- The den is a new `view` in `Panel.tsx`, plus a `den` scene in `tools/ui-preview`.
- Accessories go inside `.otter-body` so they bob and wiggle with Otty. They need painted overlays made by `tools/otty-art/prepare.py`, must line up with every frame, and must still read at 34px.
- Play needs more painted expressions (see the Alive table). The bubble window may also need room around the otter for tossed shells.

**Stepping stones**
1. Count events locally and show the den with stats and keepsakes.
2. Feeding by drag and drop, then petting and play.
3. Shells, then cosmetics with one or two painted accessories to prove the pipeline.
4. Seasonal items and den decorations.

**Open question:** should chats with "remember chats" off still count? Counts hold no content, but the safest default is to follow that setting.

### Otty's chores: safe proactive work

**Idea.** Otty does useful things without being asked, inside limits that hold even if the model is wrong or tricked. The model proposes; code decides.

**Why a model can't be the safety check on its own.** Claude Code's auto mode, the inspiration here, has more than a classifier: read-only tools pass on a fixed allowlist, project edits rely on version control, and only the rest goes to the model check. Anthropic reports the full pipeline missed 17% of real overeager actions and 5.7% of synthetic data-theft attempts, and says it doesn't replace careful human review for high-stakes work. Otty's users have no version control to fall back on and may not be watching. So a classifier can only make a decision stricter, never looser.

**The flow**
1. **Notice:** local habits and repeats suggest a chore. The user can also ask for one.
2. **Draft:** the model writes a typed recipe: trigger, steps, data, sites, output.
3. **Check:** code works out the level from the tool labels. A model review may raise the level, never lower it.
4. **Agree:** a plain-words card, then one supervised first run so the user sees a real result.
5. **Run:** only the recipe's tools and sites exist for that run. Results go to the inbox.
6. **Report:** a history of what ran, what it read and what it cost, with pause and delete.

**Levels**

| Level | Example | Consent |
| --- | --- | --- |
| **Just do it** | Better chat titles, tidying memories, a phrasebook quiz: nothing new leaves the Mac and nothing visible changes | Covered by one setting |
| **Agree once** | Watch a page, Monday prep from the calendar: a new data source or site | One card per recipe, and again if its scope changes |
| **Ask each time** | Add a reminder, draft a reply, open a link: Otty prepares it and waits with a confirm card | Every time |
| **Never** | Send, pay, delete, post, sign in, enter passwords, or use Full Disk Access | Not available to chores |

**The core rule (Rule of Two).** A run may have at most two of: private data, untrusted content, a way for data to leave. Hostile text on a page can instruct a model, so the danger is all three together.

| Chore | Private | Untrusted | Can leave | Result |
| --- | --- | --- | --- | --- |
| Watch a public page | No | Yes | Fixed site only | Fine |
| Summarise my week from saved chats | Yes | No | No | Fine |
| Compare today's news with my notes | Yes | Yes | Must be no | Split it: read first with no private data, then process with every tool off |

**Ways data can leave that are easy to miss:** `read_page` URLs, search queries, images in answers, links the user clicks, and the clipboard. Each needs its own rule. "Not sending anything" isn't true while any of these is open.

**Stepping stones**
1. Add tool labels. Remote images and unknown `read_page` addresses are already closed (see CHANGELOG); search queries and the silent clipboard are still open.
2. Injection tests in the Otty eval.
3. **Just do it** chores, with the inbox and history.
4. **Agree once** chores: page watch first, because it holds no private data.
5. Chore suggestions from habits.
6. Widen levels only as evals show it's safe.

**Open questions**
- Should private-data chores be offered at all while the model is a cloud API? They only send what the card names, but the card must say where it goes.
- Which reads count as private by default? Start with everything except public web pages.
