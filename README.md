# Otty 🦦

A cute otter AI assistant for macOS. It lives in a floating bubble and at your cursor. You can highlight text or snap part of your screen, and Otty explains it in plain words, with tap-to-learn pop-ups for tricky terms.

- **Click the otter** or press **⌥ Space** to ask about highlighted text
- **⌥ ⇧ Space** to snap part of your screen and ask about it
- Simple tools: look up facts, open links, copy text, add Apple Reminders (side effects always ask first)

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

The build is unsigned for the MVP. To open it the first time, right-click the app and choose **Open**.

## Stack

Electron + electron-vite + React + TypeScript. The LLM is called from the main process with plain `fetch` to any OpenAI-compatible `/chat/completions` endpoint (default: DeepSeek `deepseek-flash`, with vision).

```
src/
  shared/types.ts      IPC contract shared by every process
  main/                Electron main: windows, hotkeys, capture, LLM agent loop, tools, settings
  preload/             window.otty bridge (contextIsolation, sandboxed)
  renderer/src/        React UI: bubble/ (floating otter), panel/ (chat, onboarding, settings)
```
