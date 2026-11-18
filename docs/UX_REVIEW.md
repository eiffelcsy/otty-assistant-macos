# Otty — UX review (temporary)

> **Temporary working doc.** Delete it once every item below is shipped, turned into a DEVLOG entry, moved to BRAINSTORM, or dropped. Don't link it from README or CLAUDE.md.
>
> Written 2026-11-18 from the ui-preview scenes, the copy, and the confirm-card and Activity code. Not tested on a real Mac, so permissions, hotkeys and VoiceOver were not checked first-hand.

## How to use this doc

Each issue has a **Problem** and **Actions**. When you take one on, plan it as a DEVLOG entry and tick it here with the entry's number (`→ D-xx`). When an action is dropped, strike it and say why in one line.

## The rule every action here must pass

**Nobody reads ahead.** People skip whatever stands between them and what they asked for, and they stop seeing anything that always looks the same. So:

- **Glanceable, not explained.** One line that can be taken in at a glance beats a paragraph that's accurate. If it needs a second line, it probably shouldn't be shown by default.
- **Only the unusual grows.** Detail appears when something is off the usual path (new site, over a limit, can't be undone), never on every card.
- **Fewer interruptions, not better ones.** Cutting a card or a banner beats improving its copy.
- **Lead with the result.** What Otty did or found comes first; how it got there is there on request, or when something went wrong.
- **Look-up places are for when something feels off.** Activity and the Logbook are searched with a question in mind, not browsed, so design them for finding, not reading.
- **What the user must see stays visible.** Where a line is a safety control (the Noted line), it's shown in full, in one line, not hidden behind a count.

Check every action below against this before building it.

## Verdict

The trust foundations are better than anything else out there: a record of what left the Mac, an undo record, Pause, the Noted line with Undo, and "Looked a little late" honesty. Above those foundations, the experience feels like features added one at a time. There are many controls, many places to look, and many words for the same thing. The persona is non-technical, but the screens make them handle tokens, API keys, three hotkey chords and four language controls. **The engine is ready for autonomy. The interface isn't yet.**

## Already known (not repeated here)

- LAUNCH_READINESS 15.1–15.8: API-key onboarding, finding Otty again, plan-limit messages, What's new, in-app help, interface language, too many features, accessibility.
- BRAINSTORM UX backlog: hotkey recorder, panel size memory, hand-off animation, Copy on your own messages, answer versions, health line in the quick view, paused dot in the menu bar.

---

## P0

### 1. Confirm cards ask whether to proceed but don't help the user decide

**Problem.** "Open this link?" + raw URL, "Read this page?" + URL, "Look this up?" + query (`tools/mac.ts`, `tools/web.ts`). They answer *what*, never *why* or *what happens next*. With no way to say "always for this site", a heavy user will click Allow by reflex within a week, and that reflex is exactly what injection attacks rely on.

The fix is **fewer cards**, not longer ones: more words on a card people already skim won't be read either.

**Actions.**
- [x] Show the address as host first, in bold ("**wikipedia.org** /wiki/HTTP_429"), so the one thing worth checking (and a lookalike domain) is what the eye lands on. Path and query in small text.
- [x] Keep the card to one title plus that line. Add a consequence line, written in code, **only when it's unusual**: the request goes somewhere new, or the action can't be undone. No "why" line on every card.
- [ ] Earned trust instead of a third button on every card: after the user allows the same tool and host a second time, the card offers **Always for this site** once. Grants are stored per host and per tool, enforced in `runTool`, findable (and revocable) in Activity and Settings. Never offered for `open_link` to a non-https address, or while `RunTaint` has outside words.
- [ ] Attack tests: an injected page can't add a grant, and a grant for one host doesn't match a lookalike host.
- [ ] Eval: count cards per real session before and after, aiming for fewer cards with no loss in the injection set.

### 2. Settings puts the scariest part first and needs a Save button

**Problem.** It opens on a five-way AI connection picker with an API key field. Toggles look instant but don't apply until Save at the bottom (`Settings.tsx:297`), so changes are lost silently. "Older chats are forgotten when you save" ties deleting chats to an unrelated button. Usage is shown in tokens ("1.8 million tokens, the pieces of text DeepSeek charges for"), and the monthly limit asks the user to pick between *questions* and *tokens*.

**Actions.**
- [x] Apply every setting instantly, with a small "Saved · Undo" toast. Remove the Save button. The API key keeps its own explicit "Check and save" because it needs a test.
- [x] Reorder: **You & Otty** (otter, notifications, login, memory) → **Shortcuts** → **Privacy** → **Usage & limit** → **Connection** (collapsed, showing "DeepSeek · working ✓") → **Help**.
- [x] Changing chat retention never deletes on its own. If the new value would forget chats, show a confirm card: "This forgets 23 chats older than 30 days. Can't be undone."
- [x] Usage in questions and look-ups only. Money once the dated price table exists (BRAINSTORM "Money, not tokens"). Drop the tokens unit from the monthly limit, or hide it under Connection for power users.
- [x] Move "Forget everything Otty knows" and "Forget all chats" into a "Danger zone" at the bottom of their sections, each behind a confirm that names the count.

### 3. Health banner covers content, and its buttons are confusing

**Problem.** The banner sits on top of the chat (it covers the "Good to know" tip in the chat scene) and shows on every view, Activity and history included. "Snips can only see your wallpaper" explains how it breaks instead of what the user loses. "Allow" and "Reopen Otty" look like alternatives but are really a sequence.

**Actions.**
- [ ] Put the banner in the layout flow so it pushes content down, never overlays it.
- [ ] Copy: "Otty can't see your screen yet." with the consequence ("snips and screen captures will be blank").
- [ ] Use one button that changes: **Turn on** (opens System Settings) → **Restart Otty to finish** once `permissions.ts` sees the grant.
- [ ] After it's dismissed or seen once per session, shrink it to a dot on the gear icon, and show it again only when the user tries a snip.
- [ ] Update the smoke spec for the health banner step and the `screens` baseline.

---

## P1

### 4. There's no single place to see what Otty is doing

**Problem.** The same information is split across six places: the Activity tabs (Doing / Left your Mac / Changed), Settings links to the same lists, Used/Noted/Updated lines under answers, the tray's Pause, the unseen-answer dot, and notifications. Users can't build one picture of "what Otty is doing for me". The "Doing" tab also lists finished items under "Recent", so the label is wrong.

Nobody will browse a log of everything Otty did. People open this place with a question in mind ("did Otty send my file anywhere?", "what's it doing tomorrow?"), so it's built for finding, not reading.

**Actions.**
- [ ] Design one **Logbook** view (named in `docs/DESIGN.md`, "Names"): every row (answer, look-up, page read, memory, change, grant) is one line, *what · when*, with Undo and Open on the row. *Why* and *what it touched* show only when a row is opened. Backed by the ledger, the sent log and `JobStore`, read only.
- [ ] Lead with filters people actually ask about: **Waiting for me**, **Coming up**, **Sent off my Mac**, **Changed things**, and a search box. Rows that need nothing from the user are grouped by day and collapsed.
- [ ] Pin "Needs your OK" and "Coming up" at the top only when they have something in them; Pause sits in the header.
- [ ] Settings "See what left your Mac / See what Otty changed" become links into the Logbook with a view, not separate lists.
- [ ] Under-answer memory lines link to their row in the Logbook.
- [ ] Rename tabs in the meantime: "Doing" → "Now & next", with "Recent" moved to its own tab.
- [ ] Build it so it works at every width of the Otty window (A3).

### 5. Three three-key hotkeys is two too many

**Problem.** ⌥Space, ⌥⇧Space and ⌘⌥⇧Space make people learn a mode up front, and the empty state spends its whole first screen teaching them.

**Actions.**
- [ ] One hotkey that works out what you mean: text selected → ask about it; nothing selected → draw a box; press it twice quickly → whole screen.
- [ ] Keep the separate snip and whole-screen hotkeys, but off by default, under Settings › Shortcuts.
- [ ] Rewrite the empty state around one hotkey plus "or type below". Update README, onboarding, the tray menu and the help page.
- [ ] Smoke specs for each branch of the one hotkey (selection, no selection, double press). Selection detection already exists in `capture.ts`; check its latency, since a wrong guess here is worse than a mode.

### 6. The extra lines under an answer outweigh the answer

**Problem.** In the memory scene, a two-line answer is followed by four actions (Copy, Try again, Edit question, In 中文) and three memory lines (Used / Noted / Updated) with five more links: about 12 tappable things for 2 lines. "Used: Is learning Spanish" reads like a log entry.

**Actions.**
- [x] A **new** memory keeps its own line, in full, with Undo: "Noted: you're learning Spanish · Undo". It's the safety control (CLAUDE.md), and a count like "Remembered 1" would never be expanded, so it must not be hidden.
- [x] "Used" and "Updated" lines are the usual case, so they fold into one small icon on the answer, with the details on hover/click. An update that *changes* what Otty believed (not just adds to it) keeps its own line, like a new memory.
- [ ] Show the action row on the latest answer, and on hover/focus for older ones (keep it reachable by keyboard).

### 7. One vocabulary

**Problem.** Screenshots go by "snap", "snip", "capture" and "picture of your screen". Language has four controls: onboarding, the Settings section, the EN | 中 pill in the message box, and "In English" per answer. The always-visible pill is unclear: does it set my language or Otty's?

**Actions.**
- [ ] Pick one noun and verb for screenshots (suggestion: "snip" for a part, "whole screen" for everything) and replace the rest in the renderer, tray menu, prompts, README and onboarding. Add a test that greps renderer strings for the dropped words.
- [ ] Keep the per-answer language switch. Show the EN | 中 pill only after Chinese has been used once, and let its label say what it does ("Answer in 中文") rather than relying on a tooltip nobody hovers.
- [ ] Rewrite the zh-HK option copy without the three hedges: "Ask in Chinese any time, and tap 中 on an answer to read it in Chinese."

### 8. Background look-ups: say what will happen, without asking anyone to read a plan

See the note at the end on why this is **not** a plan to read before the work starts.

**Problem.** A background look-up's card shows only a title. Once it's running, the user can stop it but not adjust it; once it's done, the report lacks a clear account of what was tried.

**Actions.**
- [ ] On the card, add **one line** built in code: "About 6 pages · back by 9:15 · reads only, buys or signs in to nothing". No expandable plan by default.
- [ ] Expand to more detail **only when something is unusual**: over the monthly limit, a repeat, sites never used before, or more than N pages.
- [ ] Mid-run steering: a running look-up accepts a short note ("only check JR East") that goes into its next step, instead of Stop-and-restart. The note is the user's typed words, so it may narrow what the look-up does but never widen it (`Supervisor` rules).
- [ ] Reports lead with the result. What Otty tried sits in one collapsed line under it ("6 pages read"), opened on request.
- [ ] A failed or empty look-up is the exception that grows: what blocked it and one next step, as a button. Never just "Done · 0 pages".

---

## P2

### 9. Step cards have overlapping buttons

**Problem.** "Done", "Done, check it" and "I'm stuck" overlap. "Replace in Excel" doesn't say what gets replaced. The buttons where Otty acts look like the buttons where the user confirms.

**Actions.**
- [ ] Two button kinds: **Otty does it** (primary, with the target app's icon) and **I did it** (secondary). The label itself says what happens ("Paste =SUM(B:B)"), with no separate preview line to read.
- [ ] Merge "Done, check it" into Done; Otty checks on its own when a check is cheap.
- [ ] Keep "I'm stuck" as a text link, not a button.

### 10. Header and navigation

**Problem.** Six unlabelled header icons; the Activity icon (a split circle) isn't recognisable. The icon set changes per view, Settings is still titled "Otty", and there's no Back.

**Actions.**
- [ ] The title names the view (Chat / Settings / Activity / Chats), with a back chevron outside the chat.
- [ ] At most three header icons in the chat: new chat, Activity, menu (history, search, settings inside). Tooltips with shortcuts on every icon.
- [ ] Merge history and search into one ⌘K-style "Find a chat".

### 11. Reading comfort and the quick view

**Problem.** Body text is about 13 px and footer text about 11 px, in warm grey on dark brown, likely below WCAG AA. The panel is about 370×520 with nested cards. The quick view's hint row wraps "add more", "check writing" and "ask Otty" onto two lines, and Enter does a hidden default ("press ↵ to explain it").

**Actions.**
- [ ] Contrast pass on the meta tokens in `styles.css` (target AA 4.5:1 for text under 14 px), then `npm run screens:update` in its own PR.
- [ ] Quick view: keep at most two hints (esc, the main action). Move "add more" and "check writing" into icon buttons with tooltips.
- [ ] Make the default action a visible button labelled with what it does: **Explain ↵**.
- [ ] Make the app-tag × ("Don't tell Otty about this app") at least a 20 px target.

### 12. Clock-style mix in Activity

**Problem.** One row reads "Every Monday at 9:00 AM · next Sat 21 Nov at 14:56". `shared/repeat.ts` and `shared/when.ts` format times separately; the Saturday next run under "Every Monday" may only be preview mock data.

**Actions.**
- [ ] Format all times through `describeWhen`'s helper, with one shared locale, and add a test for a repeat row.
- [ ] Check the preview mock's `dueAt` against its `repeat`.

---

## First run (part of LAUNCH_READINESS 15.1, noted for when it's redesigned)

- [ ] Don't ask about language on the welcome screen; ask later, or work it out from the first question typed in Chinese. Don't pre-select it.
- [ ] End onboarding with a real answer: Otty explains something already on screen, so the first success happens inside onboarding. It replaces a step (the tutorial copy), never adds one, and a single **Skip** gets past it.

## Further reach (after the above)

- [ ] No "while you were away" card: a summary on every open turns into a "What's new" people close unread. Instead, finished look-ups appear as unread chats (the unseen dot already exists), and only something that **needs an OK or failed** gets a line at the top of the panel, with one button.
- [ ] Undo where the news lands: a notification about something Otty changed carries Undo, not only the Logbook.
- [ ] Earned trust is covered by #1 (offered once after the second allow, never by the model). No separate prompts.

---

## Note on #8: will anyone read a plan before a run?

No, not most people. In the original review this was "show a short plan before any background look-up". On reflection that's wrong for this persona, for three reasons:

1. **People don't read what stands between them and what they asked for.** Permission dialogs, cookie banners and licence agreements show the pattern. A plan shown before the work becomes another thing to click through, and teaches the same Allow reflex item 1 is trying to break.
2. **The user already said what they want.** Asking them to approve Otty's breakdown of it feels like being asked to do Otty's job. People want the result, plus confidence that nothing surprising will happen.
3. **What gets read is what's unusual.** A card that always looks the same is ignored; one that only grows when something is different is the one people notice.

So the value isn't a plan to approve. It's **limits stated in one glanceable line** (how much, when, what it won't do), **detail only when something is off the usual path**, **being able to steer while it runs**, and **a receipt at the end** that people actually open because it holds the result. Those are the actions under #8.

---

## Getting the panel ready for the roomy window

Decided 2026-11-18: Otty has **two views**, not three. The **quick view** stays as it is. The panel and the planned full app become **one Otty window**, whose layout follows its width and which has two states:

| | Compact | Roomy |
| --- | --- | --- |
| For | A conversation beside your work | Sitting down with Otty |
| Opens from | The bubble, and ↵ "continue in chat" | Opening Otty from Applications, the Dock or ⌘-Tab |
| Window | Floats, near the bubble, small | A normal window, centred, large |
| Dock icon and menu bar | No | Yes, while it's open |

Each state remembers its own size and position. An **Expand / Shrink** button switches between them with one resize, keeping the chat, scroll position and draft. Dragging the compact window wider only changes its layout; it keeps floating. Only the button changes how the window behaves, so a window made wide once never covers your work the next time you click the bubble. The concept is in BRAINSTORM, "Quick view and the Otty window".

**Where it stands (2026-11-18).** `panel/Panel.tsx` (584 lines) owns which view is showing (`view` state), the header, the message box, drag and drop, and the snips waiting to be sent. Views take turns in one slot, and each header icon flips to a "back to chat" icon when its view is open (the header inconsistency in #10). The message box is written three times (two text boxes in `quick/Quick.tsx`, one in `Panel.tsx`). Typed drafts live in each window's own state, so moving between the quick view and the panel can lose them. `styles.css` has no container queries.

### A1. Split the panel into a frame plus separate screens

**Actions.**
- [ ] Pull out **Chat**, **Chats**, **Logbook** (today's Activity), **Notebook** (today's "What Otty knows") and **Settings** as screens that don't depend on width or on the window's state.
- [ ] A frame component decides the layout from the window's width alone: narrow, one screen at a time with a title and Back; medium, the chat list beside the chat; wide, a sidebar, the main screen and an optional details pane.
- [ ] The window's state (compact or roomy) lives in main and decides only how the window behaves: floating or not, Dock icon and menu bar, where it opens, which size it remembers. Layout never reads it.
- [ ] Move "where am I" into main as an address (`chat/<id>`, `logbook?view=sent`, `settings/privacy`). Quick view → Otty window keeps your place, Expand / Shrink keeps it trivially (same window), and a notification can open the exact item.
- [ ] Register any new IPC channel for it in `CHANNELS` (D-44); send the address and the requested state, and let main check them.

### A2. One shared message box

**Actions.**
- [ ] One component (text box, snips waiting to be sent, files, language pill, send) with a compact and a roomy version, used by the quick view and the Otty window.
- [ ] Drafts (text, snips, file ids) are kept per chat in main, so moving from the quick view to the Otty window never loses what you typed. The renderer still only gets ids and thumbnails.

### A3. Layout from the space available, not the screen size

**Actions.**
- [ ] Use CSS `@container` queries, because the same component sits in a 370 px window and a wide pane. No viewport media queries for layout.
- [ ] Cap answers at a comfortable reading width (about 680 px) when the window is wide.
- [ ] Cards by kind: confirm and step cards stay narrow (they're decisions, not content); drawings, charts and slides use the extra room.
- [ ] Flatten nested cards at narrow widths while doing this (it also helps #11).

### A4. Lists open their details beside them

**Actions.**
- [ ] Build the Logbook, the Notebook and Chats as a list row component plus a separate details component.
- [ ] Narrow: details open as a new page with Back. Wide: details open in a pane beside the list.
- [ ] Rows follow the rule at the top: one line, with the why and what-it-touched only in the details.

### A5. Split Settings up, and pull out what isn't a setting

**Actions.**
- [ ] Settings change as you go, with no Save button (#2). A prerequisite: a Save button at the bottom of a pane beside a chat would be confusing.
- [ ] Split Settings into sections: anchor links down one page when narrow, sidebar entries when wide.
- [ ] Move the memory list out of Settings into its own **Notebook** screen, beside Chats and the Logbook.
- [ ] Move "What Otty has used" and the monthly limit next to the Logbook.

### A6. Window-wide messages belong to the frame

**Actions.**
- [ ] The health banner, notices and "needs your OK" lines show once per window, in the layout, never on top of content and never repeated per view (#3).

### A7. One navigation model, one set of keys

**Actions.**
- [ ] The same shortcuts at every width and in both states: ⌘N new chat, ⌘F find, ⌘, settings, ⌘1–4 for the main screens, and one shortcut for Expand / Shrink. In the roomy state, add them to the menu bar plus a ⌘K command bar.
- [ ] Keep them in one keymap (`lib/keys.ts`), so they're learned once.
- [ ] Header: a title naming the view, Back when narrow, at most three icons, and the **Expand / Shrink** button (#10). The macOS green button does the same as Expand in the roomy state.
- [ ] The switch is one smooth resize (stepped, under the idle budget), never a window closing and another opening.

### A8. The otter shows the state, so text doesn't have to

**Actions.**
- [ ] Give `components/Otter.tsx` states tied to what's actually happening: thinking, looking something up, waiting for you, done, paused. New poses come from `tools/otty-art/source/` through `prepare.py`, never hand-edited.
- [ ] Large and central when the window is wide; small when narrow and in the bubble. A glance at the otter replaces lines like "Still answering".
- [ ] Keep to the idle budget (NFR-3): state changes are stepped or brief, never a smooth `infinite` animation, and re-measure with `OTTY_METRICS=1`.

### A9. Chats show they're busy

**Actions.**
- [ ] A live dot and a "waiting for you" mark on each row in the chat list, from main's `live` turns, so the wide layout's sidebar works on day one.

### A10. Decide what needs room, and keep safety in reach at any size

**Actions.**
- [ ] Write down, per feature, the narrowest width it works at. Anything needed mid-task (ask, confirm, Pause, Undo, "what left my Mac?") works in the narrowest compact window and stays at most two clicks away there and in the menu bar.
- [ ] Features that really need room (rewind, budgets, goals, Otty's den) may ask to expand when opened narrow, with one tap, rather than squeezing in.
- [ ] Never put a safety control only at wide widths or only in the roomy state. A user who never expands must still be able to stop and undo Otty.

### A11. Onboarding runs in the roomy state

**Actions.**
- [ ] The first launch opens the Otty window roomy, with room for the otter, permission pictures and the first real answer (see First run). When it's done, it shrinks to compact beside the bubble, which also shows the user where Otty lives (LAUNCH_READINESS 15.2).
- [ ] Later permission prompts stay short and work in the compact window.

### Order

These come first, because the roomy state is built on top of them:

1. [ ] Settings that change as you go (A5, #2)
2. [ ] Container queries and a reading width (A3)
3. [ ] The frame and screens split, with "where am I" in main (A1)
4. [ ] One message box with drafts in main (A2)
5. [ ] Lists that open their details beside them (A4)

The rest (the two window states, Expand / Shrink, the Dock icon while roomy) can be built after.

- [ ] Add a `?view=window&width=…` option to `tools/ui-preview` early, with narrow, medium and wide scenes, so `npm run screens` checks every layout from the start.
