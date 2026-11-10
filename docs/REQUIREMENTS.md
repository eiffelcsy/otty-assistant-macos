# Otty — Functional Requirements

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
| LLM | The user's choice: DeepSeek by default, Claude, OpenAI, a local model, or any OpenAI-style or Anthropic-style address | One adapter per API format (`src/main/providers/`), so a new service needs no new code |
| Screen capture | macOS built-in `screencapture -i` | The native crosshair box-drawing UX Mac users already know |
| Selected text | Copy-and-restore clipboard trick (simulated ⌘C via `osascript`) | Works in nearly every app; needs Accessibility permission |
| Secrets | Electron `safeStorage` (backed by the macOS Keychain) | The API key never touches the renderer or plain disk |
| Storage | SQLite (`otty.db`) through Electron's built-in `node:sqlite`, FTS5 trigram search | No native module to rebuild; sub-millisecond writes; full-text search in English and Chinese; room for memories and intent feedback |
| Web | DeepSeek Search & Fetch with DeepSeek; Claude's web search with Claude; Wikipedia + DuckDuckGo otherwise. Pages are read from the Mac without DeepSeek | Each service says where lookups go |
| Files | `pdfjs-dist` and `mammoth`, in a utility process | Big documents never freeze the app |
| Tests | Vitest, run by CI on every PR | No Electron needed for most of it |
| Packaging | electron-builder → `.dmg`, Apple Silicon and Intel | Unsigned for now; signing and notarization come later |

## 3. Functional requirements

Everything here is built, unless it says *Planned*. Priority: **P0** = core to Otty, **P1** = added since the first release, **P2** = later.

### FR-1 Floating otter button (P0)
- FR-1.1 A small (~80 px) round otter button floats above all windows and all Spaces, including full-screen apps.
- FR-1.2 It can be dragged anywhere, and its position is remembered across launches.
- FR-1.3 **Click**: grab any highlighted text, then open the chat panel next to the otter with that text attached.
- FR-1.4 **Right-click**: a menu with *Ask about highlighted text*, *Snap part of my screen*, *Open chat*, *Hide floating Otty*, *Settings…*, *Quit Otty*.
- FR-1.5 The otter is animated: it blinks while idle, bobs while thinking and smiles when an answer is ready.
- FR-1.6 Clicking the otter does not steal focus from the current app (a non-activating panel), so the highlight is kept.

### FR-2 Lives at the cursor (P0)
- FR-2.1 The global shortcut **⌥ Space** grabs the highlighted text and opens the small **quick view** at the mouse cursor.
- FR-2.2 The global shortcut **⌥ ⇧ Space** starts a screen snip. The user drags a box, and the quick view opens at the cursor with the picture attached.
- FR-2.3 Neither window ever opens off-screen: both are clamped to the work area of the display the cursor is on.
- FR-2.4 Both shortcuts can be changed in Settings.
- FR-2.5 A menu-bar icon (an otter-head template image) gives the same actions, for people who lose the bubble.
- FR-2.6 In the quick view, ↵ with an empty box runs the capture's first quick action. Once answered, ↵ "continue in chat" swaps it for the full panel with the same conversation, and Esc or a click elsewhere puts it away. An answer still running finishes in the background, and a dot on the otter says when it's ready.

### FR-3 Ask about highlighted text (P0)
- FR-3.1 Selected text is captured without permanently changing the user's clipboard (text, HTML, RTF and images are restored).
- FR-3.2 The captured text shows as a removable "context chip" above the input box.
- FR-3.3 In the panel, quick-action tiles appear with the chip: **Explain simply**, **Summarize**, **Translate**, **What should I do?** A short phrase gets **What does it mean?**, **Explain simply** and **Translate** instead. A snip gets **What is this?**, **Explain simply**, **Read the text** and **What should I do?** With a home language there's also **Explain in 中文** for text (FR-14). The first tile is the ↵ default.
- FR-3.4 If nothing is highlighted, the panel opens empty with friendly guidance and no error.
- FR-3.5 If Accessibility permission is missing, Otty explains why it needs it in plain words, with a one-click "Open Settings" button.

