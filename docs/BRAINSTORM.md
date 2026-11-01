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
| Light memory of the user ("prefers short answers", "learning Spanish"): an editable facts list in Settings, added to the prompt | H | M | idea |
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
| Read the current page's main text (Readability-style) when asked "summarize this page" | H | M | idea |
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
| Full computer-use actions (click / type for the user) | H | L | parked: a big trust and safety design is needed first |

## Language and accessibility

Language users: **bilingual / multilingual people who work in English** and sometimes want help in their native language (see D-2).

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Home-language help: English by default, **繁體中文（香港）** on demand (pill, typed-language detection, Explain in Chinese, keep on-screen English labels) | H | S–M | → D-2 |
| Word help for short selections: meaning, home-language translation, example | H | S | → D-2 / D-1 `define` |
| "Bilingual mode": English answers gloss tricky terms inline, e.g. "latency (延遲)" | M | S | idea, an open question in D-2 |
| Personal phrasebook: save word-help cards and review them later (lives in SQLite, D-3) | M | M | idea |
| **Next language:** Taiwan 繁體中文 (`zh-TW`, Taiwan vocabulary such as 軟體／列印), defaulted for `zh-TW` Macs | M | S | considering, first after D-2 |
| Casual written-Cantonese tone option for HK (係、唔、嘅) for chattier answers | M | S | idea |
| More home languages after Taiwan (日本語, 한국어, Español, 简体中文…), mostly a prompt and picker change once D-2 is proven | M | S each | idea |
| Pronunciation: speak the English word (system TTS) on the word-help card | M | S | idea |
| UI copy translated (a tiny `t()` dictionary) | L | M | idea: our users work in an English UI, so this is low priority |
| Larger-text mode / adjustable panel font size | M | S | idea |
| Full keyboard navigation audit and VoiceOver labels | M | M | idea |

## Memory, history and data

| Idea | Impact | Effort | Status |
| --- | --- | --- | --- |
| Saved chats with Recent chats | H | M | shipped (JSON) |
| SQLite storage, search, retention setting | H | M | → D-3 |
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

## Parked / rejected (with reasons)

- **Open the panel without trying ⌘C when nothing is highlighted.** *Rejected:* Otty can only find out whether something is highlighted by trying to copy it, and showing the panel first would take focus and lose the selection. If the wait feels slow, shorten the clipboard poll instead (it currently waits up to about 420 ms).
- **Full computer use.** *Parked:* it needs a careful safety and UX design (confirmations, undo, visibility) before it fits the trust pillar.
