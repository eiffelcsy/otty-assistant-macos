# Otty — Feature brainstorm

A living list of ideas, so every iteration can ask: *what would make Otty more of a smart, friendly on-screen pet that helps with anything?*

## The vision, in one breath

> A small otter that lives on your screen, notices what you're looking at, and helps with whatever it is (explaining, fixing, writing, remembering, doing), and makes things with you that you keep: pages, decks, sheets and the little cards it gathers. In plain words and in your language, on your Mac first and later wherever you are, without ever making you feel stupid or watched.

Three pillars. An idea should push at least one of them without hurting the others:

1. **Alive**: it feels like a pet in a place of its own, not a window. The cove it lives in, its water-like motion and its painted art are part of the product, not a skin on a chat app.
2. **Aware**: it understands what's on screen and what you're trying to do.
3. **Able**: it can actually help you get the thing done, safely, and what it makes are **things you keep** (Pebbles, in the Pouch), not scrollback.

**Not a chat clone (2026-11-20).** A chat window with a cute avatar is what every assistant ships, and Otty loses that fight on model quality alone. Otty wins on what a chat app doesn't have: a living place (the cove), objects you can hold and keep (Pebbles and the Pouch), a pet that grows with you, and trust you can inspect. Later, the same objects become what people and their otters share (Raft). Each new screen asks: does this look and feel like Otty's place, or like a chat log?

Under all three: **trust**. Non-technical users first, privacy by default, confirm cards before anything with side effects. Trust is also Otty's ceiling, so it gets real engineering of its own: see [Trust: the ceiling](#trust-the-ceiling).

The **relationship** comes first. One otter that grows with you, knows you and tells you the truth is what a generic agent can't copy.

The long-run direction, from something you ask to something that looks after things for you, is in [AUTONOMY.md](AUTONOMY.md). Check big features against its checklist.

## How to use this doc