### FR-4 Ask about a screenshot (P0)
- FR-4.1 The native crosshair lets the user draw a box. Esc cancels quietly.
- FR-4.2 The image is downscaled (max 1600 px on the long side), converted to JPEG and sent to the model as an `image_url` content part (JPEG, PNG, GIF and WebP are supported).
- FR-4.3 A thumbnail chip of the snip appears in the composer.
- FR-4.4 If Screen Recording permission is missing, Otty shows the same friendly guide as FR-3.5.
- FR-4.5 *(Planned, D-14.)* Otty draws its own snip overlay (paw cursor, frozen screen, instant crop).

- FR-4.6 **Pick up text** opens a snip in a floating window with its words selectable, for ⌘C. The text is read on the Mac, with no model, and nothing is saved or sent.
- FR-4.7 **Pick up text** copies table rows with tabs, so they paste as cells.
- FR-4.8 **⌘⌥⇧Space** captures the whole display under the cursor, with Otty's windows left out, at up to 2048 px on the long side. That costs more tokens than a snip. It can include notifications and other windows, so nothing is sent until the user asks, and the welcome page and Settings say so.

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
- FR-6.6 Explain cards open without a wait: the first three terms are fetched when an answer ends, and failures aren't remembered.

### FR-7 Simple agent tools (P0)
The model may call these tools through OpenAI-style function calling. The UI shows each call as a small chip with an icon ("Looking up “photosynthesis”").

| Tool | Behavior | Confirmation |
| --- | --- | --- |
| `search_web` | With DeepSeek: real web search, 5 dated results with summaries to cite. Claude uses its own web search instead. Otherwise (or if it fails): short summaries from Wikipedia and DuckDuckGo. Off with a local model | No |
| `read_page` | Reads one public web page as Markdown (about 24K characters max), through DeepSeek or from the Mac, e.g. the page in the app note. Can't see signed-in pages | Only for an address that didn't come from the user, a search or a page: a "Read this page?" card shows it in full |
| `open_url` | Opens an http(s) link in the default browser | **Yes**: an "Allow / No thanks" card |
| `copy_to_clipboard` | Puts text (such as a rewritten email) on the clipboard. A table pastes as a real table | No |
| `create_reminder` | Adds an item to Apple Reminders, with an optional due date | **Yes** |
| `calculate` | Works out numbers exactly, in steps (FR-17) | No: it changes nothing |
| `remember`, `forget` | Saves or removes a memory (FR-16) | No: shown with an Undo |
| `show_steps` | Shows a step card (FR-18) | Each step's action is the user's click |
| `start_job` | Asks to look into something in the background (FR-19) | **Yes**, every time, showing the whole brief |
| `schedule_job` | The same, at a later time (FR-19.6) | **Yes**, every time, showing the time and the whole brief |

- FR-7.1 At most 6 tool round-trips per question, to prevent loops.
- FR-7.2 Tool failures go back to the model as text, so it can apologise and carry on.
- FR-7.3 Actions with side effects always need an explicit user click. `copy_to_clipboard` is the one exception: it shows a chip but doesn't ask.
- FR-7.4 Search results and page text are information for the answer, never instructions; side-effecting tools keep their confirmation whatever a page says.
- FR-7.5 Answers never load remote pictures: an image in an answer shows only its description.

### FR-8 Onboarding & settings (P0)
- FR-8.1 First run shows a 3-step welcome: (1) meet Otty and pick "My other language", (2) choose a service and paste its key, with a link to get one and a **Test** button, (3) grant permissions, with live status ticks.
- FR-8.2 Settings: a service picker with its key and model (address and API format under Advanced), "Think deeper (slower)" toggle, show/hide the floating otter, shortcuts, "My other language", and Privacy (app awareness, saved chats, how long to keep them).
- FR-8.3 Each service has its own key, stored encrypted and never sent to the renderer or to another service. The renderer only sees which services have a key.

### FR-9 App awareness (P0)
- FR-9.1 Each hotkey, bubble click or snip also notes the frontmost app's name and window title, and for Safari / Chromium browsers (Chrome, Arc, Brave, Edge, Vivaldi, Opera) the current page address with its query and fragment removed. This runs alongside the selection copy, so it adds no delay.
- FR-9.2 It shows as a removable "In Safari · page title" tag in the composer and quick view, and on the sent message. It is added to the user message as a short `[I'm using …]` note.
- FR-9.3 It never reports Otty itself, and it can be switched off in Settings → Privacy ("Tell Otty which app I'm using").
- FR-9.4 When Otty knows the page and nothing is highlighted, it offers **Summarize this page**. It makes no offer when removing the address's query would mean reading a different page.

