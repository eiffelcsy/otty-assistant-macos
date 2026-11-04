# Otty 🦦

[![ci](https://github.com/eiffelcsy/otty-assistant-macos/actions/workflows/ci.yml/badge.svg)](https://github.com/eiffelcsy/otty-assistant-macos/actions/workflows/ci.yml)

A cute otter AI assistant for macOS. It lives in a floating bubble and at your cursor. You can highlight text or snap part of your screen, and Otty explains it in plain words, with tap-to-learn pop-ups for tricky terms.

- **Click the otter** or press **⌥ Space** to ask about highlighted text
- **⌥ ⇧ Space** to snap part of your screen and ask about it
- Collect several highlights and snips from different apps into one question ("compare these")
- Attach PDFs, Word documents, pictures and text files
- Saved chats with search (⇧⌘F) and find in a chat (⌘F)
- Help in English, or in 繁體中文（香港） when you want it
- Tools: search the web, read a web page, open links, copy text, add Apple Reminders (side effects always ask first)

Docs: [Functional requirements](docs/REQUIREMENTS.md) · [Dev log](docs/DEVLOG.md) · [Changelog](docs/CHANGELOG.md) · [Brainstorm](docs/BRAINSTORM.md)

## Run it (on a Mac)

```bash
npm install
npm run dev
```

On first launch, Otty walks you through pasting a DeepSeek API key (stored encrypted via the Keychain) and granting permissions. To skip the key step in dev, you can also set `DEEPSEEK_API_KEY` in your shell.

> **Permissions in dev:** macOS grants Accessibility and Screen Recording to the app that launched Electron, such as Terminal, iTerm or VS Code. Allow that app in **System Settings → Privacy & Security**, then restart `npm run dev`.

## Build a DMG

```bash
npm run build:mac
```

The build is unsigned for now. To open it the first time, right-click the app and choose **Open**. Otty needs macOS 13 or later.

The `dmg` workflow on GitHub Actions builds the same thing, and attaches it to a draft release on every `v*` tag.

## Check it

```bash
npm run typecheck
```

```bash
npm test
```

## Stack

Electron + electron-vite + React + TypeScript. The LLM is called from the main process with plain `fetch` to any OpenAI-compatible `/chat/completions` endpoint (default: DeepSeek `deepseek-flash`, with vision). With DeepSeek, web search and page reading use its Search & Fetch APIs with the same key. Chats are saved on the Mac in SQLite (`otty.db`, Electron's built-in `node:sqlite`).

```
src/
  shared/types.ts      IPC contract shared by every process
  shared/captures.ts   capture tray rules (limit, duplicates)
  shared/match.ts      matching rules for chat search and find in chat
  main/                Electron main: windows, hotkeys, capture, LLM agent loop, tools, web, settings
  main/store/          saved chats: ChatStore on SQLite, schema and search
  main/files/          attachments, read in a utility process
  preload/             window.otty bridge (contextIsolation, sandboxed)
  renderer/src/        React UI: bubble/ (floating otter), quick/ (ask at the cursor), panel/ (chat, onboarding, settings)
tools/                 ui-preview (renderer in a browser), otty-art (painted frames)
```