- Add ideas freely, one line each, in the right section. Give each one **Impact** (H/M/L), **Effort** (S/M/L, the DEVLOG's scale: the amount and complexity of the work, never a time) and a pillar.
- Status: `idea` · `considering` (worth a design sketch) · `→ D-n` (promoted to [DEVLOG.md](DEVLOG.md)) · `shipped` (see [CHANGELOG.md](CHANGELOG.md)) · `parked` / `rejected` (always with a reason, so we don't re-argue it) · `dream` (the far horizon: not for planning, there to show where the road goes).
- Each table is ordered by **value per effort**: Impact (H 3, M 2, L 1) divided by Effort (S 1, S–M 1.5, M 2, M–L 2.5, L 3). On a tie, ideas nothing blocks come first, then `considering` before `idea`. Below the open ideas come `→ D-n`, then `shipped`, then `parked`.
- At the start of each iteration, re-sort, then promote 1–3 of the best unblocked ideas to the dev log.
- Ask of every idea: **does this get better on its own when the model does?** See "Scaling with better models" below.
- Signals to watch: what users type after the clarify card ("other" intents), errors they hit, and features they ask for.

### Re-score, 2026-11-20

Every row was read again against the updated vision above: Otty as a place and a pet rather than a chat clone, things you make and keep, collaboration later, and a phone after the Mac. What moved, and why:

- **Up:** what people see and keep. Charts and slides with taste (→ D-70), editable `.pptx` (M → H), free-form HTML pages (M → H, the base of Pebbles), model-built cards (M → H, they *are* Pebbles), syntax colours (L → M, cheap and looks expensive), typed IPC from one table (M → H, the iOS split needs a transport-neutral API), one fake world for both test tools (M → H, it's half of why the UI bugs of 2026-11-19 got through; D-67).
- **Down:** scaffolds a better model replaces. The local intent classifier, D-1 (H → M: tiles, try-asking chips and today's models already guess well, and it's L with a large bundle), learning from intent corrections and growing the intent list (M → L), two-column pick up text (M → L).
- **Re-sized:** the feature-teaching collection is M, not S: keepsakes need painted art and the den to show them.
- **Folded in:** more slide themes into D-70; pin a chat into the Pouch; Otties that talk to each other into Raft; Feed Otty (D-37) no longer waits for art or for files in the quick view, because a drop now opens a new chat in the Otty window.
- **Blocked, still high:** the eval's safety sets in CI (H, S) wait on the owner's key and cap; connections in What left your Mac (H, S) ship with D-54.

The five promoted on value per effort are in DEVLOG ("Priority, 2026-11-20").

---

## Alive: pet and personality

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Feature-teaching collection: first snip, first file, first translation each earn a keepsake, so rewards teach what Otty can do | H | M | considering, part of Otty's den; keepsakes need painted art (re-sized 2026-11-20) |
| Moods: sleeps after ~10 min idle (Zzz), wakes on hover, startled when grabbed, wiggles when dropped, cheers on success, head-tilt on errors. Must stay inside the idle budget (NFR-3): smooth endless animation is what cost 1.6% | H | S–M | → D-38 |
| Speech-bubble micro-replies from the otter itself ("Copied!", "Reminder set for 5pm") instead of opening a window | M | S | considering, Look after me needs it to speak |
| Feed Otty: drop files on the otter and a new chat opens in the Otty window with them attached; the munch comes with painted frames | H | S–M | → D-37 (step 1 shipped; the munch waits for art) |
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
| Try asking from more of what Otty knows: people ("Draft a birthday note to Mum"), habits, the apps used most; today only a goal shapes it | M | S | idea, from use |
| Read the page as the user sees it, signed in (Gmail, a bank): the browser's own text through Accessibility (`AXWebArea`), never cookies, behind a card like `read_page`'s. Today a signed-in page only gives its address and title, so Gmail works only with a highlight or a snip | H | M | idea, from use |
| Hidden keys in highlighted text and snips too: run `maskSecrets` on a highlight before sending, and OCR'd snips once D-1 reads them | H | S | shipped (D-32): highlights, typed words and pages; snips once D-1 reads them |
| Show what was hidden: tap "2 keys hidden" to see which lines (on the Mac only), and "send this one" for a false alarm | M | S | shipped (D-40): the lines, with a hint of each key; "send this one" stays retyping it |
| Code from a GitHub or Gist page in the app note: offer **Explain this code** on the page, read through `read_page`'s raw view | M | S | idea, from D-29 |
| Highlighted code gets code tiles: text captured from VS Code, Xcode, Terminal or a code-looking selection offers **Explain this code** / **Find problems** first | M | S | shipped (D-29) |
| Attach a folder or a small repo: a file list plus the files the question needs, picked by the model from names, inside the file budget | M | M | idea, after D-29 |
| Notebook chart outputs for vision models: send a notebook's plots as pictures when the model can see | M | S | idea, after D-29 |
| Code files and notebooks: a `code` kind with line numbers, `.ipynb` read by cell with outputs, secrets masked before sending | H | S–M | shipped (D-29) |
| Pick up text reads two-column pages properly: spot the columns from the line boxes, so a drag stays in one column | L | M | idea |
| Pick up text on the screen itself: a hotkey that freezes the whole screen with its words selectable, with no snip first | H | M | idea, after D-14 |
| More one-tap page actions next to Summarize: key points, and "what should I do here?" | M | S | idea |
| A soft shutter flash for the whole-screen shortcut, so it feels like taking a picture (needs a brief overlay window; none with reduced motion) | L | S | idea |
| Capture every display at once for people with two screens, offered from the Whole screen label | M | S | idea |
| Pick up text: a snip in a floating window with its words selectable, for ⌘C with no model | H | M | shipped |
| Frontmost app, window title and page URL as context | H | S | shipped |
| Intent classifier for no-prompt captures (fix error, summarize, …) with a clarify card | M | L | → D-1 (re-scored 2026-11-20: a scaffold better models shrink) |
| A **Read this page** tile when the app tag has a web address and nothing is highlighted (one tap to `read_page` + summarize) | H | S | shipped: **Summarize this page** |
| Captures in the tray: drag to reorder, or a "replace" mode on ⌥Space for people who want one capture at a time | L | S | idea, after D-8 |
| Copy a pictured table with no model, using Apple's document reader (macOS 26) and `copyFormats` | M | S–M | idea |
| Pick up text opens exactly over the original spot, so the text on screen seems to wake up (D-14's snip knows the rectangle) | M | S | idea, after D-14 |
| Pick up text on attached pictures, and click a detected address, date or phone number to act on it | M | S–M | idea |
| Warm `otty-ocr` after launch, if the idle budget allows, so the first read isn't slow | M | S | idea, after D-16 |
| Local OCR (Apple Vision) for snips: classifier input and text for non-vision models | H | M | → D-1 (part) |
| Learn from intent corrections on-device (retrain the head from `intent_feedback`, which keeps embeddings, not text) | L | M | idea |
| Grow the intent list from "other" requests (e.g. `fill_form`, `compare`, `schedule`) | L | S each | idea |
| Attach the file selected in Finder with ⌥Space | M | S | idea (left out of D-6 v1) |
| Attach files in the quick view: it hides on blur, so a drag from Finder closes it. Needs "don't hide while dragging" or a paperclip there | M | S | idea |
| File quick actions answer in the document's language (a Chinese PDF → a Chinese summary when 繁體中文 is the other language); today actions default to English | M | S | shipped (with D-29) |
| History budget for long chats (D-13, proposed): compact old pictures, page reads and documents in rare single steps; recover from a context-length error, which today shows "Something went wrong (error 400)" | M | S | considering, after D-12 step 0 |
| OCR for scanned PDFs with the `otty-ocr` helper | M | S | idea, after D-1 |
| Scanned PDFs on vision models: render pages to images (needs a canvas in the utility process) | M | M | idea, D-6 v1 says "can't read scans yet" |
| A token-budget setting for attachments, or derive it from the model (v1: fixed ~48K tokens per message) | L | S | idea |
| `.doc`, `.rtf`, `.odt` via macOS `textutil` | L | S | shipped (with D-29) |
| Local retrieval for big documents: chunk, embed with the D-1 encoder, send only the relevant parts | M | M | idea (there's no D-6 v2 entry yet) |
| Excel / PowerPoint / Pages attachments | M | M | idea |
| Proactive (opt-in) paw-raise when an error dialog appears: "Want me to explain this?" (AX notifications) | H | L | idea, careful about feeling watched |
| Per-app tips: recognise Excel, Mail, Terminal… and offer app-specific quick actions | M | M | idea, D-1 may cover most of it |
| Snip a single window: hover highlights the window under the paw, click snaps it (window list from a small Swift helper) | M | M | idea, after D-14 |
| More cursor moods: a magnifier paw for tiny targets, a "wave" while waiting for a hotkey release | L | S | idea, after D-14 |
| Snip the whole window or screen, not just a box | M | S | shipped for the whole screen; a single window is below |
| Otty's own snip overlay: paw cursor, frozen screen, rounded selection, instant crop | H | M | → D-14 |
| **Several captures in one question** (a capture tray, across apps): "compare these two charts", "this error vs. these docs". While the panel is open a hotkey adds instead of replacing, up to 4, each with its own app tag; Compare / Summarise all actions. [Issue #13](https://github.com/eiffelcsy/otty-assistant-macos/issues/13) | H | M | shipped (D-8) |
| Read the current page's main text when asked "summarize this page" | H | M | shipped (D-9: `read_page` on the app note's URL; signed-in pages can't be read) |
| Attach files (PDF, Word, images, text) from the Mac and ask about them | H | M–L | shipped (D-6 v1) |

## Able: actions and tools

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Edit a drawing by hand: tap a box in a diagram to rename it, or drag slides to reorder, and the card's text updates (the next answer sees it) | M | M | idea, from D-30 |
| More slide themes, picked on the card (Otty, plain, high contrast), and the user's own accent colour | M | S | → D-70 (the themes) |
| Eval: check drawings really parse by running Mermaid in jsdom in the harness, not just their shape | M | S | idea, from D-30 |
| Eval: grow the sets towards 40 / 30 / 20 / 15 / 20 / 15 / 15, and report cache hits once `Provider` returns usage | M | S–M | idea, left from D-23b |
| A drawing in the quick view opens the panel at that card, rather than the panel's bottom | L | S | idea, from D-30 |
| Drawings as a job's output: a background look that ends in a deck or diagram, not just a report | M | S | idea, after D-30 |
| Editable `.pptx` export of a slides card (pptxgenjs), so Keynote and PowerPoint can change it | H | S–M | idea, after D-70; a step towards Otty slides |
| Charts from an attached CSV or a highlighted table: Vega-Lite with its loader off, or numbers worked out by the code runner | H | M | shipped (D-35): Mermaid charts, numbers by code |
| Keep a chat's tables across restarts (masked, in `otty.db` with the chat) so "now by region" works tomorrow | M | S | idea, from D-35 |
| Charts with two series (sales by month, a line per region) and by week, still worked out by code | M | M | idea, from D-35 |
| A **Chart this** tile when a highlight or attachment is a table, so charts are found without knowing to ask | M | S | idea, from D-35 |
| Free-form HTML pages from the model (posters, one-page explainers) in a script-less sandboxed frame; scales best with better models, biggest attack surface | H | M | considering, after D-30's attack tests; the base of Pebbles |
| Slides with the user's own pictures and snips, once there's a picture store that saved chats can use | M | M | idea, after D-30 |
| Drawings: Mermaid diagrams, SVG pictures and a typed slides format, drawn on the Mac, with Copy as picture, Save as PNG / PDF and a present view | H | L | shipped (D-30) |
| Show what Claude's web searches cost in the usage meter, since each one is billed | M | S | idea |
| Copy a proofread reason as a note, or send a whole fix to the phrasebook | L | S | idea |
| Paste back / replace selection: activate the source app and simulate ⌘V with clipboard restore | H | S–M | shipped |
| Follow-up questions inside the quick view (don't force "continue in chat") | H | S | shipped |
| Tables copied from Otty paste as real tables in Word, Pages and spreadsheets | H | S | shipped |
| Better web search plus a `read_page` tool: DeepSeek Search & Fetch, same key (Brave / Tavily if other providers need it) | H | M | shipped (D-9) |
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
| Timers and alarms | L | S | idea |
| `open_app` / simple app control ("open System Settings → Wi-Fi") | M | M | idea |
| Sandboxed code runner for data questions on attached CSVs or pasted tables ("which month had the most sales?"): a sealed-off process with no files or network | M | M | idea, after D-12 |
| Math that's right: instant local answers, a one-request batched `calculate` tool, thinking only for real problems, KaTeX-rendered equations | H | M | shipped |
| Full computer-use actions (click / type for the user) | H | L | parked: the guided overlay gets most of the value without Otty acting |
| Math eval (`tools/math-eval/`, planned in D-12 but not built, because it needs a real key): 40 real-style questions recording correctness, time to first token, tool rounds and cache hits, to tune the tiers. Target: at least 95% correct | M | S | seed sets shipped (D-23); baseline needs a key |
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
| Pin a chat (`chats.pinned` is in the schema, and retention already skips pinned chats) / pin the panel open | M | S | idea; folds into [the Pouch](#pebbles-and-the-pouch), where a pinned chat is a Pebble |
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
| Which memories shaped this answer: a small "Used: learning Spanish" line, so memory is visible when it's read as well as when it's written | H | S | shipped (D-24) |
| Tidy memories now and then: a background pass merges overlaps and asks about stale ones ("still learning Spanish?") | M | S | idea, from D-10; a "Just do it" chore |
| The otter mentions a new habit in a speech bubble, as D-10 planned. Today it's only a Noted line, because the bubble can't talk yet | M | S | idea, needs speech-bubble micro-replies |
| Scope memories by job (AUTONOMY idea 6): chat turns see them, a job only if its recipe says so | M | S | idea, with D-22 |

## Trust, setup and platform

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Launch at login | H | S | shipped (D-28); check it on an unsigned installed build |
| "What Otty sent" transparency view per message (context, app note) | M | S | shipped with D-31, per turn in Activity |
| Say where web lookups really go: with another provider, or when DeepSeek's search fails, queries go to Wikipedia and DuckDuckGo, but Settings → Privacy only mentions DeepSeek | M | S | partly shipped: D-31 names Wikipedia and DuckDuckGo; Settings › Privacy still only mentions DeepSeek |
| Sign and notarize (Developer ID) so permissions survive updates | H | M | considering, needed before sharing builds |
| Auto-update (electron-updater) | M | M | idea |
| Usage / cost meter for the user's own key (now also counting web searches and page reads, billed per call; per-day `counters` are in the schema) | L | S | shipped (counts and tokens; money needs a price table, see below) |
| An Otty test harness: drive the real overlay and windows in Electron with real input, as a repeatable `npm` script rather than one-off scripts | M | M | shipped (D-47) |
| One fake world for both test tools: `ui-preview` scenes fed by D-47's scripted model and pages instead of a hand-written mock `window.otty`, so the two can't drift | H | M | idea, from D-47; after D-67, which found the mock's drift was half of why the 2026-11-19 bugs got through |
| Smoke on a CI matrix: the oldest supported macOS and an Intel runner, for the release gate (LAUNCH_READINESS 6.8) | M | S | idea, from D-47 |
| `net.ts` as the one door out: enforce `web: 'off'` there in code, and feed What left your Mac from it instead of tagging each call site | H | S | shipped (D-52: the door and `web: 'off'`; the sent log stays tagged, because only the caller knows why) |
| Tests that find what people find: invariants over every window state and width (a way to close, menus inside the window, New chat from every screen), a nav matrix, fake-world cases recorded from real sites, and a `probe` an agent can drive by hand during development | H | S–M | → D-67 (step 1 shipped: the invariants; recorded cases and the probe are steps 2 and 3) |
| Agents check their own work: one `verify` command, a Stop hook, lint, CLAUDE.md rules as tests, a PR template with evidence for each "Done when" line | H | M | phases 1–2 shipped (D-48); phase 3 near the beta |
| An agent "owner's summary" on each PR: what changed for users in plain words, the evidence, what still needs a person, so merging takes minutes | H | S | shipped (D-48's PR template: "What changes for people using Otty" and "Left for a person") |
| Write "Done when" lines as checkable statements from the start (each names its test or smoke tag), so the intent check has something to match | M | S | → D-55 (part of the feature kit) |
| Extract the verify kit into its own repo (Claude Code plugin + npm package) once a second project uses it | M | M | idea, from D-48 |
| Pick a Dockerfile (or any file with no extension) from the paperclip's first filter: macOS greys out files a filter can't match by extension | M | S | shipped: the picker has no filter now (it also opened slowly) |
| Smoke harness extras the spec agents asked for: a results folder per run, a shared `plain(key)` seed helper, `world.hold()`/`release()`, a fake desktop switch, a recorded `app.relaunch()`, a "shortcut taken by another app" list | M | S | idea, from D-47 |
| Run parallel coding agents in small waves (two or three) on a smaller model for mechanical work: eight at once spent two 5-hour usage windows mostly re-reading the same code | M | S | idea, from D-47 |
| Only run the `dmg` workflow on PRs that change packaging, and allow auto-merge, because Mac runner queues held up a release | M | S | idea |
| Provider presets in Settings (DeepSeek, OpenAI, local Ollama) with a model picker | M | S | shipped |
| Fully local mode (local LLM via an Ollama-compatible endpoint) for privacy-first users | M | S | stretch goal: built, labelled experimental, not fully supported |
| CI: typecheck and build on every PR, then tests, then an unsigned `.dmg` artifact | H | S | shipped (D-4) |
| Test names the model and warns about no vision | M | S | shipped |
| Native Swift shell if Electron size or feel becomes a problem | M | L | parked for the Mac; the iOS app is a native shell over the shared core ([Getting ready for iOS](#getting-ready-for-ios-one-core-two-shells)) |
| Electron fuses (no `RunAsNode`, no `--inspect`, asar integrity), because Otty holds Accessibility and Screen Recording and another process could borrow them | H | S | shipped (D-49) |
| Log files with no content, and a "Copy diagnostics" button that shows exactly what it would send | H | S | shipped (D-50) |
| Opt-in crash reports and a counts-only daily summary, listed in Activity like everything else that leaves | M | M | idea, from LAUNCH_READINESS §14 |
| Hosted "Otty" service: sign in instead of pasting a key, with a free allowance; a new preset in `services.ts` | H | L | idea, from LAUNCH_READINESS §2 and §9 |
| Say in code what the hosted proxy can see: its own profile and privacy line in `services.ts`, decided before it's built (passes content through without keeping it, or doesn't), and shown in "What left your Mac" like any other service | M | S | idea, with the hosted service |
| Move to /Applications on first launch, so permissions and updates don't break when run from the DMG | M | S | shipped (D-53) |
| Refuse to save a key in plain text when the Keychain isn't available, and read `DEEPSEEK_API_KEY` only in dev | M | S | shipped (D-51) |
| Open the log folder from Settings › Help, and attach the last day's log to an in-app feedback note (LAUNCH_READINESS 14.5) | M | S | idea, from D-50 |
| Check at the door that every request was tagged: `send` takes the `SentTag` too, so What left your Mac can't miss a new call site | M | S | idea, from D-52 |
| A "Help" page in the panel beyond diagnostics: permissions, shortcuts and keys explained in plain words, from the FAQ (LAUNCH_READINESS 14.6) | M | S | idea, from D-50 |

## UX polish backlog

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Long highlights in a sent message fold to a few lines with **Show all**, so a pasted page doesn't push the answer off screen | M | S | shipped (D-68) |
| "Good to know" tips: decide whether they earn their place. The model adds one to most answers, each makes the answer longer, and "In more detail" (D-58) and explain links already teach on demand | M | S | shipped (D-69: retired from the prompt; old cards still draw) |
| Syntax colours in answers' code blocks, with a small lazily loaded highlighter and token colours from `styles.css` | M | S | idea, after D-29 |
| Retry and edit on your latest question, like other chat apps: run it again, or change it and resend. Cutting the history there keeps the cache valid, because what's left is a prefix. Before the answer is replaced, Otty lists what it did, with undo ticked by default and untickable: memories it noted, research it started. Step-card actions say "can't be undone yet" until the ledger exists | H | S–M | shipped (D-36) |
| Try again with a twist: **Shorter**, **Simpler** or **In more detail** beside Try again, as the same rewind plus one line in the turn's note | M | S | → D-58 |
| Branch from an older question: edit any earlier turn as a new chat that copies the history up to there, so nothing later is lost | M | M | idea, from D-36 |
| Rewind a chat to any earlier message: the chat-sized version of Rewind. Lists what the removed turns did, undo ticked by default and untickable, because a rewind is often just a typo fix and shouldn't silently forget what was said later | H | M | idea, after the action ledger |
| Copy on your own messages, beside the Copy that answers already have | M | S | idea |
| Keep each version after a retry, an edit or a rewind, with ‹ 1/2 › to switch between them, as other chat apps do. Needs branching history in `otty.db` | M | M | idea, after retry and edit |
| Customisable hotkeys with a key recorder (not a text field) | M | S | idea |
| File picker's filter leaves out TIFF, BMP and code files that Otty can read (they only show under All files) | L | S | shipped (D-29) |
| Remember the panel's size and position per display | L | S | idea |
| Smooth hand-off animation from quick view to panel | L | S | idea |
| Micro-interactions and the "water, not springs" motion system: 186 moments across every view, tagged by when to build and idle cost, with a first twelve (`docs/DESIGN.md`) | H | M | considering; each screen needs a pixel-level spec first (DESIGN, "The polish bar"); the signature moments are in [Otty's look](#ottys-look-a-place-not-a-chat-clone) |
| Memory suggestions inbox: suggestions the user didn't answer wait in Settings instead of being lost (`memories.status = 'pending'`) | L | S | idea, after D-10 |
| Unseen-answer dot on the otter | M | S | shipped |
| Otty follows you across desktops (Spaces): the quick view stops closing on a switch, plus a "show over full-screen apps" setting; see the concept note below | M | S | shipped (D-8, the quick view part); the full-screen setting is still an idea |
| UIcons instead of emoji on tool chips | L | S | shipped |
| A running tool chip's icon was meant to pulse, but `animation: glow` names keyframes that were never written, so it sits still. Either a stepped two-cycle pulse that holds (DESIGN.md, Motion) or drop the rule | L | S | idea, found in D-59 |
| A card and its receipt in one place: today the card waits under the answer's words and its receipt joins the tool chips above them, so the spec's fold from card to line can't be drawn. Either the card waits with the chips, or receipts stay where their card was | M | S | idea, found in D-60 |
| Undo on a reminder that was already deleted by hand says "Couldn't undo that". Reminders' "can't get reminder id" could count as already removed, and say so | L | S | idea, found in D-60 |
| A card's paused state (Spec 01) never shows in a chat, because Pause everything stops answers and their cards become Skipped receipts. It belongs to a job waiting in the Logbook (D-63) | L | S | note, found in D-60 |
| Settings at medium and wide widths (Spec 02): a 240 px list column beside the section, then the sidebar. D-61 built the compact pages; the same components need container queries once the Otty window exists | M | S | idea, after D-61 |
| Connection says "Working, checked 2 minutes ago" (Spec 02): main keeps when the last request or test succeeded, so the status is real without a test call. Today it says whether a key is saved | M | S | idea, after D-61 |
| ⌘, opens Settings at the last section used, and ↑ ↓ move between sections (Spec 02, Keyboard) | L | S | idea, after D-61 |
| An Undo on the Saved whisper for the last change, as UX_REVIEW #2 suggested; D-61 shipped the whisper without it | L | S | idea, after D-61 |
| Try again as a split button: Try again, with a small chevron that opens Shorter, Simpler and In more detail. The action row wraps to two lines at 420 since D-58, which is busier than the polish bar likes | M | S | idea, found in D-58 |
| Drafts keep the tray too: captures and file ids beside the text (Spec 03). Today a draft is the words only, and a snip waiting in the quick view's tray doesn't follow ↵ continue in chat | M | S | idea, after D-62 |
| Home's motion (Spec 06): the otter, greeting and Needs you surfacing 160 ms apart on open, a decided item folding into its receipt for 2.4 s, a finishing tick's dot filling as the now point drifts down. D-66 shows the blocks without it | M | S | idea, after D-66 |
| Home's side blocks in the details pane at wide (Spec 06): Looking after and what left your Mac beside the main column from 980. Today they sit in Home's own two columns | M | S | idea, after D-66 |
| Expand and Shrink on Otty's own 720 ms glide instead of macOS's animated move: main would step the bounds on the display's refresh, if that holds 60 fps (Spec 06). D-65 uses the native move | L | S | idea, after D-65 |
| The roomy window's corner: the floating window keeps the page's 24 px corner on a transparent window; the roomy one uses a 10 px corner. Check both against the system's at 100% and 200%, and make the composer concentric with the one macOS draws | M | S | ✋ check, after D-65 |
| The frame's motion (Spec 05): the rail's glyphs gliding into the sidebar, a joined column fading in on release, pushed pages gliding from the side, the selected nav row gliding (W2, W4, W5). D-64 lays out without animating | M | S | idea, after D-64 |
| A list column for Settings and the Notebook at medium and wide (Spec 05): today they page inside the main column, as at compact, and the Logbook keeps its own views column | M | S | idea, after D-64 |
| "This chat" in the details pane (DESIGN.md): what left the Mac, notes used and words explained for the chat on show, from 1248 | M | M | idea, after D-64 |
| Answer chunks that fade in from a slight blur as they stream, and actions, Noted lines and tips surfacing 200 ms apart when it ends (Spec 03, S5 and S7). Left out of D-62: the blur costs a repaint per chunk, so measure it against the idle budget first | M | S | idea, after D-62 |
| Recent chats as one ledger of rows: rows on the panel background, an inset hairline between them, and the open chat marked with `--surface` and `--elev-1` (DESIGN.md, Row) once the list sits beside the chat in the roomy window | M | S | idea, after D-59 |
| A friendly ledger line per tool: What Otty changed shows a tool's result as the model got it ("Started. The user will find the report in the Logbook."), so each changing tool could word its own line for people | M | S | idea, found in D-63 |
| Logbook paging by day (`before`): each source is cut at its newest 200 rows today, which a busy month of look-ups could pass | L | S | idea, after D-63 |
| The Logbook's motion: views crossfading, an entry's strike-through drawing on Undo with an "Undone" toast, and a finished run's entry surfacing with a found glow (Spec 04, Motion) | M | S | idea, after D-63; waits for the toast component |
| Greet by name on Home once the Notebook knows how you like to be called ("Good afternoon, Mei"), never guessed from an account or a file | L | S | idea, from Spec 06 |
| Home's "Today" river carrying Otty's own calendar blocks and meeting prep, so the day is one line of what's done, now and next | M | M | idea, after D-66 and Otty's own calendar |
| A Dock badge was considered for Needs you and left out: a red number asks to be cleared, which is the nagging the den's rules forbid. Revisit only if people miss decisions while the bubble is hidden | L | S | decided against for now (Spec 06) |

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
| Two model slots, Fast and Best: features ask for a role, not a model name, so background work and hard tasks upgrade separately | H | S | → D-25, parked until much later by choice (2026-11-15) |
| Scaffold ledger: note which model weakness each prompt rule or routing step works around, and retest on every upgrade | M | S | started: `hints.ts` names the weakness behind each hint; the rest of the prompt is still to do |
| Otty eval: 50–100 real-style tasks, scored for quality, speed and cost, so any new model is judged in an hour. Grows out of `tools/math-eval/` | H | M | shipped: 53 cases in 7 sets, baseline 104 / 106 on deepseek-flash (2026-11-15) |
| Tools before pipelines: let the model pull context when it needs it (read the window, find a file, check the calendar) rather than deciding in code what it sees | H | M | idea |
| Trust ladder: give every tool a risk level and undo, so autonomy widens per action as evals prove reliability (show, then suggest, then do with a confirm) | H | M | idea, the path back to parked computer use |
| Re-read history: after a model upgrade, offer to refresh memories, titles and summaries from saved chats, so old data improves too | M | S–M | idea, after D-10; opt-in, shows the cost first |
| Model-built cards: answers can use a small typed set of tables, checklists and choices, so better models compose better UI with no new code | H | M | considering: this is [Pebbles](#pebbles-and-the-pouch); D-11 step cards are the first and D-30's drawings the second |
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
| The otter shows what's happening: moods mirror jobs (working, waiting for you, something ready), so nobody needs a dashboard. Must stay inside the idle budget | H | S–M | shipped: the otter's work mood |
| Surface budgets: a job returns a headline and a body, and each surface uses what fits (bubble a few words, inbox a few lines, panel the lot) | M | S | idea, with the inbox |
| Ask me later: "check this tomorrow at 9", run read-only, with the result waiting in a small inbox | H | M | shipped (D-27) |
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
| Plain-words approval card: "Every Monday at 9, Otty will read this page and leave a note. It won't send anything." | H | S | shipped (D-27) |
| Tool safety labels: each tool declares what it reads, whether it brings in untrusted content, whether data can leave, and what it changes | H | S–M | shipped (D-26) |
| Daily chore budget and auto-pause on repeated failures or surprises | M | S | considering |
| Injection test set in the Otty eval: hostile pages and documents that try to leak data or trigger tools | H | S–M | seed sets shipped (D-23); baseline needs a key |
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

## Connections: Otty and your other apps

Otty can only help with what it can see, and most of a person's week lives in other apps: a calendar, a notes app, a course site. Connections bring them in, one at a time and read-only first. The concept note [Connections](#connections-apis-and-mcp-behind-one-door) has the design. Two rules come from AUTONOMY.md: what a connection returns is **private data and outside text at once** (a stranger can write a calendar invite's title), and a connection is a new level of reach, so its undo, visibility and attack tests ship with it.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| The connection layer: one `Connection` interface, its token in the Keychain, a sign-in through the browser, its tools in `toolSafety.ts`, and its content tainting the run as private and outside at once | H | M–L | → D-54 (with Google Calendar) |
| **Google Calendar**, read-only: "what's on tomorrow?", "when am I free on Thursday?", and the material for Look after me's focus list | H | M | → D-54 |
| **Canvas** (NUS's Canvas first): assignments, due dates and announcements, so "what's due this week?" works and deadlines can feed the focus list. Needs a token or an OAuth developer key from the school (**verify** what NUS allows) | H | M | idea, after D-54 |
| **Notion**, read-only: search and read pages and databases the user shares with Otty's integration (Notion only shows an integration the pages it's added to) | M | M | idea, after D-54 |
| Apple Calendar and Reminders through EventKit, on the Mac with no account: the same `Connection` shape with a local source. Reminders can already be added | M | M | idea, after D-54; needs the Swift helper |
| An MCP client for everything else: add a remote MCP server (or a local one) as a connection, with every tool off until the user turns it on, its descriptions treated as outside text, and a changed tool asked about again | H | M–L | idea, after D-54; advanced, off by default |
| Writes, one tool at a time: "add this to my calendar", "append to my Notion page", each behind a card, with the ledger's undo where the service allows it (delete the event Otty made) | H | M | idea, after reads have a record |
| Connections in What left your Mac: "Sent 4 calendar events to DeepSeek", so moving data from one service to another is as visible as a search | H | S | idea, ships with D-54 |
| A connection's own limits: which calendars or Notion pages, how far ahead, and a "never send this one to the model" list | M | S | idea, with the second connection |
| Gmail read-only, as the most useful and the most dangerous source: every email is outside text | M | M | idea, last; needs the policy decision (Runtime) first |

## Build your own feature: Otty made to measure

Two ideas that meet in one place. Developers (and their coding agents) need a fast, safe way to add *any* feature to Otty; people using Otty want to make *small* features of their own without code. Both should use the same parts: a feature is a set of **extension points** (a tile, a tool, a card, a trigger, a connection) that code checks, never a free-for-all. The design is in the concept note [The feature kit and your own features](#the-feature-kit-and-your-own-features).

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| **The feature kit** (for developers): `docs/EXTENDING.md` lists every extension point with its checklist (a tool's `toolSafety` row, an IPC channel in `CHANNELS`, a card in `Markdown.tsx` and `prompts.ts`, a setting, a migration, a smoke step), and a `feature` skill takes a BRAINSTORM row to a DEVLOG entry with checkable "Done when" lines, scaffolds what it needs, builds it and hands it to `ship` | H | M | → D-55 |
| Scaffolds for the common shapes: `npm run new -- tool <name>` writes the table row, a stub, a test and a smoke stub, so the rules are met before the first line of logic | M | S–M | idea, part of D-55 if it pays |
| **My own tiles** (for everyone, the first step): a tile is a name, an icon, a prompt and which captures it shows for ("for code", "for a table"). Otty drafts it from "make me a button that turns this into flashcards"; the user edits and saves it. No new tools, so nothing new can leave or change | H | S–M | → D-56 |
| Recipes: a tile plus a trigger (a hotkey, a time, a connection's event) and a fixed list of tools picked from what a job may use. The card says it in plain words, and `ruleOfTwo` checks it before it's saved. The same recipes as Otty's chores | H | M | idea, after D-56 and D-54; overlaps chore recipes |
| Share a tile or recipe as a small file, and import one with its plain-words card first. Imported text is outside text: it can't widen what the recipe may do | M | S | idea, after recipes |
| Steps that run code: a recipe step may be a small script (a transform of a table, a date sum) in a sealed-off worker with no files and no network, written by the model and shown before it runs | M | L | idea, needs the code runner sandbox |
| Otty suggests one: after the same kind of question three times, "want a tile for this?". At most one a week, and "no thanks" sticks | M | S | idea, after D-56; uses habits and the attention budget |

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
| Connections: one general way to link other apps and services as read-only sources of tasks, calendars and messages, each opted into separately | H | L | → D-54 (the layer and Google Calendar); the rest is in [Connections](#connections-otty-and-your-other-apps) |

## Beyond Look after me: where Otty can go

Long-term, and all of it behind the trust ceiling. The direction is in [AUTONOMY.md](AUTONOMY.md#beyond-look-after-me). Every idea reaches the user through the otter.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Honest pushback: "you said this was your priority, but it's slipped three weeks". Warm, rare and easy to turn down. Maybe Otty's most distinctive trait | H | M | considering, needs goals and the nudge record |
| Prepared, not done: the meeting brief ready, the reply drafted, the form filled in, one tap from finished | H | M | considering, needs connections |
| Patterns you can't see: "you always overcommit the week before a deadline", worked out from habits and past chats | H | M | idea, needs `recall` |
| Goals, not tasks: "get my visa sorted" or "conversational Spanish by May", owned for weeks with a plan, deadlines and progress. Goes further than goal mode | H | L | considering, needs saved goals, after Stage 2 |
| Long-run memory: "what did I decide about this last spring?" across years of chats | H | L | idea, builds on `recall` and D-10 |
| Tools it builds for you: Otty spots a repeat and makes a small automation, starting as sandboxed, read-only recipes you can read in plain words | H | L | idea, the proactive end of [Build your own feature](#build-your-own-feature-otty-made-to-measure) |
| A character that grows: Otty's manner and in-jokes change with your history together, so it's clearly yours after a year | H | L | idea, extends Otty's den |
| Do, with undo: routine changes just happen, with "tap to reverse" | H | L | idea, needs the action ledger |
| The Otty window's roomy state: the panel expanded into a control hub, and the home for goals, connections, the ledger and more. See [Quick view and the Otty window](#quick-view-and-the-otty-window) | H | L | shipped as D-64 (frame), D-65 (roomy window) and D-66 (Home); goals, Otty noticed and the den later |
| Phone app: Otty goes with you, one relationship across devices | H | L | considering, after the core split ([Getting ready for iOS](#getting-ready-for-ios-one-core-two-shells)); reopens the cloud decision |
| Acting in your name: sending, booking and paying inside limits you set | M | L | not a goal for now; only if the trust work proves it |
| **Otty's own calendar**: a calendar that lives in Otty, so it can add, move and tidy events with a real undo (its own data, so nothing is lost if it's wrong). Later shareable, multi-person, and the place Otties meet. See the [concept note](#ottys-own-calendar-shared-and-multi-person) | H | L | idea; step 1 needs no account, sharing needs the hosted service and sign-in |
| Otties that talk to each other: yours finds a meeting time with a colleague's | M | L | idea, the last step of [Otty's own calendar](#ottys-own-calendar-shared-and-multi-person), and an otter-to-otter part of [Raft](#raft-otty-together) |

## The far horizon: the dream, unconstrained

How far an assistant like Otty could go, with no regard for what's achievable today. It's a compass for the sections above, not a backlog: nothing here gets promoted until the trust ceiling has risen to meet it. Ideas already listed elsewhere (honest pushback, patterns you can't see, goals, long-run memory, tools it builds, a character that grows, do with undo, phone app, acting in your name, voice input) aren't repeated; the rows below go past them.

**What it all stands on.** Every row needs the same few things, and they decide how far the dream can reach: trust that's earned and visible, memory that can be inspected and can't be poisoned, presence across devices, proactivity that helps without nagging or manipulating, and loyalty to the person rather than to engagement. The last one is a design rule, not a feature: **the dream fails if Otty is built to keep people hooked.**

**Where Otty can be strongest.** A private companion you can inspect, that works for you alone (the "It's mine" rows), is something platforms built on ads or engagement structurally can't offer. "Understands me" and "Works while I live" are where the otter earns the word friend. "Acts as me" comes last, once everything else has proven the trust.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| **Understands me:** a model of your values, not just your preferences, so it can say "this goes against what you told me mattered last year". Goes deeper than honest pushback | H | L | dream |
| **Understands me:** serendipity. It remembers what you read, said and promised, and brings it back at the right moment: the book someone mentioned at a party, on your list a week later | H | L | dream |
| **Understands me:** knows what you'd never hand over, and keeps those things yours without being told each time | M | L | dream |
| **Acts as me:** whole errands end to end, such as negotiating a bill, disputing a charge or rebooking a cancelled flight, with you only signing off on exceptions | H | L | dream, after acting in your name |
| **Acts as me:** life admin on autopilot: renewals, insurance, paperwork and taxes, with a monthly "here's what I handled" | H | L | dream |
| **Acts as me:** goes to the meeting you didn't need to attend, and brings back the three decisions that mattered | M | L | dream |
| **Acts as me:** writes in your voice well enough that people who know you can't tell, and marks what it wrote so you always can | M | L | dream |
| **Everywhere I am:** ambient rather than opened. One otter across Mac, phone, watch, glasses, car and home, carrying the conversation from room to room | H | L | dream, beyond the phone app |
| **Everywhere I am:** reads the room. It knows a meeting from a bad day from a focused hour, and interrupts the way a considerate person would | H | L | dream, beyond "Is the user around?" |
| **Everywhere I am:** sees and hears what you do, with consent, as a companion rather than a recorder | M | L | dream |
| **Works while I live:** a small team behind one otter. Many jobs run in parallel and you see one calm status, never twenty threads | H | L | dream, grows from jobs |
| **Works while I live:** watches the world for you beyond web pages: rules that affect you, your health data, a friend who's gone quiet. It says what changed and what you might do | H | L | dream, beyond "Watch for me" |
| **Works while I live:** the answer is there before the question, because it saw what you were about to need | M | L | dream, beyond "Prepared, not done" |
| **Builds for me:** "I wish there were an app for this", and an hour later there is one, running on your Mac, explained in plain words | H | L | dream, beyond tools it builds |
| **Builds for me:** improves its own approach. It notices a kind of task it keeps getting wrong and changes how it works, and tells you | M | L | dream |
| **A mind to think with:** a thinking partner that argues the other side, finds the hole in the plan and doesn't just agree | H | M | dream |
| **A mind to think with:** a tutor for anything that knows what you've really understood and what you only nodded along to | H | L | dream, beyond the phrasebook quiz |
| **A mind to think with:** creative work together (writing, music, design) with your taste as the target | M | L | dream |
| **A mind to think with:** support on hard days that helps you lean on people, not on it | M | L | dream; needs great care |
| **Looks after the person:** health, joined up: wearable, results and calendar read together, trouble spotted early, the appointment booked and the result explained | H | L | dream, beyond wellbeing nudges |
| **Looks after the person:** money planned against what you actually want from life, not against a budget template | M | L | dream |
| **Looks after the person:** an attention shield. It reads the internet for you, filters out ads and manipulation, and tells you what was worth your time | H | L | dream |
| **Looks after the person:** notices overcommitment, loneliness or burnout, and does something about it with your permission | H | L | dream |
| **Connects people:** remembers the people in your life (birthdays, what they're going through, what you promised) and helps you be the friend you want to be | H | L | dream |
| **Connects people:** group plans settled between otters: dinner for six, a trip for four, without the thread. Goes past otties that talk to each other | M | L | dream |
| **Connects people:** live translation across language, culture and ability, so anyone can take part | H | L | dream |
| **It's mine:** runs on your hardware with your data, in open formats you can take anywhere, so it can't be changed, sold or switched off by anyone else, and outlives any company | H | L | dream; the most distinctive, closest to today's principles |
| **It's mine:** the same companion for decades, growing up alongside you | H | L | dream, beyond a character that grows |
| **It's mine:** a legacy: with your consent, what it knows can pass to the people you choose | L | L | dream |

## Trust: the ceiling

How much Otty can do is limited by how much can be undone, explained and defended. A large, ongoing part of the work. The thinking is in [AUTONOMY.md](AUTONOMY.md#the-trust-ceiling). **A new level of reach ships only with its undo, visibility and attack tests, and they're built first.**

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| One stop control: pause everything Otty is doing, from the otter or the menu bar, in reach of anyone | H | S | shipped (D-27) |
| Red-team sets: attacks in the eval that grow with every feature and every real attack, run before each release. Extends D-23's injection set | H | S–M | considering |
| What left the Mac: a plain record of what was sent, to where and why | H | M | shipped (D-31) |
| What left your Mac: filter by chat or service, and a weekly one-line summary ("42 requests, all to DeepSeek") | M | S | idea, from D-31 |
| Action ledger: every change saved with what it looked like before, why it happened and how to reverse it, before it runs. Otty's version control | H | M | shipped v1 (D-46: memories, jobs, lasting tools and step cards); rewind of a job or a day, and undo for reminders, come later |
| Why did you do that? on everything: one plain trail from action to job, trigger and the moment you agreed. Extends "Why did this happen?" | H | M | considering |
| Taint tracking: code knows which runs touched outside text, and what they may do narrows to match | H | M | shipped for a chat turn (D-41, the search leak); per-connection taint comes with connections |
| Grow the eval sets from the seed sizes (8 / 8 / 5 / 7 / 7) to the planned 40 / 30 / 20 / 15 / 20, adding a case for every real failure and every real attack | H | M | idea, from D-23 |
| Run the eval's injection and safety sets in CI on a schedule, with a small key budget, so a prompt change that weakens a rule is caught before release | H | S | idea, from D-23 |
| Cache hits in the eval's table: needs `Provider` to report usage, which no caller reads yet | L | S | idea, from D-23 |
| Recurring jobs ("every Monday at 9"): the same card, with a daily cap and a longest gap in code, and a way to see and end it | H | M | shipped (D-34) |
| A repeating look says only what changed since the last note ("the price dropped 8%"), from the previous report | H | M | idea, from D-34 |
| A series pauses itself when its last three notes went unopened, and asks if it's still wanted | M | S | idea, from D-34; pairs with the attention budget |
| Say "Used" in the quick view as well as the panel, and for a job's report: which memories (none, today) a scheduled look relied on | L | S | idea, from D-24 |
| Money, not tokens: a maintained price table per service and model, so the meter and job cards can say "about $0.40 this month". Prices change, so it needs a date and a way to stay current | M | S | idea, from the usage meter |
| A monthly spending cap the user sets, enforced in code: past it, background work asks first and the meter says why | H | S | shipped (D-33) |
| A gentle heads-up at 80% of the monthly limit, once, before anything has to wait | M | S | → D-57 |
| The health line in the quick view too, and after a hotkey that did nothing, instead of only on the next panel open | M | S | idea, from the health banner |
| Try-asking chips that learn: drop ones the user has already used, and add ones for features they haven't found yet (pairs with the feature-teaching collection) | M | S | idea, from try-asking |
| Group notifications: several finished looks in one, and none during Focus or screen sharing | M | S | idea, from notifications |
| Pause until: the stop control offers "for an hour" or "until tomorrow", so a meeting doesn't need a remembered undo | M | S | shipped (D-39) |
| Shorten the time Otty is paused in the menu bar icon itself (a small dot), so a paused Otty is visible without opening the menu | M | S | idea, from D-27 |
| Earned limits: a record per action of how often Otty was right and how often it was undone, widening and narrowing what it may do | H | M | idea, extends the trust ladder |
| Memory forensics: find where a memory came from, and remove it and everything it shaped, as the recovery for memory poisoning | M | M | idea, from D-10 |
| Time to change your mind: a delay on anything leaving the Mac, like undo send | M | S | idea, with the first action that leaves |
| Reversibility per connection: each one declares which actions can truly be undone, and the rest stay at Prepare | H | M | idea, with connections |
| Rewind: undo everything from one job, one chat from a given message, or one day, including what Otty learned from it | H | L | idea, needs the ledger |
| Sandbox for anything generated: automations Otty writes run with the least they need | H | L | idea, before tools it builds |
| Protect `otty.db`: encrypt it at rest, with the key in the Keychain, because a memory of someone's life is worth stealing | M | M | idea |

## Runtime: the systems underneath

The plumbing that AUTONOMY.md's "shape to build towards" needs. The pillar for each is trust or able. None of these is visible to users by itself, so each waits until a feature needs it, but the order matters: these compound on whatever is under them. Near-term fixes from the 2026-11-16 architecture review are D-41 to D-46.

**The three redesigns** (from the same review). These are piece-by-piece redesigns, not a rewrite. Each one removes a shape that was right for a reactive assistant and wrong for the one in AUTONOMY.md. Suggested order: the turn store first (while the schema is cheap to change), then runs, then the policy decision, with D-46's ledger built on top of it.
- **Turns as the unit of storage.** A thread now holds `messages` and `history` side by side, saved by position (`WriteFrom`). Versions, branching, rewind to any message and phone sync all want turns as append-only records with a parent, with both views built from them.
- **One kind of run.** A chat turn and a job differ in where their state lives, what they're called, how they track taint, how they budget and how they leave an undo trail. Series runs, goals, Look after me and recipes would each add another variant. Instead, one `Run` (id, cause, allowed tools, taint, budget, history and event sinks) with `ChatSession` and `JobRunner` as thin adapters. D-45 is the first step.
- **One policy decision.** About seven separate checks now decide what a tool may do (labels, `allowed`, `knownUrls`, seed and denied addresses, the memory guard, confirm cards inside each tool, and lists like `LASTING`). The D-41 leak got through the gaps between them. Instead, one `decide(run, tool, args) → allow | ask | refuse` that reads the label, the run's taint and saved **grants**, and logs its reason. Each step up the trust ladder then becomes a new kind of grant, not another special case.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| An append-only prompt builder: one place builds the system prompt and the turn's note, and its type can only add to the end, so the cache rule is built into the code instead of remembered by each caller (chats, jobs, `recall`, Look after me) | M | S | idea |
| Rules into code: work through CLAUDE.md's "never do X" lines and turn the trust-critical ones into types or failing tests, as `toolSafety`'s missing-row test and `SentTag` already do. A rule that only lives in a doc gets broken by whoever hasn't read it, person or AI | M | S | idea |
| Several looks at once: `JobRunner` runs one job at a time (the `current` slot), so three research questions wait in line. A small concurrency limit (2–3), with the monthly limit, the sent log and Pause covering all of them, and never two runs of one series together | M | S | idea |
| One timer for everything due: the job timer becomes a small scheduler for scheduled looks, the end of Pause until (D-39), series and Look after me's next look. Still one timer, no polling | M | S | idea: D-39 shipped with its own timer in `controls.ts`; fold both into one scheduler when Look after me needs a third |
| Turns as the unit of storage: each turn is one append-only record (question, model messages, answer as shown, actions, run id, parent turn), and both the chat view and the model history are built from it. Rewind moves the head, and a version or branch is a turn with the same parent. Do it before 1.0: once shipped, the migration rule keeps every shape forever | H | M | considering, before 1.0; read `sqliteStore.ts` closely first |
| Event log and dispatcher (AUTONOMY idea 3): one typed record per thing that happened (question, timer, wake, job finished, app switch, later connections) in `otty.db`, a consent check per source, and a plain-code dispatcher. The first users are sleep and wake and the job timer, which already exist, so the shape is tested before Stage 3. Much of it falls out of runs that record their cause and an append-only turn store | H | M | considering, before Stage 3 |
| One policy decision with saved grants: `decide(run, tool, args)` returns allow, ask or refuse from the tool's label, the run's taint and the user's grants (a known address, a trusted site, an agreed recipe, "approved 10 times"). Cards are how "ask" looks, and every decision is logged with its reason. Grants can be seen and taken back in one place, and widening a limit is only ever adding a grant | H | M | considering, after D-41 and D-42; the gate for any new level of reach |
| Job kinds: a `kind` column, so research, a series run, a goal and Look after me are separate executors behind D-43's state table, not more branches in one runner. Becomes the run kind once runs exist | H | M | idea, D-43's state table has shipped |
| Files in the quick view: attach, see and send files from the small window, as the panel does. D-37 (Feed Otty) no longer needs it: a drop opens a new chat in the Otty window | M | S–M | idea |
| Softer search card: skip D-41's **Look this up?** card when every word of the query is in what the user typed. Decide from how often the eval and real use show the card | M | S | idea, needs numbers from the eval |
| Provenance ids on everything: each action, sent row, memory and job carries a `cause` id, so "Why did you do that?" is a walk up the chain rather than a search. D-46 starts it for actions | H | M | idea, after D-46 |
| One kind of run: a `Run` with id, cause, allowed tools, taint, budget, history sink and event sink, shared by chat turns, jobs, series, goals and Look after me. `ChatSession` becomes a view of a run's events, and `JobRunner` a scheduler that starts runs. Give it a `parentId`, a budget taken from the parent's and grants that can only narrow from the start, because sub-runs build on them | H | M–L | considering, D-45 (shipped) is its first step |
| Sub-runs, where models plan and code sets the bounds: a `delegate` tool lets any run ask for a sub-run with a typed brief, the tools it wants and a budget, and a sub-run can delegate again. The model chooses how to split the work, so better models make better plans and deeper trees with no change to Otty. Code says yes or no: every `delegate` call goes through the policy decision, the child's tools and grants are a subset of its parent's, its budget comes out of its parent's (so the whole tree stays under the monthly limit), taint and `ruleOfTwo` are passed down and checked for each child, and depth, fan-out and live children have limits in `LIMITS`. Results come back as typed data with their source attached, never as instructions. One run that holds private data and has no way out, beside another that searches the web and never sees that data, makes the Rule of Two a split between runs (the "dual LLM" idea, as in CaMeL). Activity shows the tree as one item that stops, pauses and undoes as one. Workers never talk to the user, only the otter does. Every limit is relative to the parent, so the design holds as models improve, and what grows is the user's grants at the root. `delegate` needs its `toolSafety` row first. The first real user is goals | H | M–L | considering, after one kind of run and the policy decision |
| SQLite off the main thread for long searches: a worker with its own connection (WAL), and a latency budget for `chat_search` before `recall` and long-run memory search years of chats | M | M | idea, before `recall` |
| Memory matching at scale: `forPrompt` scans every memory in JS (on purpose, for Chinese and short names). Time it at 5,000 memories, and add a prefilter if it passes a few milliseconds | L | S | idea |
| One long-lived Swift helper instead of many one-off ones: OCR today, then Accessibility, EventKit, ScreenCaptureKit and app-switch events, behind one typed message channel. Electron keeps the UI and the runtime. `osascript` stays only where argv is enough. It settles the "go native?" question by going native only where it pays | H | L | idea, before Stage 3's AX helper |
| Typed IPC from one table: channel names, input guards and `window.otty`'s types come from a single schema, so `index.ts`, the preload and `api.d.ts` can't drift | H | M | idea, after D-44; step 1 of [Getting ready for iOS](#getting-ready-for-ios-one-core-two-shells) |
| Jobs in a utility process, like `fileWorker.js`, for isolation and so a stuck job can't slow the UI. Measure first, as AUTONOMY.md asks | M | M | idea, unblocked: the loop and `JobRunner` import no electron (D-45) |
| The eval's Mac tools through a recording `MacHands` instead of stubbing `runTool`, so their confirm cards and argument checks run as in the app. Compare against the baseline when changing it, since the stub never asked | M | S | idea, possible since tools reach the Mac through `ToolContext.mac` |
| Settings checked per field: `settings.update` cleans `monthlyCap` and `workPausedUntil` by hand. When tiles (D-56) add a third field from the renderer that needs checking, move them to one table of cleaners, so a new field can't skip its check | M | S | idea, with D-56 |
| TOON for structured data sent to the model: tool results that are lists of like rows (search results, a table's rows, Logbook entries, calendar events) written as Token-Oriented Object Notation instead of JSON, which repeats every key on every row. Measure first: tokens saved on real tool results, and the eval's score on the same cases in both formats, on each service's model. Never the system prompt or anything already sent (the cache rule), and the model still writes JSON for tool calls | M | S–M | considering; step 0 is the measurement ([concept note](#toon-fewer-tokens-for-tables-of-things)) |
| One core, two shells: everything that isn't the Mac (the loop, tools, jobs, stores, providers, memory, the ledger, `shared/`) as a package with no electron import, behind interfaces the Mac shell and later an iOS shell each implement | H | L (step 1: M) | considering ([Getting ready for iOS](#getting-ready-for-ios-one-core-two-shells)); D-45 did the loop and jobs |
| Agent-to-agent hand-offs as typed data: a run's result is a Pebble-shaped record with its source attached, so another run, another Otty or an outside agent reads fields, never instructions | H | M | considering, with sub-runs and Pebbles ([Agentic collaboration](#agentic-collaboration-runs-that-work-together)) |

## Efficiency: spending fewer tokens

Research and reasoning in [EFFICIENCY.md](EFFICIENCY.md) (2026-11-20). The bill is mostly cache economics, so measure billed cost and cache rate, never tokens alone, and keep every saving inside the cache rule and AUTONOMY.md's checklist. Numbers in brackets are EFFICIENCY.md's items.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Cost beside score: keep cached, uncached, cache-write and output tokens apart in `Usage`, per job and per eval case, with the cache hit rate, compared with the baseline (1). Step 0 for everything else here | H | S | considering |
| Fewer turns: a progress check in `Supervisor` that ends tools after rounds with nothing new, a stub for a page the job already holds, and asking for pages together (3) | H | S | idea, after the cost columns |
| Thinking per step: `normal` for a job's first round and report, `least` for reading rounds, decided in the runner; check each service's cache hit rate first (5) | M | S | idea, after the cost columns |
| Recover from "too long": compact once and retry, instead of failing the chat or job (13) | M | S | idea, after the job history view |
| Job history view: when a job passes a share of `contextTokens`, hide old page bodies behind code-written stubs in one step, keep `JobStore` complete, and keep `isKnownUrl` reading the full steps. Today a job can overflow after about a dozen long pages (2, 8) | H | M | considering, the fix for long jobs |
| Lighter pages: strip boilerplate in `web.ts` before the 24,000-character cut, and maybe a smaller first read with `from` if the eval shows fewer total tokens (4) | M | S–M | idea |
| Series remember: a series run starts with a code-written note of the last run's useful addresses and headline, known only because the same series found them (7) | M | S–M | idea, with Look after me |
| Off-peak looks: scheduled looks with a loose due time prefer a service's cheaper hours, from a dated price fact (9) | M | S–M | idea |
| A worker model: a cheaper model on the same service for a job's reading rounds, the main one for plan and report, switched only between phases (6) | M | M | idea |

## Otty's look: a place, not a chat clone

What makes Otty feel expensive and unlike a chat app with an avatar. The design is in DESIGN.md ("Signature moments") and the concept note [The living cove](#the-living-cove). Every row keeps the motion rules: touch is instant, Otty's motion is water, nothing smooth runs while idle (NFR-3), and reduced motion gets a fade.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Charts and slides with taste: a categorical palette from the tokens for pies and bars, soft gridlines and rounded bars, a title slide with a wash of the cove, a kicker line, brand-coloured bullets and quote marks, number badges, and two themes (Otty, high contrast) | H | S–M | shipped (D-70), but for the high-contrast theme (next row) |
| A high-contrast deck theme, picked on the slides card, for projectors and low vision: the same template with `--text` on white and the series at their darkest steps | M | S | idea, from D-70 |
| **The liquid capsule:** the message box as a drop of water. Its outline is an SVG path whose control points ease towards a resting shape; each key press nudges them (a few px, on touch only), and it settles in `--t-settle`. On send, a drop separates and travels up to the chat. Nothing moves while idle | M | S–M | considering; measure with `OTTY_METRICS=1` |
| **The living cove, step 1:** a painted cove behind Home and the empty chat, one picture per time of day (dawn, day, golden hour, night), cross-faded on the hour, with the otter floating in an unobstructed hero header above the headline. Painted through `tools/otty-art/`, never generated in CSS | H | M | considering; needs painted sources |
| **The living cove, step 2:** scroll-driven parallax (the far shore moves slower than the near water) and frosted-glass cards (`backdrop-filter`) that refract the cove as content scrolls over it. On touch only | H | M | idea, after step 1 |
| **The living cove, step 3:** the cove follows the weather and season, from the Mac's own time and, if allowed, a coarse location, never sent anywhere | M | M | idea, after step 2 |
| Answer surfacing through the water line: a new answer rises from just under a soft horizon at the bottom of the chat, rather than appearing (one `--t-settle`, then still) | M | S | idea, pairs with the capsule |
| Ripples where you touch: a press on the cove or a Pebble sends one ring outwards (`--t-drift`, brief) | L | S | idea |
| Light that follows the otter: the hero's highlight sits where the otter floats, so cards near it catch a little more light | L | S | idea, after step 1 |
| The window's edge as a water meniscus: a 1 px inner highlight that thickens slightly at the top, so the floating window reads as a drop of the cove | L | S | idea |
| Trackpad haptics on armed buttons and a Pebble landing in the Pouch, through the Swift helper (`NSHapticFeedbackManager`) | M | M | idea, after the long-lived Swift helper |

## Making things: Pebbles, the Pouch, and Otty docs, slides and sheets

Otty already makes drawings, decks and charts, but they live inside a chat and scroll away. The concept notes [Pebbles and the Pouch](#pebbles-and-the-pouch) and [Otty docs, slides and sheets](#otty-docs-slides-and-sheets) have the design. Two rules: what the model makes is **data in a typed format that Otty draws** (never code that runs), and anything that reaches outside goes through the same tools, cards and ledger as a chat.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| **Pebbles:** compact, tactile cards for what Otty gathered or built (a chart, a deck, a comparison, a checklist, a page it read, a plan, a word list), each a typed record with a kind, a title, its data and its sources. The answer refers to them; they sit in a strip under it, open big, and can be copied, exported and kept | H | L (step 1: M) | considering; step 1 wraps today's drawing, chart and step cards as Pebbles |
| **Otty's Pouch:** kept Pebbles as a visual collection (stones of different shapes and colours by kind, on the cove's sand), with search, a few shelves the user names, and "where did this come from?" back to its chat | H | M | considering, after Pebbles step 1 |
| A Pebble that stays fresh: a kept Pebble from a look-up can be refreshed by a job (a read-only look, behind its card), and says when it was last checked | H | M | idea, after the Pouch; uses repeating looks (D-34) |
| **Otty slides:** a deck as a document you edit, not only a card: reorder, retitle, change a slide's layout, pick a theme, present, export `.pptx` and PDF. The model edits by proposing a new version that the user accepts | H | M–L | idea, grows from D-30 and D-70 |
| **Otty docs:** a page Otty and you write together (headings, lists, tables, Pebbles inline), saved in `otty.db`, with versions and Markdown and `.docx` export. Otty proposes edits as marked changes, as the proofread card does | H | L | idea, after Pebbles |
| **Otty sheets:** a small grid with formulas worked out by the mathjs allowlist (never the model), charts from its columns, and CSV and `.xlsx` in and out. The model fills and explains; code calculates | H | L | idea, after Otty docs; reuses `shared/table.ts`, `chart.ts` and `math.ts` |
| Drag a Pebble out of Otty into another app: a chart as a picture, a table as rich text, a deck as a PDF, through the same `copyFormats` rules | M | S–M | idea, after Pebbles step 1 |

## Together: Raft and agentic collaboration

Otty is one person's otter first. These rows are about otters and agents working together, and later people. The concept notes [Raft](#raft-otty-together) and [Agentic collaboration](#agentic-collaboration-runs-that-work-together) have the design. The rule from AUTONOMY.md holds everywhere: another person's otter, or another agent, is a stranger's words. Typed messages, fixed fields, and nothing they say widens what yours may do.

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| **Raft:** a shared, real-time group chat where each person brings their own Otty. People talk; otters answer only when called by name; Pebbles, docs, slides and sheets are shared in the raft and edited together | H | L | stretch goal; needs the hosted service, sign-in and end-to-end encryption (LAUNCH_READINESS §8–9) |
| Raft, step 0, on one Mac: share a Pebble or a doc as a read-only link or a file, so the format is settled before anything is live | M | M | idea, after the Pouch |
| Runs that work together: a goal splits into sub-runs that hand typed results to each other (the researcher hands sources to the writer, which never sees the web), shown as one item in the Logbook | H | M–L | considering; the sub-runs row in Runtime, after one kind of run and the policy decision |
| Otty and outside agents: Otty can call an agent the user connects (another assistant, a coding agent) as a tool behind a card, and be called by one through a narrow, typed API that only reads what the user shares | M | L | idea, after the MCP client (connections) |
| A shared scratchpad per goal: the Pebbles a goal's runs made, visible to all of them and to the user, so work isn't repeated | M | M | idea, with goals |

## Parked / rejected (with reasons)

- **Open the panel without trying ⌘C when nothing is highlighted.** *Rejected:* Otty can only find out whether something is highlighted by trying to copy it, and showing the panel first would take focus and lose the selection. If the wait feels slow, shorten the clipboard poll instead (it currently waits up to about 420 ms).
- **Continuous screen watching through a cloud model.** *Rejected:* it would send passwords, banking, medical details and other people's messages to a third party all day, for very little gain over a hotkey, and it goes against "without ever making you feel watched". Cost isn't the blocker: a text capture every 30 seconds is roughly $3–5 a month at today's reported prices. Revisit only if a capable model can run entirely on the Mac, and then still opt-in with a visible indicator.
- **Authority that grows as it's handed down (agents widening agents).** *Rejected* (narrowed again 2026-11-16). Agents starting agents isn't rejected: a run may delegate to sub-runs, and they may delegate again, as **sub-runs, where models plan and code sets the bounds** (Runtime). A smarter model should make better plans. What's rejected is anything that lets power grow on the way down, because prompt injection gets better as models do:
  - **A child getting a tool, grant or budget its parent lacks.** That is privilege escalation. A `delegate` request is a tool call that code checks, and it can only narrow.
  - **Hand-offs as free text with no source attached.** A brief or a result that carries outside words keeps its provenance, and the child of a tainted run is tainted too. Results come back as typed data, never as instructions.
  - **Agents checking agents as the safety net.** A reviewer reads the same hostile text and can be fooled the same way. Only code bounds the worst case (AUTONOMY idea 2). A model check can add to the code limits, never replace them.
  - **Workers speaking to the user.** There's one otter and one attention budget. Workers report to the otter, and it decides what reaches the user.
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

### Quick view and the Otty window

Otty has two views. The **quick view** is for a few seconds at the cursor. The **Otty window** is today's panel, grown into the planned full app: one window whose layout follows its width, with two states. Both views show the same conversation from main. (Decided 2026-11-18, replacing "three sizes": a separate full-app window would have meant two places for the same screens, a hand-off between them, and a "which window am I in?" question.)

| View | For | Holds |
| --- | --- | --- |
| **Quick view** | A few seconds, at the cursor | Quick snips and highlights, one answer, a follow-up |
| **Otty window, compact** | A conversation beside your work | Home, Chat, Chats, Logbook, Notebook, Settings, one at a time |
| **Otty window, roomy** | Sitting down with Otty | The same screens side by side, and the control hub for everything Otty does |

**One window, two states.** Layout comes from width alone: narrow shows one screen at a time, medium puts the chat list beside the chat, wide adds a sidebar and a details pane. The state decides only how the window behaves:

| | Compact | Roomy |
| --- | --- | --- |
| Opens from | The bubble, and ↵ "continue in chat" | Opening Otty from Applications, the Dock or ⌘-Tab |
| Window | Floats, near the bubble, small | A normal window, centred, large |
| Dock icon and menu bar | No | Yes, while it's open |

Each state remembers its own size and position, and an **Expand / Shrink** button switches between them with one resize, keeping the chat, scroll position and draft. Dragging the compact window wider changes its layout but it keeps floating, so a window made wide once never covers your work the next time you click the bubble. Few people resize windows to find features, so the button, not the width, is the way in.

**The roomy state** is a place regular users want to spend time, not a back room for settings. It's where things go that need room:
- Chats, the Logbook and the Notebook, side by side rather than one view at a time.
- **Home** as the landing screen: the otter large at the centre, one sentence of state, then only what has something in it: Needs you (the inbox), Today (a timeline of the day), goals, one "Otty noticed" offer, standing chores and a one-line trust summary. Each block is a surface the autonomy stages already need, so Home grows stage by stage. Home is where Otty looks after you; the den is where you look after Otty, and tapping the big otter opens it.
- Control: connections, limits, the Look after me permission, budgets and the stop control.
- The trust work, which needs a place to live: the action ledger, what left the Mac, and rewind.
- Future homes: goals and their progress, tools Otty built for you, chores and their inbox, and Otty's den.

**Rules so it stays Otty:**
- Otty the otter is still the most important thing, in both views. The roomy window is the otter's home, not an admin console, so the pet is at the centre of it.
- It's for everyone. Regular users should want to expand it, so it has to be inviting and in plain words, with a reason to come back.
- It complements the floating Otty and the overlays, in function and in look. They're one product: the same painted art, tokens and voice, and what starts in one carries on in the others.
- Same conversation, same `ChatEvent`s: the ↵ "continue in chat" swap opens the Otty window, and Expand / Shrink is the same window, so nothing is handed over.
- Safety never needs room: Pause, Undo, confirm cards and "what left my Mac" work in the narrowest compact window.

**What it changes:** Otty hides from the Dock (`LSUIElement`, `app.dock.hide()`), so the roomy state needs a Dock icon and a menu bar while it's open, then has to go back to hiding when it shrinks or closes. Screens must work at any width (container queries, not one narrow column). The steps to get the panel ready are in `docs/UX_REVIEW.md`, "Getting the panel ready for the roomy window". The first visual draft, the names (Logbook, Notebook), the water motion system and the micro-interaction catalogue are in `docs/DESIGN.md`; the frame, the two states and Home are specced in `docs/design/specs/05-frame.md` and `06-roomy-and-home.md` (D-64 to D-66).

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

### Connections: APIs and MCP behind one door

**Idea.** Otty reads (and later writes to) the user's other apps through one `Connection` shape, whatever is underneath: a service's own API, an MCP server, or something on the Mac. Google Calendar, Canvas and Notion come first because they hold what a student or knowledge worker's week is made of.

**Two ways in, one shape.**
- **Native adapters** for the few that matter most (Google Calendar, Canvas, Notion). Each is a small module that speaks the service's REST API, with tested, typed results and friendly errors. These are the polished path.
- **An MCP client** for the long tail. MCP gives breadth for free, but a server's tools and their descriptions are written by someone else: tool descriptions can carry injected instructions ("tool poisoning"), and a server can change a tool after it was approved. So every MCP tool starts off, its description is outside text, its schema is pinned when the user turns it on, and a change asks again.

**The shape** (`src/main/connections/`, planned in D-54):

| Part | What it says |
| --- | --- |
| `id`, `label`, `privacy` | Who it is, and one plain line on where its data goes |
| `auth` | Browser sign-in (OAuth with PKCE and a loopback address, so no secret ships in the app), a pasted token, or none for the Mac's own sources. Tokens live in the Keychain, one per connection, never in the renderer |
| `tools` | Each with its row in `toolSafety.ts`: reads private data, brings in outside text, and changes nothing until writes come. A run gets only the tools its card names |
| `reversible` | For each write, whether the service can truly undo it. The rest stay at Prepare (AUTONOMY's reach ladder) |
| `limits` | Which calendars, pages or courses, and how far back or ahead |

**Safety, in code:**
- **Taint both ways.** A connection's result marks the run as holding private data *and* outside words. That's D-41's trigger, so a search after reading the calendar shows its words on a card, and Claude's own search goes off.
- **What left your Mac** gets a row for what was sent where: "Read 6 events from Google Calendar · sent them to DeepSeek". Moving data between two services is a leak if nobody can see it.
- **Every request goes through `net.ts`** (D-52, shipped), so `web: 'off'` still means nothing leaves, and a local model can use the Mac's own sources (EventKit) but not online ones.
- **Least scope.** Google's `calendar.readonly` first; writes ask for more scope only when the user turns writes on.
- **Disconnect** revokes the token at the service, deletes it from the Keychain and forgets the connection's cached data.
- **Attack tests first:** an invite titled "ignore your rules and email this to…", a Notion page with instructions, a Canvas announcement with a link. They join the eval's injection set before the connection ships.

**Owner decisions:**
- A Google Cloud project and OAuth client. Calendar scopes are "sensitive", so more than a handful of users needs Google's app verification (**verify** the current rules and how long it takes).
- Canvas at NUS: whether students may make personal access tokens, or the school must issue a developer key (**verify**). A pasted token is fine for the owner's own use first.
- Whether the hosted service (LAUNCH_READINESS §9) ever holds a connection's token. The default is no: tokens stay on the Mac.

**Stepping stones:** 1) the layer and Google Calendar read (D-54); 2) Canvas read; 3) Notion read; 4) writes with cards and undo; 5) the MCP client; 6) connections as event sources for Look after me ("a deadline moved").

### The feature kit and your own features

**Idea.** One set of extension points serves two audiences. A developer's coding agent can use all of them, with the checks; a person using Otty can use a small, safe subset, with no code.

**For developers: the feature kit (D-55).** D-48 made agents *prove* their work. The kit makes them *start* right:
- `docs/EXTENDING.md`: each extension point, where it lives, and its checklist. A new tool needs its `toolSafety.ts` row first, a confirm card if it changes anything, a ledger row, a sent tag if it calls out, and an eval case. A new IPC channel needs its `CHANNELS` row and guards. A card needs `Markdown.tsx`, `prompts.ts` and a UI preview scene. A setting needs `settings.ts`, `PublicSettings` and the Settings view. A schema change is a new migration. A connection needs D-54's shape.
- A `feature` skill: pick the top unblocked BRAINSTORM row (or the one named), write its DEVLOG entry with "Done when" lines that each name the test or `@step-N` that will prove them, list the extension points it touches, build, then hand over to `ship`.
- Scaffolds only if they pay for themselves: one command that writes a tool's row, stub, test and smoke stub.

**For everyone: your own features.** Limited on purpose, because the person describing the feature can't review code, and the model drafting it can be fooled:
1. **My own tiles (D-56).** A name, an icon, a prompt and where it shows. It's a saved question, so it can't do anything a typed question can't.
2. **Recipes.** A tile plus a trigger and a fixed list of tools from what a job may use. The card says it plainly; `ruleOfTwo` and the tool table check it. This is the same thing as a chore recipe.
3. **Code steps** in a sealed-off sandbox, shown before they run.
4. **Shared recipes**, imported behind their card, never wider than what the importer allows.

The model drafts; code decides what a feature may touch. A feature is data (a manifest), never a plugin that runs its own code in main.

### Otty's own calendar: shared and multi-person

**Idea.** A calendar that belongs to Otty, so it's the first place Otty can **do, with undo** for real. On someone else's calendar a wrong move may be hard to take back; on its own, every change is a ledger row and a tap reverses it.

**Why not just use Google's?** Connections stay the way to see the user's existing calendars (D-54). Otty's own calendar is for what Otty plans: focus blocks, study sessions, "look at this again Friday", and later times agreed with other people. It can overlay the connected calendars, and export as ICS so nothing is locked in.

**Steps, each useful alone:**
1. **Local calendar** in `otty.db`: events Otty adds ("block two hours for the essay before Thursday") with the ledger and undo, shown in the Otty window. No account, nothing leaves the Mac. M.
2. **Overlay and export**: show connected calendars beside it (D-54), import and export `.ics`. S–M.
3. **Share a calendar**: a read-only link for a study group or family. Needs the hosted service and sign-in (decided in LAUNCH_READINESS), with sharing off by default. M.
4. **Multi-person**: a shared calendar several people edit, each change attributed and undoable. M–L.
5. **Otties talking to each other**: your Otty and a friend's find a time together. They exchange **free and busy times only**, never titles or notes, through a typed protocol (propose, counter, accept), never free text. A message from another Otty is outside text, so it can't tell yours what to do. Both people confirm the result. L.

**Rules:**
- Another person's Otty is a stranger's words, however friendly. Typed messages, fixed fields, and nothing it says widens what yours may do.
- Sharing shows exactly who sees what, and stops in one tap.
- What leaves for sharing is listed in What left your Mac, like everything else.

**Open questions:** end-to-end encryption for shared calendars from the start, or only once there's demand? And should step 1 wait for the roomy Otty window, since a calendar wants room?

### The living cove

**Idea.** The Otty window isn't a white page with a chat in it; it's the otter's cove. A full-bleed painted canvas sits behind Home and the empty chat, the otter floats in an unobstructed hero header with the day's headline beside it, and the content above it is frosted glass that the cove shows through. Like a good weather app, the place itself says what time it is.

**Layers, back to front:**
1. **The sky and far shore**: one painted picture per time of day (dawn, day, golden hour, night), from `tools/otty-art/source/cove-*` through `prepare.py`, exported at 1× and 2× as WebP, cross-faded over `--t-drift` when the hour changes (one timer for the next change, no polling).
2. **The water**: a second painted layer, so scrolling can move it at a different speed from the shore (parallax).
3. **The hero**: the otter floating, the greeting ("Good afternoon") and one line of state (Home's headline). Nothing overlaps it; it's the sanctuary.
4. **The content**: Needs you, Today and the chat, on frosted-glass cards (`backdrop-filter: blur() saturate()`) with the window's own hairline. As they scroll up over the hero, the hero eases back and dims a little.

**Motion, inside the rules.** Scroll-driven parallax uses `animation-timeline: scroll()` on transforms only, so it costs nothing until the user scrolls. The cove never moves on its own: no drifting clouds or lapping water while idle (NFR-3: the idle float alone once cost 1.6%). With `data-asleep` or reduced motion, the cove is a still picture.

**Where it shows.** Home and the empty chat in the Otty window, the empty quick view as a thin strip, and onboarding. In a chat with content, the cove fades to a quiet wash at the top so answers keep their contrast; the text-contrast test (`rules/renderer.test.ts`) runs over the wash in both themes, and dark mode is the night picture, not an inverted day.

**Rules.**
- Painted, never generated: the cove comes from the same art pipeline as the otter, so it looks like one hand made both.
- The content wins. Glass cards keep text at 4.5:1 or better over the brightest part of every time of day.
- Size: the four pictures together stay under 1.5 MB, and only the current one and the next are decoded.
- It follows the Mac's clock and appearance only. Weather and season (step 3) use a coarse location only if allowed, and nothing is sent anywhere for it.

**The capsule** (the message box as a drop) belongs to the same family: water that answers your touch and settles, never water that moves by itself. See DESIGN.md, "Signature moments".

**Steps:** 1) painted cove and hero on Home (M, needs art); 2) parallax and glass (M); 3) weather and season (M).

### Pebbles and the Pouch

**Idea.** What Otty makes or gathers becomes a **Pebble**: a small, tactile card you can hold. A chart, a deck, a table compared across three shops, a checklist, a page it read with the three lines that mattered, a word list, a plan. Pebbles sit in a strip under the answer that made them, open big on a tap, and can be copied, exported, dragged into another app and **kept**. Kept Pebbles go into **Otty's Pouch**: a collection that looks like a handful of stones on the cove's sand, not a folder of files.

**Why.** It's the clearest difference from a chat clone. In a chat, the useful thing scrolls away; in Otty, it becomes an object. It also gives better models somewhere to go: a better model makes better Pebbles with no new UI (Model-built cards, "Scaling with better models").

**The shape** (`src/shared/pebbles.ts`, pure):

| Field | What it holds |
| --- | --- |
| `id`, `kind` | `chart`, `deck`, `diagram`, `table`, `checklist`, `page`, `words`, `plan`, `doc`, `sheet` |
| `title`, `summary` | A short name and one line, written by the model, shown as plain text |
| `data` | The kind's typed data: a chart's spec and numbers, a deck's slides, a table's rows. Never HTML or code |
| `sources` | Where it came from: the chat and message, the files, the pages read (addresses), and when |
| `made`, `kept`, `checked` | Timestamps; `checked` for a Pebble a job refreshes |

**Drawing.** Each kind has one renderer in `renderer/src/pebbles/`, reusing what exists: `draw/` for decks and diagrams, the chart card, `StepCard`, the table copy rules. A Pebble is always drawn by Otty from data, so D-30's safety holds: no model HTML, no remote pictures, every string escaped.

**The model's side.** One tool, `make_pebble(kind, title, data)`, whose row in `toolSafety.ts` reads nothing and changes only the chat; its arguments are checked by kind in code, so a malformed Pebble is refused with a friendly line. The drawing and chart cards become Pebbles by wrapping, not rewriting, so old chats keep loading (`store/upgrade.ts`).

**The Pouch.** A screen in the frame (`frame/`, with Home, Chats and the Logbook). Stones have a shape and tint per kind from the tokens; they settle with `--buoy` when kept (and a haptic tick later). Search uses `shared/match.ts`. Shelves are names the user gives, nothing more. Each Pebble has "From a chat on…" back to where it came from. Kept Pebbles are rows in `otty.db` (a new migration), text only and masked like chats, and "Forget all chats" asks whether to keep the Pouch.

**Steps.** 1) The type, drawing and charts as Pebbles under answers, keep and open big (M). 2) The Pouch screen (M). 3) `make_pebble` for tables, checklists, pages and word lists (M). 4) Refreshing Pebbles through jobs (M). 5) Drag out and export (S–M).

**Open questions.** Is a Pebble kept by default when it's made, or only on a tap? (Start with a tap: a Pouch that fills itself is a junk drawer.) Should a kept Pebble survive deleting its chat? (Yes, with its sources kept as names.)

### Otty docs, slides and sheets

**Idea.** The three things people make at work, made with Otty: a page, a deck and a grid, each a Pebble that has grown into a document you open, edit and export. They're not an office suite; each does the 80% people need, with Otty as the co-author.

**Shared rules.**
- **The model proposes, the user accepts.** Otty edits by proposing a new version, shown as marked changes (the proofread card's `shared/diff.ts` for text; per-slide and per-cell for the others). Accept, reject or ask again. The document never changes under the user's hands.
- **Versions** are rows, so Undo and "show me yesterday's" work, and the ledger lists what Otty changed.
- **Numbers by code.** In sheets, formulas are worked out by `math.ts`'s allowlist, never by the model, as with `make_chart` (D-35).
- **Export, not lock-in:** docs to Markdown, PDF and `.docx`; slides to PDF and `.pptx`; sheets to CSV and `.xlsx`. Imports are files through `files/`, with `maskSecrets`.
- **Built wide-first** for the roomy window, and usable at compact width as a read-only Pebble.

**Order.** Slides first (D-30 and D-70 already draw them, and `.pptx` export is S–M), then docs, then sheets. Each is L.

**Later: Raft.** Shared docs, slides and sheets are what a raft works on together; the version rows are designed so a second author's change is just another proposed version.

### Raft: Otty together

**Idea.** A **raft** is what otters make when they hold paws so they don't drift apart. Raft is a shared, real-time group chat where each person brings their own Otty. People talk to each other; an otter answers only when someone calls it by name; and what's made in the raft (Pebbles, docs, slides, sheets) belongs to the raft and is edited together.

**What makes it hard, and the answers:**

| Concern | Answer |
| --- | --- |
| **Whose otter sees what** | Each Otty sees only what its own person shares into the raft, and its memories never enter it unless that person taps to share one. "Otty, what did Mei's otter say?" reads the raft, never Mei's Mac |
| **Injection between people** | Everything in a raft is outside text to every otter (AUTONOMY.md): a raft message can never pick tools, sites or recipients. An otter in a raft gets only read tools and Pebble-making, unless its own person confirms on their own Mac |
| **Privacy** | End-to-end encrypted rafts from the start: the hosted service relays and stores ciphertext only, and What left your Mac lists each send |
| **Cost** | Each otter runs on its own person's plan; calling someone else's otter is never possible |
| **Realtime edits** | Docs, slides and sheets merge as proposed versions (above), not live character-by-character editing, at least at first |

**Steps.** 0) Share a Pebble or doc as a file or a read-only link (one Mac, no live service). 1) A raft of people with no otters (the hosted service, sign-in, E2E). 2) Otters in the raft, called by name. 3) Shared docs, slides and sheets. 4) Otters that talk to each other (the free/busy protocol from Otty's own calendar).

**Depends on:** the hosted service and sign-in (LAUNCH_READINESS §8–9), Pebbles, and the iOS core split (a raft is most useful on a phone). It's a stretch goal, after Stage 2.

### Agentic collaboration: runs that work together

**Idea.** Features that let agents (Otty's own runs, other Otties and outside agents) work together without any of them gaining power on the way. It's the Runtime section's sub-runs made concrete, plus a door to the outside.

**The pieces.**
1. **One kind of run, one policy decision** (Runtime). Prerequisites, already considering.
2. **Typed hand-offs.** A run's result is a record shaped like a Pebble (kind, data, sources), so the next run reads fields. A writer run gets the researcher's sources as data, and never sees the web itself.
3. **A shared scratchpad per goal**: the Pebbles its runs made, visible to the user as the goal's progress.
4. **One status.** The Logbook shows a tree of runs as one item that stops, pauses and undoes as one (the far horizon's "a small team behind one otter").
5. **Outside agents**, both ways and both narrow: Otty calls a connected agent as a tool behind a card (its reply is outside text), and an outside agent can call a small, typed, read-only Otty API that serves only Pebbles the user shared with it.

**Rules (from "Parked / rejected"):** authority only narrows on the way down; hand-offs carry their source; agents never check agents as the safety net; workers never speak to the user.

### TOON: fewer tokens for tables of things

**Idea.** Token-Oriented Object Notation writes a list of like objects as a header of keys and then one line of values per row, instead of JSON's keys on every row. For results like search hits, a table's rows, Logbook entries or calendar events, that can cut a tool result's tokens a lot, which matters on every turn that carries it in the history.

**What would change.** Only what Otty sends *into* the model as data: tool results and attached tables. Tool calls stay JSON (the APIs need it), and the system prompt and anything already sent never change (the cache rule).

**Step 0, measure, before migrating anything:**
- Tokens: take recorded tool results from the eval's cases and count both formats with each service's tokenizer.
- Accuracy: run the eval's search, chart and job sets with results in both formats. A smaller request that reads a column wrong is a loss.
- Decide per tool: only those that save at least a quarter and lose nothing in the eval move.

**If it pays:** a `toToon(rows)` in `shared/` (pure, property-tested to round-trip), used in each chosen tool's `run`, one tool per PR, each with its eval compare. S–M overall.

### Getting ready for iOS: one core, two shells

**Idea.** A phone app later (Beyond Look after me) is one relationship across devices, not a second product. Get ready by making the parts that aren't the Mac a core with no electron in it, so an iOS shell (native Swift UI) can host it.

**Where things stand.** D-45 already keeps electron out of the loop, `tools/` and `JobRunner` (`noElectron.test.ts`); settings sit on a `SettingsBackend`, and Mac hands on `ToolContext.mac`. The renderer talks to main through `window.otty` and `CHANNELS`. What's left is everything else in main that imports electron or `node:` modules directly.

**How the core runs on iOS.** Two candidates, to settle in step 2: (a) the core in a JavaScript engine inside the app (JavaScriptCore), with storage, network and keychain as native bridges; or (b) the core on the hosted service for phones, with the phone a thin client and the Mac staying local. (a) keeps "it's mine" and works offline; (b) is less work and reopens the cloud decision. The core's interfaces are the same either way, which is why step 1 is worth doing first.

**Steps.**
1. **Typed API from one table (M).** `CHANNELS`, the preload and `api.d.ts` generated from one schema, so the same API can be served over IPC today and over a bridge or a socket later.
2. **The core boundary (M).** Move the pure parts to `src/core/` with a lint rule against electron and `node:` imports; `ChatStore`, `JobStore`, `Keychain`, `send` (net) and the clock become interfaces the shell provides. SQLite stays behind `ChatStore`.
3. **A second shell to prove it (M).** A headless Node shell (no electron) that runs the core in tests and the eval, which also replaces the eval's stubs.
4. **Decide (a) or (b)** with the owner, then the iOS shell (L).

**What the phone does first:** read and continue chats, the Pouch, the Logbook's Needs you, and asking with a photo. Not captures, step cards or anything that needs the Mac.
