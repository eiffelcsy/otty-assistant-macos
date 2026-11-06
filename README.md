# Otty 🦦

[![ci](https://github.com/eiffelcsy/otty-assistant-macos/actions/workflows/ci.yml/badge.svg)](https://github.com/eiffelcsy/otty-assistant-macos/actions/workflows/ci.yml)

A cute otter AI assistant for macOS. It lives in a floating bubble and at your cursor. You can highlight text or snap part of your screen, and Otty explains it in plain words, with tap-to-learn pop-ups for tricky terms.

- **Click the otter** or press **⌥ Space** to ask about highlighted text
- **⌥ ⇧ Space** to snap part of your screen and ask about it
- **⌘ ⌥ ⇧ Space** to capture the whole screen in one press
- Collect several highlights and snips from different apps into one question ("compare these")
- Attach PDFs, Word documents, pictures and text files
- **Pick up text:** select and copy the words in a snip, on your Mac with no AI involved
- **Summarize this page** in one tap, and **Check my writing** with each fix marked and explained
- **Gets to know you,** in the open: it shows what it notes, with Undo, and Settings lists all of it
- **Math that's right:** a typed sum is answered instantly on your Mac, and equations render properly
- Copied tables paste as real tables in Word, Pages and spreadsheets
- Saved chats with search (⇧⌘F) and find in a chat (⌘F)
- Help in English, or in 繁體中文（香港） when you want it
- Works with DeepSeek, Claude, OpenAI or any OpenAI-style or Anthropic-style server. Models on your Mac are experimental
- Tools: search the web, read a web page, open links, copy text, add Apple Reminders (side effects always ask first)

Docs: [Functional requirements](docs/REQUIREMENTS.md) · [Dev log](docs/DEVLOG.md) · [Changelog](docs/CHANGELOG.md) · [Brainstorm](docs/BRAINSTORM.md) · [Autonomy direction](docs/AUTONOMY.md)

## Run it (on a Mac)

```bash
npm install
npm run dev
```

On first launch, Otty walks you through choosing a service, pasting its API key (stored encrypted via the Keychain) and granting permissions. To skip the key step in dev, you can also set `DEEPSEEK_API_KEY` in your shell.

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

Electron + electron-vite + React + TypeScript. Model services are called from the main process, behind one adapter per API format: raw `fetch` for OpenAI's `/chat/completions`, and the Anthropic SDK for Anthropic's Messages. The default is DeepSeek, and the API key never reaches the renderer. Pick up text uses a small Swift helper built on Apple Vision, built automatically by `npm run dev` and `npm run build:mac`.

```
src/
  shared/              IPC types and rules used on both sides: services, captures, diff, reading order, matching
  main/                Electron main: windows, hotkeys, capture, chat loop, tools, web, settings
  main/providers/      model services: one adapter per API format, and what each service needs
  main/store/          saved chats: ChatStore on SQLite, schema and search
  main/files/          attachments, read in a utility process
  preload/             window.otty bridge (contextIsolation, sandboxed)
  renderer/src/        React UI: bubble/, quick/ (ask at the cursor), panel/ (chat, onboarding, settings), pickup/
tools/                 ui-preview (renderer in a browser), otty-art (painted frames), otty-ocr (text reader)
```
