# Otty — Implementation Plan

Goal: **MVP today.** The scaffold in this repo already implements the P0 path from start to finish. The remaining work is mostly testing on a Mac and polish.

## Architecture

```
┌──────────── main process (Node) ────────────┐
│ index.ts      app lifecycle, tray, hotkeys  │
│ windows.ts    bubble + panel windows        │
│ capture.ts    selection (⌘C trick), snip    │
│ llm.ts        SSE client + agent/tool loop  │
│ tools.ts      search_web, open_url, …       │
│ settings.ts   JSON + safeStorage API key    │
│ permissions.ts  macOS TCC checks            │
└───────────────▲──────────────┬──────────────┘
         invoke │              │ events (chat:event, panel:context, bubble:state)
┌───────────────┴──────────────▼──────────────┐
│ preload: window.otty (typed, narrow API)    │
└───────────────▲──────────────┬──────────────┘
┌───────────────┴──────────────▼──────────────┐
│ renderer (React) — one bundle, two views    │
│  ?view=bubble → <Bubble/>  (otter button)   │
│  ?view=panel  → <Panel/>   (chat, onboard)  │
└─────────────────────────────────────────────┘
```

**Key decisions**
- **The main process owns the conversation**, including tool messages and `reasoning_content`. The renderer only gets display events. The API key never leaves main.
- **Explain terms** use the markdown link `[term](#explain)`, which `react-markdown` allows by default. A custom `a` renderer turns them into pop-up triggers.
- **Tips** use a `> 💡 …` blockquote, styled as a card.
- The bubble is a non-activating `type: 'panel'` window, so clicking it keeps the other app's selection.

## Phases & timeline (today)

| # | Phase | Est. | Status |
| --- | --- | --- | --- |
| 0 | Scaffold: electron-vite, TS, windows, preload API | 1 h | ✅ in repo |
| 1 | Bubble: otter SVG, drag, click / right-click, tray | 1 h | ✅ in repo |
| 2 | Capture: selection trick + `screencapture -i` + permission checks | 1 h | ✅ in repo, **needs a Mac test** |
| 3 | LLM: streaming client, system prompt, agent loop, 4 tools, confirm cards | 1.5 h | ✅ in repo, **needs a live key test** |
| 4 | Panel UX: chat, context chips, quick actions, explain pop-ups, tips, errors | 1.5 h | ✅ in repo |
| 5 | Onboarding + Settings | 45 m | ✅ in repo |
| 6 | **Mac smoke test & bug fixing** (checklist below) | 1–2 h | ⏳ next |
| 7 | Polish: copy tweaks, animation timing, icon, `npm run build:mac` → DMG | 1 h | ⏳ |

## Mac smoke-test checklist (Phase 6)

1. `npm install && npm run dev`. The otter appears in the bottom-right corner and 🦦 appears in the menu bar.
2. First run: onboarding shows. Paste the key → **Test** → ✅.
3. Grant Accessibility and Screen Recording to your terminal app, then restart `npm run dev`.
4. Highlight text in Safari → press **⌥Space** → the panel opens at the cursor with a text chip. Click **Explain simply** → the answer streams in.
5. Check that the clipboard still holds what you copied before (paste somewhere).
6. Click the otter with text highlighted → same flow, anchored to the otter.
7. **⌥⇧Space** → draw a box over a chart → ask "what is this?" → the answer describes the image.
8. Click a dotted term → the explainer card appears → **Ask more** sends a follow-up.
9. "Remind me to call mum at 5pm" → the confirm card appears → Allow → the reminder shows in the Reminders app.
10. "Find me the Wikipedia page for otters and open it" → a search chip appears, then the open_url confirm.
11. Wrong key → a friendly error appears. Wi-Fi off → a friendly error appears.
12. Drag the otter, quit, relaunch → the position is remembered.
13. Toggle dark mode → everything stays legible.

## Phase 2+ backlog

1. Sign + notarize (Developer ID), so permissions survive updates. Add a custom `.icns`.
2. Conversation history and "pin the panel".
3. Voice input (Whisper-compatible endpoint).
4. "Replace selection" (paste the answer back into the source app).
5. Launch at login and auto-update (electron-updater).
6. A cursor-following mini otter that appears when text is selected (needs a native selection observer through Accessibility notifications, probably a small Swift helper).
7. Move from Electron to a native Swift shell if bundle size or feel becomes a problem. The renderer UI could be kept in a WKWebView.
