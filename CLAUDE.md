# Otty — notes for Claude

- Target is macOS, but development may happen on Windows. `npm run typecheck` and `npm run build` work anywhere. Capture, permissions and Reminders only work on macOS (`process.platform === 'darwin'` guards).
- Electron 45 has an **async, W3C-style clipboard API** (`clipboard.read/readText/write/writeText` return Promises, plus `ClipboardItem`). The old sync `readHTML`/`readImage` APIs are gone.
- Electron 45 no longer downloads its binary on install; the `postinstall: install-electron` script does it, so electron-vite can find `node_modules/electron/path.txt`. Don't remove it.
- The main process owns the conversation history (`ChatSession` in `src/main/llm.ts`). The renderer only receives `ChatEvent`s. The API key never reaches the renderer.
- Explain terms are markdown links `[term](#explain)`, and tips are `> 💡` blockquotes. Both are rendered in `src/renderer/src/panel/Markdown.tsx`. Keep `prompts.ts` in sync if you change either format.
- UX for non-technical users comes first: friendly copy, no raw errors, and confirm cards for side-effecting tools.
- Requirements: `docs/REQUIREMENTS.md`. Plan and smoke-test checklist: `docs/IMPLEMENTATION_PLAN.md`.
