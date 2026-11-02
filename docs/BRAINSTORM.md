# Otty — Feature brainstorm

A living list of ideas, so every iteration can ask: *what would make Otty more of a smart, friendly on-screen pet that helps with anything?*

## The vision, in one breath

> A small otter that lives on your screen, notices what you're looking at, and helps with whatever it is (explaining, fixing, writing, remembering, doing) in plain words and in your language, without ever making you feel stupid or watched.

Three pillars. An idea should push at least one of them without hurting the others:

1. **Alive**: it feels like a pet, not a window.
2. **Aware**: it understands what's on screen and what you're trying to do.
3. **Able**: it can actually help you get the thing done, safely.

Under all three: **trust**. Non-technical users first, privacy by default, confirm cards before anything with side effects.

## How to use this doc

- Add ideas freely, one line each, in the right section. Give each one **Impact** (H/M/L), **Effort** (S/M/L) and a pillar.
- Status: `idea` · `considering` (worth a design sketch) · `→ D-n` (promoted to [DEVLOG.md](DEVLOG.md)) · `shipped` (see [CHANGELOG.md](CHANGELOG.md)) · `parked` / `rejected` (always with a reason, so we don't re-argue it).
- At the start of each iteration, re-rank the `considering` items and promote 1–3 to the dev log.
- Signals to watch: what users type after the clarify card ("other" intents), errors they hit, and features they ask for.

---

## Alive: pet and personality

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Eyes follow the cursor (slow poll in main while idle; nothing while hidden) | H | S | considering |
| Moods: sleeps after ~10 min idle (Zzz), wakes on hover, startled when grabbed, wiggles when dropped, cheers on success, head-tilt on errors | H | S–M | considering |
| Edge docking: drag to a screen edge and it tucks in, ears peeking | H | M | considering |
| Speech-bubble micro-replies from the otter itself ("Copied!", "Reminder set for 5pm") instead of opening a window | M | S | considering |
| Cursor-following mini otter or a "?" that pops up near a fresh text selection (needs an AX selection observer, Swift helper) | H | L | idea |
| Light memory of the user ("prefers short answers", "learning Spanish"): an editable facts list in Settings, added to the prompt | H | M | idea (future), tracked in issue #17 |
| Daily greeting / gentle streaks ("3 things learned this week") | L | S | idea |
| Seasonal or unlockable accessories (hat, scarf) | L | M | idea |
| Sound effects (opt-in, soft squeak on pop-up) | L | S | idea |
| Respect `prefers-reduced-motion` across every new animation | M | S | idea (rule for all motion work) |

## Aware: understanding the screen and intent

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Frontmost app, window title and page URL as context | H | S | shipped |
| Intent classifier for no-prompt captures (fix error, summarize, …) with a clarify card | H | L | → D-1 |
| Local OCR (Apple Vision) for snips: classifier input and text for non-vision models | H | M | → D-1 (part) |
| Learn from intent corrections on-device (retrain the head from `intent_feedback`) | M | M | idea |
| Grow the intent list from "other" requests (e.g. `fill_form`, `compare`, `schedule`) | M | S each | idea |
| Snip the whole window or screen, not just a box | M | S | idea |
| **Several captures in one question** (a capture tray, across apps): "compare these two charts", "this error vs. these docs". While the panel is open a hotkey adds instead of replacing, up to 4, each with its own app tag; Compare / Summarise all actions. [Issue #13](https://github.com/eiffelcsy/otty-assistant-macos/issues/13) | H | M | idea |
| Read the current page's main text (Readability-style) when asked "summarize this page" | H | M | idea |
| Attach files (PDF, Word, images, text) from the Mac and ask about them | H | M–L | → D-6 (#16) |
| Attach the file selected in Finder with ⌥Space | M | S | → D-6 (bonus) |
| Local retrieval for big documents: chunk, embed with the D-1 encoder, send only the relevant parts | M | M | → D-6 v2 |
| OCR for scanned PDFs with the D-1 `otty-ocr` helper | M | S | idea, after D-1 + D-6 |
| Excel / PowerPoint / Pages attachments | M | M | idea, after D-6 |
| Proactive (opt-in) paw-raise when an error dialog appears: "Want me to explain this?" (AX notifications) | H | L | idea, careful about feeling watched |
| Per-app tips: recognise Excel, Mail, Terminal… and offer app-specific quick actions | M | M | idea, D-1 may cover most of it |

## Able: actions and tools

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Paste back / replace selection: activate the source app and simulate ⌘V with clipboard restore | H | S–M | considering |
| Follow-up questions inside the quick view (don't force "continue in chat") | H | S | considering |
| Better web search (Brave / Tavily, optional key) plus a `read_page` tool | H | M | considering |
| Calendar events (EventKit / AppleScript) with a confirm card | M | S | idea |
| `draft_email`: opens Mail with a pre-filled draft | M | S | idea |
| Timers and alarms | L | S | idea |
| `find_file` via Spotlight (`mdfind`) and "open it" | M | S | idea |
| `open_app` / simple app control ("open System Settings → Wi-Fi") | M | M | idea |
| Voice input: hold the hotkey to talk (Whisper-compatible endpoint, or on-device speech) | H | M | idea |
| Read answers aloud (system TTS), good for accessibility | M | S | idea |
| **"Show me how" guided overlay**: Otty *demonstrates* the steps on screen (a ghost paw cursor moving to the right button, click ripples, ghost text typed into fields, keycap badges for shortcuts) while the user does them. See the concept notes below | H | L | considering (long-term) |
| "Where is it?" spotlight: circle the one button or menu the answer mentions (a first step towards the overlay) | H | M | considering, reuses the D-1 OCR boxes |
| Full computer-use actions (click / type for the user) | H | L | parked: the guided overlay gets most of the value without Otty acting |

## Language and accessibility

Language users: **bilingual / multilingual people who work in English** and sometimes want help in their native language (see D-2).

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Home-language help: English by default, **繁體中文（香港）** on demand (pill, typed-language detection, Explain in Chinese, keep on-screen English labels) | H | S–M | shipped (D-2) |
| Word help for short selections: meaning, home-language translation, example | H | S | shipped (D-2); D-1 will predict it |
| "Bilingual mode": English answers gloss tricky terms inline, e.g. "latency (延遲)" | M | S | idea, an open question in D-2 |
| Personal phrasebook: save word-help cards and review them later (lives in SQLite, D-3) | M | M | idea |
| **Next language:** Taiwan 繁體中文 (`zh-TW`, Taiwan vocabulary such as 軟體／列印), defaulted for `zh-TW` Macs | M | S | considering, first after D-2 |
| Casual written-Cantonese tone option for HK (係、唔、嘅) for chattier answers | M | S | idea |
| Simplified / TW-term drift guard (`opencc-js`, cn → hk after each turn) and a `tools/lang-check` script | L | S | parked: none seen in D-2 testing; revisit if a model change brings slips |
| More home languages after Taiwan (日本語, 한국어, Español, 简体中文…), mostly a prompt and picker change once D-2 is proven | M | S each | idea |
| Pronunciation: speak the English word (system TTS) on the word-help card | M | S | idea |
| UI copy translated (a tiny `t()` dictionary) | L | M | idea: our users work in an English UI, so this is low priority |
| Quick-view action tiles: the panel's grid, but only 2–3 tiles, under the capture in the quick view | M | S | idea, after trying the ↵ default for a while |
| Larger-text mode / adjustable panel font size | M | S | idea |
| Full keyboard navigation audit and VoiceOver labels | M | M | idea |

## Memory, history and data

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Saved chats with Recent chats | H | M | shipped (JSON) |
| SQLite storage, retention setting | H | M | → D-3 |
| Search across chats, the same contract on JSON, SQLite or an online database | H | M | shipped (D-5, JSON) |
| Search filters: by app ("chats from Excel"), by date, with/without files | M | S | idea, after D-5 |
| Semantic search ("that chat about my visa") with the D-1 encoder's embeddings | M | M | idea, after D-1 + D-5 |
| Search results: forget a chat from the results list, "show more" past 20 hits, ↑/↓ + ↵ to open | L | S | idea |
| Pin a chat / pin the panel open | M | S | idea |
| Export a chat (Markdown / PDF) | L | S | idea |
| Optional encrypted iCloud sync between Macs | M | L | idea |
| Encryption at rest for the database (SQLCipher or a safeStorage-wrapped key) | M | M | idea |

## Trust, setup and platform

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Test names the model and warns about no vision | M | S | shipped |
| CI: typecheck and build on every PR, then tests, then an unsigned `.dmg` artifact | H | S | → D-4 |
| Sign and notarize (Developer ID) so permissions survive updates; custom `.icns` | H | M | considering, needed before sharing builds |
| Launch at login | M | S | idea |
| Auto-update (electron-updater) | M | M | idea |
| Provider presets in Settings (DeepSeek, OpenAI, local Ollama) with a model picker | M | S | idea |
| Fully local mode (local LLM via an Ollama-compatible endpoint) for privacy-first users | M | S | idea, the base URL setting already almost allows it |
| "What Otty sent" transparency view per message (context, app note) | M | S | idea |
| Usage / cost meter for the user's own key | L | S | idea |
| Native Swift shell if Electron size or feel becomes a problem | M | L | parked until there's a reason |

## UX polish backlog

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Unseen-answer dot on the otter | M | S | shipped |
| UIcons instead of emoji on tool chips | L | S | shipped |
| Customisable hotkeys with a key recorder (not a text field) | M | S | idea |
| Remember the panel's size and position per display | L | S | idea |
| Smooth hand-off animation from quick view to panel | L | S | idea |
| Otty follows you across desktops (Spaces): the quick view stops closing on a switch, plus a "show over full-screen apps" setting; see the concept note below | M | S | decided, not built; build with #13 |

## Parked / rejected (with reasons)

- **Open the panel without trying ⌘C when nothing is highlighted.** *Rejected:* Otty can only find out whether something is highlighted by trying to copy it, and showing the panel first would take focus and lose the selection. If the wait feels slow, shorten the clipboard poll instead (it currently waits up to about 420 ms).
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
1. **"Where is it?" spotlight.** After an answer mentions a button, circle it on screen (OCR box, one-off, no session).
2. **Static numbered markers** for a multi-step answer on the current screen.
3. **The animated ghost paw with step-by-step waiting:** the full overlay.
4. *(Much later, opt-in)* narrow "do this one step for me" actions with a confirm card, if users ask for them.

**Depends on:** the D-1 OCR helper (text boxes), a Swift AX helper (also wanted for the selection observer), vision-capable models with decent grounding, and signed builds (so permissions survive updates).

### Desktops (Spaces) and full-screen apps

**Today.** All three windows are set to show on every desktop, including over full-screen apps (`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` in `windows.ts`). In practice:
- **The otter** is on every desktop.
- **The quick view** hides as soon as it loses focus, so switching desktops closes it.
- **The panel**, once open, follows you to whichever desktop you switch to.

**Decision: everything follows you; the quick view stops closing on a desktop switch.** One new setting for full-screen apps.

| Window | Today | Proposed | Why |
| --- | --- | --- | --- |
| Otter | Every desktop and full-screen app | Keep. Add a setting, **"Show the otter over full-screen apps"** (on by default) | It's the entry point, so it should always be there. But it can get in the way of a full-screen presentation or video; the hotkeys still work when it's hidden |
| Quick view | Closes when you switch desktops (it hides on blur, and a switch blurs it) | **Follow you**, like the panel. Still closes on Esc, ↵ "continue in chat", or a click elsewhere on the same desktop | Collecting captures across apps (#13) often means switching desktops mid-question; closing on the switch throws that away |
| Panel | Follows you while open | Keep | It's a companion to the work, not part of one desktop. Following you is also what makes "capture on one desktop, capture on another" (the capture tray, #13) work. Esc closes it |

**Making the quick view follow (implementation notes)**
- `quick.on('blur', hide)` can't tell a desktop switch from a click elsewhere. On macOS, subscribe to `NSWorkspaceActiveSpaceDidChangeNotification` (`systemPreferences.subscribeWorkspaceNotification`). On blur, wait a moment before hiding, and cancel the hide if the desktop just changed.
- **Don't take focus back after the switch.** The hotkeys copy the selection with ⌘C in the frontmost app; if the quick view grabbed focus, the next capture would copy from Otty instead. So after a switch it stays visible but unfocused.
- **That needs a new way to dismiss it.** Esc only reaches a focused window, so: a visible ✕ on the card, Esc once you click back into it, or closing it when you start typing or clicking in another app. Decide this alongside the capture tray, since they're one flow.
- Check a full-screen app's desktop too: the quick view already has `visibleOnFullScreen`.

**Open questions**
- Would a "pin the panel to this desktop" toggle be useful, for people who keep one desktop for Otty? Wait until someone asks.
- Should the otter step aside while the screen is shared or recording? macOS doesn't make this easy to detect; revisit with the native helper.
