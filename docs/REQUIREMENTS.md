# Otty — Functional Requirements (MVP)

Otty is a cute otter assistant for macOS. It floats on screen as a small button, and it answers questions about whatever you highlight or snap on screen, in plain language that non-technical people can follow.

**Design principle:** UX comes first. Every feature has to work for someone who has never heard of an "API", a "hotkey" or a "prompt".

---

## 1. Users & goals

| Persona | Goal |
| --- | --- |
| Curious learner (student, parent, retiree) | "What does this paragraph / chart / error mean?" without copy-pasting into a website |
| Office worker | Quick summaries, rewrites, translations of on-screen text |
| Anyone stuck | A friendly helper that explains jargon instead of adding more |

## 2. Tech stack (decided)

| Layer | Choice | Why |
| --- | --- | --- |
| Shell | **Electron** (latest) | Fastest route to a polished, transparent, always-on-top UI; easy global shortcuts, tray and clipboard |
| Build | **electron-vite** + Vite | One config for main, preload and renderer, with hot reload |
| UI | **React + TypeScript**, plain CSS with design tokens | Simple, no CSS framework to learn |
| Markdown | `react-markdown` + `remark-gfm` | Rich answers with clickable "explain" terms |
| LLM | **DeepSeek `deepseek-flash`** over the OpenAI-compatible `/chat/completions` API, called with raw `fetch` + SSE | No SDK lock-in. Base URL and model can be changed in Settings, so any OpenAI-compatible provider works |
| Screen capture | macOS built-in `screencapture -i` | The native crosshair box-drawing UX Mac users already know |
| Selected text | Copy-and-restore clipboard trick (simulated ⌘C via `osascript`) | Works in nearly every app; needs Accessibility permission |
| Secrets | Electron `safeStorage` (backed by the macOS Keychain) | The API key never touches the renderer or plain disk |
| Storage | SQLite (`otty.db`) through Electron's built-in `node:sqlite`, FTS5 trigram search | No native module to rebuild; sub-millisecond writes; full-text search in English and Chinese; room for memories and intent feedback |
| Web | DeepSeek Search & Fetch APIs when the provider is DeepSeek; Wikipedia + DuckDuckGo otherwise | Same key as the model, no extra account |
| Packaging | electron-builder → `.dmg` | Unsigned for the MVP; signing and notarization come later |

## 3. Functional requirements

Priority: **P0** = must ship in today's MVP, **P1** = should ship if time allows, **P2** = later.

### FR-1 Floating otter button (P0)
- FR-1.1 A small (~80 px) round otter button floats above all windows and all Spaces, including full-screen apps.
- FR-1.2 It can be dragged anywhere, and its position is remembered across launches.
- FR-1.3 **Click**: grab any highlighted text, then open the chat panel next to the otter with that text attached.
- FR-1.4 **Right-click**: a menu with *Ask about highlighted text*, *Snap part of my screen*, *Settings*, *Hide Otty*, *Quit*.
- FR-1.5 The otter is animated: it blinks while idle, bobs while thinking and smiles when an answer is ready.
- FR-1.6 Clicking the otter does not steal focus from the current app (a non-activating panel), so the highlight is kept.

### FR-2 Lives at the cursor (P0)
- FR-2.1 The global shortcut **⌥ Space** grabs the highlighted text and opens the panel **at the mouse cursor**.
- FR-2.2 The global shortcut **⌥ ⇧ Space** starts a screen snip. The user drags a box, and the panel opens at the cursor with the picture attached.
- FR-2.3 The panel never opens off-screen: it is clamped to the work area of the display the cursor is on.
- FR-2.4 Both shortcuts can be changed in Settings (P1).
- FR-2.5 A menu-bar icon (🦦) gives the same actions, for people who lose the bubble (P0).

### FR-3 Ask about highlighted text (P0)
- FR-3.1 Selected text is captured without permanently changing the user's clipboard (text, HTML, RTF and images are restored).
- FR-3.2 The captured text shows as a removable "context chip" above the input box.
- FR-3.3 Quick-action buttons appear with the chip: **Explain simply**, **Summarize**, **Translate to English**, **What should I do?**
- FR-3.4 If nothing is highlighted, the panel opens empty with friendly guidance and no error.
- FR-3.5 If Accessibility permission is missing, Otty explains why it needs it in plain words, with a one-click "Open Settings" button.

### FR-4 Ask about a screenshot (P0)
- FR-4.1 The native crosshair lets the user draw a box. Esc cancels quietly.
- FR-4.2 The image is downscaled (max 1600 px on the long side), converted to JPEG and sent to the model as an `image_url` content part (JPEG, PNG, GIF and WebP are supported).
- FR-4.3 A thumbnail chip of the snip appears in the composer.
- FR-4.4 If Screen Recording permission is missing, Otty shows the same friendly guide as FR-3.5.