### FR-10 Saved chats (P0)
- FR-10.1 Every conversation is saved as it goes. A hotkey question or **New chat** starts a new conversation, and the old one stays saved instead of being wiped.
- FR-10.2 **Recent chats** (clock button in the panel header) lists the newest 500 chats with title, app and age; search reaches older ones. Clicking one reopens it and the conversation can continue. Each can be forgotten.
- FR-10.3 Only text is saved (`userData/otty.db`, mode 600). Screen snips are replaced by a "not saved" placeholder. The question is saved as soon as it's sent, so a crash mid-answer keeps it. Chats saved by 0.3.x (`chats.json`) are imported on first launch and the file is deleted.
- FR-10.4 Settings → Privacy: "Remember my chats" (turning it off forgets them all) and **Forget all chats**.
- FR-10.5 **Search** at the top of Recent chats (⇧⌘F in the panel, or ⌘F with no chat open) finds chats by their title, messages and text captures, in English or Chinese. Every word must appear; quotes keep a phrase. Results show a highlighted snippet, and clicking one reopens the chat at the matching message.
- FR-10.6 **Find in this chat** (⌘F, or the search button in the header) highlights every match in the open conversation with the same matching rules, shows "2 of 5", and steps with ↵ / ⇧↵. Esc closes the bar before it closes the panel.
- FR-10.7 **Keep chats for** 30 days / 1 year / forever (Settings → Privacy, default 1 year), counted from a chat's last message. Older chats are forgotten at launch, after each answer and when the setting changes. Forgotten chats are overwritten on disk, not just unlinked.
- FR-10.8 After the first answer, a model-written title of a few words replaces the instant one, in the chat's language.

### FR-12 File attachments (P1)
- FR-12.1 The panel's paperclip button, dragging files onto the panel, or pasting a file copied in Finder attaches up to 5 files (25 MB each) to the next message. Each shows as a chip with its type, name and page count, "Reading…" while it's read, and a friendly reason when it can't be.
- FR-12.2 Supported: PDF (text by page), Word `.docx`, pictures (PNG, JPEG, GIF, WebP, HEIC, TIFF, BMP) and text files (`.txt`, `.md`, `.csv`, `.json`, code). Scanned PDFs, other types, oversized or zip-bomb `.docx` files get a friendly message.
- FR-12.3 Documents are read in a separate utility process, so the app never freezes. Their text goes into the question as `[File n: name · pages]` blocks with page markers, and answers cite pages. A message's documents share a budget of about 48K tokens; when a file doesn't fit, only the first part is sent and both the user ("Otty read the first 40 of 120 pages") and the model are told.
- FR-12.4 With files and an empty box, ↵ runs the first file action (**Summarize**, **Key points**, **Explain simply**; for pictures **What is this?**).
- FR-12.5 The original file is never copied. Saved chats keep the file's name, type and extracted text (so follow-ups work after reopening), never pictures. File names are searchable.

### FR-13 Capture tray (P1)
- FR-13.1 One question can carry up to 4 captures (highlights and snips), each with its own app tag, in the order collected. The same text twice is ignored; a fifth gets a friendly note.
- FR-13.2 While the panel is open, ⌥Space, ⌥⇧Space, a click on the otter and the panel's scissors add to its tray instead of replacing. With the panel closed, a capture starts a new tray.
- FR-13.3 The quick view can collect too: **＋ add more** keeps it open while the user works in other apps, and a hotkey then adds without moving or focusing it. It stays open across a desktop (Space) switch.
- FR-13.4 Two or more things (captures plus files) offer **Compare these** (the ↵ default), **Summarize all** and **Explain each**.
- FR-13.5 Sent messages show every capture with its app; saved chats keep text captures and mark snips "not saved", and chats saved before the tray still open.

