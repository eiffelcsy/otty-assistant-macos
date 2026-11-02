# Otty — notes for Claude

- Target is macOS, but development may happen on Windows. `npm run typecheck` and `npm run build` work anywhere. Capture, permissions and Reminders only work on macOS (`process.platform === 'darwin'` guards).
- Electron 45 has an **async, W3C-style clipboard API** (`clipboard.read/readText/write/writeText` return Promises, plus `ClipboardItem`). The old sync `readHTML`/`readImage` APIs are gone.
- Electron 45 no longer downloads its binary on install; the `postinstall: install-electron` script does it, so electron-vite can find `node_modules/electron/path.txt`. Don't remove it.
- The main process owns the conversation history (`ChatSession` in `src/main/llm.ts`). The renderer only receives `ChatEvent`s. The API key never reaches the renderer.
- Chats are saved as threads through the `ChatStore` interface in `src/main/store/` (JSON backend today; text only, images stripped). Search rules live in `store/search.ts`, and every backend must pass `store/__tests__/search.contract.ts`. Reopening one emits a `load` event. Each send captures the frontmost app (`frontmostApp()` in `capture.ts`) as `AppInfo`, sent separately from the `ScreenContext`.
- Explain terms are markdown links `[term](#explain)`, and tips are `> 💡` blockquotes. Both are rendered in `src/renderer/src/panel/Markdown.tsx`. Keep `prompts.ts` in sync if you change either format.
- UX for non-technical users comes first: friendly copy, no raw errors, and confirm cards for side-effecting tools.
- CI (`.github/workflows/ci.yml`, macOS) runs `npm ci`, typecheck, `npm test` and build on every PR. Keep `package-lock.json` committed and in sync.
- Docs: requirements `docs/REQUIREMENTS.md` · plan, roadmap and smoke test `docs/DEVLOG.md` · shipped work `docs/CHANGELOG.md` · ideas `docs/BRAINSTORM.md`.
- Keep the docs moving: plan a feature as a DEVLOG entry before building it. When it ships, summarise it in CHANGELOG, delete the entry, add its smoke-test steps, and mark it `shipped` in BRAINSTORM. Add any feature or UX ideas you notice along the way to BRAINSTORM.
- Hotkeys (highlight / snip) open the small **quick view** at the cursor (`src/renderer/src/quick/Quick.tsx`); the floating bubble opens the full panel. Both render the conversation from main's `ChatEvent`s through `useChat` (`lib/useChat.ts`), so ↵ "continue in chat" just swaps windows.
- UI work: `tools/ui-preview` (launch config `ui-preview`) renders the real views in a browser with a mock `window.otty`. Use `?view=panel|quick` and `&scene=chat|compose|empty|settings` (`&home=none` hides the home-language features). Design tokens (colours, hairlines, elevation, radius scale) are at the top of `styles.css`. Reuse them instead of new hex values or borders.
- UI icons are Flaticon UIcons (rounded set) via `components/Icon.tsx` — no emoji in UI chrome. Colours are tokens at the top of `styles.css`.