### FR-5 Chat panel (P0)
- FR-5.1 Answers stream in token by token, with an "Otty is thinking…" otter animation before the first token.
- FR-5.2 Follow-up questions keep the conversation context. **New chat** clears it.
- FR-5.3 A Stop button cancels a running answer.
- FR-5.4 Esc or the × button hides the panel. The conversation is kept until New chat.
- FR-5.5 Errors are human-readable ("Otty's key doesn't look right — check Settings"), never raw JSON.
- FR-5.6 Answers can be copied with one click.

### FR-6 Teaching & explainer pop-ups (P0)
- FR-6.1 The model marks up to three jargon terms per answer. These render as dotted-underlined **explain terms**.
- FR-6.2 Clicking a term opens a small pop-up card with a 2–3 sentence beginner explanation and an everyday analogy. Explanations are fetched on demand and cached.
- FR-6.3 The card has an **Ask more about this** button that sends a follow-up question.
- FR-6.4 The model can add a **💡 tip card** (rendered from a `> 💡` blockquote) for extra context.
- FR-6.5 The answer style is short paragraphs, plain words, steps for how-to questions, and no walls of text.

### FR-7 Simple agent tools (P0)
The model may call these tools through OpenAI-style function calling. The UI shows each call as a small chip ("🔎 Looked up *photosynthesis*").

| Tool | Behavior | Confirmation |
| --- | --- | --- |
| `search_web` | With DeepSeek: real web search, 5 dated results with summaries to cite. Otherwise (or if it fails): Wikipedia + DuckDuckGo instant answers | No |
| `read_page` | With DeepSeek only: reads one web page as Markdown (about 24K characters max), e.g. the page in the app note. Can't see signed-in pages | No |
| `open_url` | Opens an http(s) link in the default browser | **Yes**: an "Allow / No thanks" card |
| `copy_to_clipboard` | Puts text (such as a rewritten email) on the clipboard. A table pastes as a real table | No |
| `create_reminder` | Adds an item to Apple Reminders, with an optional due date | **Yes** |

- FR-7.1 At most 6 tool round-trips per question, to prevent loops.
- FR-7.2 Tool failures go back to the model as text, so it can apologise and carry on.
- FR-7.3 Actions with side effects always need an explicit user click.
- FR-7.4 Search results and page text are information for the answer, never instructions; side-effecting tools keep their confirmation whatever a page says.

### FR-8 Onboarding & settings (P0)
- FR-8.1 First run shows a 3-step welcome: (1) meet Otty, (2) paste your DeepSeek key, with a link to get one and a **Test** button, (3) grant permissions, with live status ticks.
- FR-8.2 Settings: API key, base URL, model, "Think deeper (slower)" toggle, show/hide the floating otter, and shortcuts (P1).
- FR-8.3 The API key is stored encrypted and is never sent to the renderer. The renderer only sees `hasApiKey`.

### FR-9 App awareness (P0)
- FR-9.1 Each hotkey, bubble click or snip also notes the frontmost app's name and window title, and for Safari / Chromium browsers (Chrome, Arc, Brave, Edge, Vivaldi, Opera) the current page address with its query and fragment removed. This runs alongside the selection copy, so it adds no delay.
- FR-9.2 It shows as a removable "In Safari · page title" tag in the composer and quick view, and on the sent message. It is added to the user message as a short `[I'm using …]` note.
- FR-9.3 It never reports Otty itself, and it can be switched off in Settings → Privacy ("Tell Otty which app I'm using").

### FR-10 Saved chats (P0)
- FR-10.1 Every conversation is saved when a turn ends. A hotkey question or **New chat** starts a new conversation, and the old one stays saved instead of being wiped.
- FR-10.2 **Recent chats** (clock button in the panel header) lists the newest 500 chats with title, app and age; search reaches older ones. Clicking one reopens it and the conversation can continue. Each can be forgotten.
- FR-10.3 Only text is saved (`userData/otty.db`, mode 600). Screen snips are replaced by a "not saved" placeholder. The question is saved as soon as it's sent, so a crash mid-answer keeps it. Chats saved by 0.3 (`chats.json`) are imported on first launch and the file is deleted.
- FR-10.7 **Keep chats for** 30 days / 1 year / forever (Settings → Privacy, default 1 year), counted from a chat's last message. Older chats are forgotten at launch, after each answer and when the setting changes. Forgotten chats are overwritten on disk, not just unlinked.
- FR-10.4 Settings → Privacy: "Remember my chats" (turning it off forgets them all) and **Forget all chats**.
- FR-10.5 **Search** at the top of Recent chats (⇧⌘F in the panel, or ⌘F with no chat open) finds chats by their title, messages and text captures, in English or Chinese. Every word must appear; quotes keep a phrase. Results show a highlighted snippet, and clicking one reopens the chat at the matching message.
- FR-10.6 **Find in this chat** (⌘F, or the search button in the header) highlights every match in the open conversation with the same matching rules, shows "2 of 5", and steps with ↵ / ⇧↵. Esc closes the bar before it closes the panel.