### FR-14 Home-language help (P1)
- FR-14.1 **My other language** (Settings and the welcome page): English only, or 繁體中文（香港）. Hong Kong and Macau Macs default to it, and choosing English only is remembered. The app itself stays in English.
- FR-14.2 Each answer's language comes from the first rule that applies: an explicit pick, a language the quick action implies, the language the user typed in, otherwise English.
- FR-14.3 An **EN / 中** pill sets the next message's language, in the panel and quick view. The latest answer offers **In 中文** / **In English**.
- FR-14.4 Chinese answers use Hong Kong written Chinese, Traditional characters only, with HK vocabulary, and keep on-screen English words like 「File」 as they are.
- FR-14.5 Explain cards open in their answer's language, show a 中文 line, and have an EN / 中文 toggle.

### FR-15 Proofreading (P1)
- FR-15.1 **Check my writing** returns a highlighted draft corrected, with each change marked and a plain reason for it.
- FR-15.2 The marks are worked out by comparing the texts, never taken from the model. The draft is never translated.

### FR-16 Memory (P1)
- FR-16.1 Otty saves what the user tells it to remember, and what they reveal that's likely to last, with no confirm card. Every save, change and removal shows under the answer with **Undo**, and stays in the saved chat.
- FR-16.2 Otty counts apps, answer languages, quick actions and requests for shorter answers on the Mac, and turns repeated use over several days into habits. Only counts are stored. A deleted habit doesn't return.
- FR-16.3 Settings lists what Otty knows, grouped, with each one's source, and allows edit, pause, delete, add and **Forget everything**. A master switch stops all learning and sending, and **Don't learn from this chat** stops learning for one chat.
- FR-16.4 Passwords, keys and codes are never kept. Health, money, religion, politics, sexuality, exact addresses and ID numbers are only kept when the user asks. Nothing is learned from captures, files or web pages. All of this is enforced in code.
- FR-16.5 Memories stay in `otty.db`, and only reach the model as a note of up to about 1,500 characters with a question.

### FR-17 Math (P1)
- FR-17.1 A question that's only a calculation is answered on the Mac, at once and offline, with **Copy** and **Explain the working**.
- FR-17.2 Numbers in answers come from a `calculate` tool with exact decimals, percentages, units and statistics, normally one call an answer. It evaluates nothing outside its allowlist.
- FR-17.3 Only questions that need reasoning turn on thinking, for that turn. **Always think deeper** overrides this. Other questions are no slower.
- FR-17.4 `$$…$$` renders as math, offline, in the panel and quick view. Prices stay text.

### FR-18 Step cards (P1)
- FR-18.1 Steps the user carries out on the Mac appear as a checklist under the answer, with ticks and progress saved with the chat.
- FR-18.2 A step can paste, open, click a menu, press a shortcut or copy, only when the user presses its button, and only in the app the question came from.
- FR-18.3 Steps that can't be undone ask a second time, decided in code. Paste never sends Return and never goes into a password field. `open` only reaches web pages, installed apps, a list of Settings panes, and revealing files in the home folder.
- FR-18.4 **I'm stuck** looks at the screen and asks, and the card updates in place. A menu that can't be found becomes a step to do by hand.
- FR-18.5 The quick view stays open while there are steps to do, and takes follow-ups.

