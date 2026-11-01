# Otty — Changelog

What has shipped, newest first. The plan for what's next is in [DEVLOG.md](DEVLOG.md).

## Unreleased

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
