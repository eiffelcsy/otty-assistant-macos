# Otty — Changelog

What has shipped, newest first. The plan for what's next is in [DEVLOG.md](DEVLOG.md).

## Unreleased

### Visual refresh (2026-11-01)
- A calmer, more polished look that keeps the otter's warmth. Neutrals do most of the work and meadow green is kept for actions. Outlines became soft hairlines, with two-layer shadows for depth. There's now a radius scale (6 / 10 / 14 / 18 / 24) so nested corners line up, and fewer type sizes and weights.
- **Quick actions** are an even grid of quiet tiles with icons instead of outlined pills. The first tile is the ↵ default and shows a key cap.
- The capture and its actions sit in one **context card**: highlighted text shows as a quote with a straw rule, under a small-caps label.
- The **composer** is a single field holding the snip tool, the text and the send button. It shows a soft focus ring.
- Tool use is a quiet status line ("Searched …") instead of badges. The app tag is plain metadata. Tip cards are a soft straw fill with no border. The explain card has a quiet "Ask more about this →" link.
- Dark mode uses its own deeper green for user bubbles. Scrollbars, key caps and the onboarding step dots were refined.
- `tools/ui-preview` (dev only, `ui-preview` in `.claude/launch.json`) renders the real panel and quick view in a browser with a mock `window.otty`, for UI work without the Electron app.

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