### FR-19 Keep going (P1)
- FR-19.1 An answer carries on when the user moves to another chat, up to three at once, and only the chat on show reaches the windows. A new question in the same chat replaces its answer.
- FR-19.2 A background job only starts from a card showing its whole brief. It sees only that brief, can only search and read public pages, and never runs on a service where nothing may leave the Mac.
- FR-19.3 Jobs run one at a time, up to five waiting, and survive quitting and sleep. An unfamiliar address waits for the user's answer. A job left over 24 hours asks before going on.
- FR-19.4 Limits in code end a job with a partial report that says so: 24 rounds, 30 lookups, 15 minutes, or the same call three times.
- FR-19.6 *Ask me later.* "Check this tomorrow at 9" shows a card ("Tomorrow at 9:00 AM, Otty will look this up and leave a note. It won't send or change anything. Otty has to be running then.") and, on a yes, runs a normal read-only job at that time. One timer is set for the next due job, with no polling. If the Mac was asleep or Otty was quit, it runs once on wake or launch and says it ran late; more than a day late, it asks first. A scheduled row in Activity has Cancel, under **Coming up**. **Open Otty when I log in** (off by default, installed app only) keeps it working after a restart.
- FR-19.7 *Pause everything Otty is doing,* in the otter's menu and the menu bar: running answers stop, a running job stops where it is with every step saved, and nothing scheduled starts until *Let Otty carry on*. It stays paused across restarts.
- FR-19.8 Under an answer, a quiet line says **Used: …** (at most two) for saved memories that matched the question or the app, stays with the saved chat, and opens the list when tapped. It follows "Let Otty learn about me".
- FR-19.9 *Tell me when something is ready* (off by default): a macOS notification when a job finishes, fails or waits for an OK, only while the panel is closed. The otter shows the same at a glance: busy, waiting for you, or paused.
- FR-19.10 *What Otty has used:* Settings shows the last 30 days' questions, background look-ups, searches, pages and a rough token count, counted on the Mac, with a link to the service's usage page. A job's card says where it stops and, once known, how it compares with a question.
- FR-19.11 The panel says plainly when a shortcut can't work (a missing permission, or a shortcut another app owns) and offers the fix. An empty chat suggests things to ask, for the app the user came from and for abilities found only by asking.
- FR-19.5 A report is a normal chat. **Activity** shows every job and running answer, with Stop, Allow, Keep going and Open.
- FR-19.6 With **Remember my chats** off, nothing about a job is written to disk. Forgetting a chat removes its jobs.

### FR-20 Look after me (P2, *Planned*)
- FR-20.1 One permission, asked for at onboarding and changeable in Settings, lets Otty offer wellbeing and productivity suggestions unprompted, including a greeting with a priority list for the next few hours. It says plainly what's sent and how often.
- FR-20.2 Suggestions never act. Anything with side effects stays the user's click, and each connection is opted into separately.
- FR-20.3 How often Otty looks and speaks is limited in code, and local checks come first, so it stays quiet when the user is away, on a call or in Focus mode.
- FR-20.4 Tasks and calendars come from read-only connections to other apps and services. Their content is treated as data, never as instructions.

### FR-11 Later (P2)
See [BRAINSTORM.md](BRAINSTORM.md) for the living list. Originally listed: voice input · choosing an answer language (shipped, D-2) · inserting text back into the source app (planned, D-11) · launch at login · auto-update · signed and notarized builds · a custom app icon · a cursor-following mini otter · local OCR fallback for non-vision models · full computer-use actions.

## 4. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Shortcut-to-panel time is under 400 ms for text (excluding model latency) |
| NFR-2 | First token is under 2 s on a normal connection with thinking off |
| NFR-3 | Idle: under 0.5% of one core on average, measured with `OTTY_METRICS=1`. On an M4 on battery, with the bubble showing: about 0.25% today, against 1.6% before the otter's float was stepped and hidden windows were paused, and 0.02% with no animation at all. Memory read 150–700 MB, because macOS compresses idle apps, so no memory limit is set until there are more runs. Re-measure when what runs while idle changes |
| NFR-4 | Security: `contextIsolation` on, `nodeIntegration` off, sandboxed renderer, a narrow typed preload API, all network calls from the main process, and a Content Security Policy on built pages so they can only reach their own files |
| NFR-5 | Privacy: nothing is sent anywhere until the user asks, or has agreed to something that says so, such as a job scheduled for later (FR-19.6). Pause everything stops it at once. Screenshots are deleted from disk right after encoding and are never saved with chats; attached files are only read, never copied, and pictures from them are never saved. App context and chat saving can each be turned off. With DeepSeek, web searches and page reads send only the query or the page address, to the same provider as the model, and never the user's cookies; DeepSeek fetches the page itself. With another provider, or when DeepSeek's search fails, the query goes straight from the Mac to Wikipedia and DuckDuckGo, which see the user's IP address |
| NFR-6 | Accessibility: keyboard usable, 4.5:1 contrast, works in light and dark mode, respects `prefers-reduced-motion` |
| NFR-7 | Supports macOS 13+ on Apple Silicon and Intel (Electron 45's minimum) |
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
| Unsigned builds lose permissions after each rebuild | Test in dev mode; sign the app before sharing builds |
| Model behavior in DeepSeek thinking mode + tools (`reasoning_content`) | Thinking is off by default. `reasoning_content` is echoed back within a turn and stripped between turns |
| Large images cost many tokens | Downscale to 1600 px and use JPEG quality 85 |