### FR-12 File attachments (P1)
- FR-12.1 The panel's paperclip button, dragging files onto the panel, or pasting a file copied in Finder attaches up to 5 files (25 MB each) to the next message. Each shows as a chip with its type, name and page count, "Reading…" while it's read, and a friendly reason when it can't be.
- FR-12.2 Supported: PDF (text by page), Word `.docx`, pictures (PNG, JPEG, GIF, WebP, HEIC, TIFF) and text files (`.txt`, `.md`, `.csv`, `.json`, code). Scanned PDFs, other types, oversized or zip-bomb `.docx` files get a friendly message.
- FR-12.3 Documents are read in a separate utility process, so the app never freezes. Their text goes into the question as `[File n: name · pages]` blocks with page markers, and answers cite pages. A message's documents share a budget of about 48K tokens; when a file doesn't fit, only the first part is sent and both the user ("Otty read the first 40 of 120 pages") and the model are told.
- FR-12.4 With files and an empty box, ↵ runs the first file action (**Summarize**, **Key points**, **Explain simply**; for pictures **What is this?**).
- FR-12.5 The original file is never copied. Saved chats keep the file's name, type and extracted text (so follow-ups work after reopening), never pictures. File names are searchable.

### FR-13 Capture tray (P1)
- FR-13.1 One question can carry up to 4 captures (highlights and snips), each with its own app tag, in the order collected. The same text twice is ignored; a fifth gets a friendly note.
- FR-13.2 While the panel is open, ⌥Space, ⌥⇧Space, a click on the otter and the panel's scissors add to its tray instead of replacing. With the panel closed, a capture starts a new tray.
- FR-13.3 The quick view can collect too: **＋ add more** keeps it open while the user works in other apps, and a hotkey then adds without moving or focusing it. It stays open across a desktop (Space) switch.
- FR-13.4 Two or more things (captures plus files) offer **Compare these** (the ↵ default), **Summarize all** and **Explain each**.
- FR-13.5 Sent messages show every capture with its app; saved chats keep text captures and mark snips "not saved", and chats saved before the tray still open.

### FR-11 Later (P2)
See [BRAINSTORM.md](BRAINSTORM.md) for the living list. Originally listed: voice input · choosing an answer language (shipped, D-2) · inserting text back into the source app (planned, D-11) · launch at login · auto-update · signed and notarized builds · a custom app icon · a cursor-following mini otter · local OCR fallback for non-vision models · full computer-use actions.

## 4. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Shortcut-to-panel time is under 400 ms for text (excluding model latency) |
| NFR-2 | First token is under 2 s on a normal connection with thinking off |
| NFR-3 | Idle CPU is about 0% (CSS animations only, no polling except while dragging) |
| NFR-4 | Security: `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, a narrow typed preload API, all network calls from the main process |
| NFR-5 | Privacy: nothing is sent anywhere until the user asks a question. Screenshots are deleted from disk right after encoding and are never saved with chats; attached files are only read, never copied, and pictures from them are never saved. App context and chat saving can each be turned off. Web searches and page reads send only the query or the page address, to the same provider as the model, and never the user's IP or cookies |
| NFR-6 | Accessibility: keyboard usable, 4.5:1 contrast, works in light and dark mode, respects `prefers-reduced-motion` |
| NFR-7 | Supports macOS 12+ on Apple Silicon and Intel |
| NFR-8 | Saved chats: saving a turn ≤ 1 ms for a typical chat (and never before the request is sent), opening a chat ≤ 5 ms, searching 2,000 chats ≤ 50 ms |

## 5. Permissions (macOS)

| Permission | Needed for | How the user is asked |
| --- | --- | --- |
| Accessibility | Simulating ⌘C to read the selection | A friendly onboarding card, then the system prompt |
| Screen Recording | Snips that include other apps' windows | A friendly onboarding card, with a deep link to System Settings |
| Automation → Reminders / System Events / browsers | `create_reminder`, simulated copy, frontmost app and page address | The system prompt on first use. If a browser is refused, Otty just leaves out the address |

> In development (`npm run dev`), macOS grants these permissions to the **terminal app** that launched Electron, such as Terminal or iTerm.

## 6. Known risks

| Risk | Mitigation |
| --- | --- |
| The modifier from ⌥Space is still held when ⌘C is simulated (it becomes ⌘⌥C) | Wait ~220 ms before copying; clicking the otter avoids it entirely |
| Unsigned builds lose permissions after each rebuild | Do the MVP testing in dev mode; sign the app in phase 2 |
| Model behavior in DeepSeek thinking mode + tools (`reasoning_content`) | Thinking is off by default. `reasoning_content` is echoed back within a turn and stripped between turns |
| Large images cost many tokens | Downscale to 1600 px and use JPEG quality 85 |
