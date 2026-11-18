# Spec 02 · Settings

**Status:** draft for review, 2026-11-18. Planned as D-61 (DEVLOG). Builds on `docs/DESIGN.md` ("Foundations"). Covers UX_REVIEW #2 and A5, and catalogue items G1–G10.

**Why second.** Settings that apply as you go are a prerequisite for the Otty window (a Save button at the bottom of a pane beside a chat makes no sense), and today's screen is the most cluttered: one scroll of seven sections that opens on the API key, with changes lost silently unless you reach Save.

## What's there today, and where it goes

`panel/Settings.tsx`, `MemorySection.tsx`, `ConnectionFields.tsx`, `HomeLanguagePicker.tsx`.

| Today | Becomes |
| --- | --- |
| AI connection (service picker, key, address, model) | **Connection**, last but one, collapsed to a status row |
| Always think deeper | Connection |
| Otty: floating otter, notifications, open at login | **You & Otty** |
| Three shortcut text fields | **Shortcuts**, with a key recorder |
| My other language | You & Otty |
| What Otty has used, monthly limit | **Usage & limit** |
| What Otty knows (learn switch and the list) | The switch moves to **Privacy**; the list moves out to the Notebook screen |
| Privacy: app name, remember chats, keep for, see sent, see changed, forget all chats, web privacy note | **Privacy**, with forgetting in a "Can't be undone" group, and the two lists as links into the Logbook |
| Help: copy diagnostics | **Help** |
| Save button, "Older chats are forgotten when you save" | Gone. Every change applies at once |

## Sections and rows

Rows use Foundations "Row" inside a "Group". Kinds: **switch**, **choice** (a pop-up button), **link** (chevron), **value** (read-only), **keys** (recorder), **hold** (can't be undone).

### You & Otty
Summary in the list: "Otter on · notifications on · opens at login"

| Group | Row | Kind | Description (`--fs-small`, `--text-2`) |
| --- | --- | --- | --- |
| Otty on your screen | Show the floating otter | switch | Click it to open Otty. Right-click for Pause and more. |
| | Tell me when something is ready | switch | A Mac notification when something Otty looked into is done, or needs your OK. |
| | Open Otty when I log in | switch | So things you asked Otty to check later still happen after a restart. *Disabled outside the installed app, with "Only in the installed app" as the description.* |
| Language | Help in my own language | choice | For when a word or a step is easier in your own language. The app stays in English. |

### Shortcuts
Summary: "⌥ Space to ask about highlighted text"

| Group | Row | Kind | Description |
| --- | --- | --- | --- |
| Shortcuts | Ask about highlighted text | keys | — |
| | Snip part of the screen | keys | — |
| | The whole screen | keys | Includes everything on it, such as notifications and other windows. Nothing is sent until you ask. |

When UX_REVIEW #5 (one shortcut) ships, this becomes one row plus an "Extra shortcuts" group, off by default.

### Privacy
Summary: "Chats kept 1 year · notes on"

| Group | Row | Kind | Description |
| --- | --- | --- | --- |
| What Otty keeps | Remember my chats | switch | On this Mac only. Keeps the text Otty read from files, never the files or pictures. |
| | Keep chats for | choice: 30 days, 1 year, Forever | Counted from a chat's last message. *Hidden when Remember is off.* |
| | Let Otty note things about me | switch | Every note shows under the answer with an Undo. |
| | Open the Notebook | link | — |
| What goes with a question | Tell Otty which app I'm using | switch | The app's name, window title and page address (without anything after "?"). |
| What leaves your Mac | Web look-ups | value | The service's `webPrivacy` sentence, as the description. No control: it follows the service |
| | See what left my Mac | link | Opens the Logbook's "What left my Mac" view |
| | See what Otty changed | link | Opens "What Otty changed" |
| Can't be undone | Forget all chats | hold | "142 chats." The real count. *Hidden when there are none.* |
| | Forget everything in the Notebook | hold | "18 notes." |

### Usage & limit
Summary: "142 questions this month" or, with a limit, "142 of 300 this month"

| Group | Content |
| --- | --- |
| This month | A meter block (padding 14 16): the count in `--fs-heading` 20 / 26 800 tabular with "questions" in `--fs-small` beside it, the limit right-aligned in `--fs-small` `--text-2`; a 6 px bar 10 below (radius 3, `--fill-strong` track, `--brand` fill, `--straw` from 80%); 10 below that, one `--fs-small` `--text-2` line: "Plus 23 look-ups on its own, 41 searches and 12 pages. Resets on 1 December." |
| | Link row: "See what it cost on DeepSeek", with an outward glyph instead of the chevron (only when the service has a usage page) |
| Monthly limit | Switch row "Set a monthly limit": "Past it, Otty asks before starting anything on its own. Your own questions always go through." |
| | Choice row "Limit": a 36 px field 88 px wide, tabular, right-aligned digits, with "questions a month" after it in `--fs-small`. *Shown when the limit is on* |

Tokens leave this screen. A saved limit counted in tokens still works and reads "1,000,000 tokens a month" as a value row with a quiet **Count questions instead** button.

### Connection
Summary: "DeepSeek · working" (`--brand-text`), or "DeepSeek · not working" (`--danger-ink`) with a 7 px dot on the Settings entry in the sidebar or header menu.

| Group | Row | Kind |
| --- | --- | --- |
| Your AI service | DeepSeek, with "Key in your Mac's Keychain · checked 2 minutes ago" | value, with the status ("Working" with a check, or "Not working") as the trailing text |
| | Change service or key | link, opening the connection fields in place (a disclosure, not a new page): today's `ConnectionFields`, restyled with Foundations "Field", and its own **Check and save** button |
| | Always think deeper | switch: "Slower, and uses more of your plan, but better on hard questions." |

The key is the one place that keeps an explicit button, because saving it needs a test.

### Help
Summary: "Diagnostics · version 0.9.2"

| Row | Kind |
| --- | --- |
| Copy diagnostics | link, opening the report in place (monospace 12 / 18 in a `--surface-2` box, radius 10, padding 12, max 240 high, scrolls) with **Copy this** under it. Description: "Shown in full before anything is copied. Never your chats or keys." |
| Version | value |

## Layout

### Compact (< 640), at 420 × 580

**Index page** (Settings opened):

| Part | Spec |
| --- | --- |
| Header | Back (to the chat), title "Settings" |
| Search | "Find a setting" field, 36 high, 16 from the sides, 12 below the header |
| Sections | One Group, 16 below the search. Six two-line rows (52 high): a 16 px section glyph in `--text-2`, 12 gap, title `--fs-ui`, summary `--fs-small` `--text-2` (one line, ellipsis), a 14 px chevron trailing |
| Total | 44 + 12 + 36 + 16 + 6 × 52 = 420 px: the whole index fits without scrolling |

**Section page** (a row tapped): pushes in from the right (W4). Header: Back, the section's name as the title, and the "Saved" whisper at the header's trailing edge. Content: groups 24 apart, each group label 8 above its box, 16 px gutters, 16 px bottom padding. No in-content heading, since the header already names the section.

### Medium (640–979)
64 px rail · 240 px list column · content. The list column holds the search field (36, 8 from its edges) and the six sections as two-line rows, selected with `--brand-soft`. The content column has 24 px gutters, the section's name as a `--fs-heading` heading 24 from the top with the "Saved" whisper on its baseline at the right, and groups 24 apart.

### Wide (≥ 980)
216 px sidebar · 250 px list · content with groups at most **600 px** wide, left-aligned 32 px in from the list column. No details pane: Settings never needs one.

## Row anatomy

| Part | Spec |
| --- | --- |
| Row | Padding 12 16. One line: 44 high. With a description: grows with it (2 lines of description: 12 + 20 + 2 + 36 + 12 = 82) |
| Title | `--fs-ui` 600 `--text` |
| Description | `--fs-small` 500 `--text-2`, 2 below the title. **Never truncated**: it's often the consent text |
| Control | Right, 16 from the edge, vertically centred on the row when the description is two lines or fewer; top-aligned to the title line past that |
| Separator | 1 px `--hairline`, inset 16 from the left, not after the last row |
| Disabled row | Title and control at 45%; the description stays at full contrast and says why |

**Control specs.**
- Switch: Foundations "Switch". The whole row toggles it, with the press feedback on the row (`--fill`).
- Choice: a pop-up button 28 high, padding 0 8 0 10, radius 8, `--fill-strong`, `--fs-small` 600, with a 12 px up-down chevron. Opens a native-feeling menu (Foundations "Menu") under it, with the current choice ticked.
- Link: a 14 px chevron in `--text-2`; the whole row is the button. An outward link uses the outward glyph.
- Keys: a keycap group (Foundations "Keycap", 4 apart). Clicking turns the group into a 32 px recording field ("Press the new shortcut", `--brand-line` border, 3 px `--brand-soft` ring) that shows keys as keycaps as they're pressed; Esc cancels, the first full chord saves. A clash shows under the row: "Another app uses this. Pick a different one." in `--danger-ink`, and the old shortcut stays.
- Hold: a small (28) Hold button, "Hold to forget". The fill sweeps over 1.2 s; release early cancels with no message. When done, the row's description becomes "Forgotten" and the button disappears.

## Changes as you go

- Each control saves on change (a toggle on click, a choice on pick, the limit field on blur or Enter). There's no draft state in the renderer.
- **Saved whisper (G1):** "Saved", with a 12 px check, `--fs-meta` 600 `--brand-text`, fades in over `--t-quick` beside the section's name, stays 1.8 s, fades out over `--t-settle`. One whisper per section, restarted by each change. Nothing else moves.
- **Summaries update** in the list as soon as the change is saved.
- **If saving fails:** the control goes back to its old value over `--t-quick`, and a line folds open under the row: "Couldn't save that. Try again." in `--danger-ink`, `--fs-small`.
- **Turning Remember my chats off** forgets saved chats, so it asks first, with an inline unusual Card under the row: "Turn off and forget 142 chats? This can't be undone." with **Turn off and forget** (hold) and **Keep them**. The switch only moves after the hold.
- **Shortening Keep chats for** asks the same way when it would forget any: "Forget 23 chats older than 30 days?" with the same two buttons. When it forgets none, it just saves.

## Find a setting (G8)

Typing filters across all sections: results replace the section list with rows "Remember my chats" over "Privacy" (`--fs-meta`), matched letters in 700. Enter or a click opens that section and scrolls the row into view, where it glows once (the `found` animation, retimed to `--t-drift`). Matching uses `shared/match.ts`, over titles, descriptions and a few synonyms per row ("hotkey" finds Shortcuts, "memory" finds the Notebook rows).

## States

| State | Shows |
| --- | --- |
| Settings still loading | Nothing for 150 ms, then the index with its rows at full size and grey 60%-width bars for summaries |
| Connection not working | Connection's summary in `--danger-ink`; a 7 px dot on Settings wherever it's entered from; Connection opens with "Change service or key" already open |
| Keychain unavailable | The connection fields' existing message, as an unusual Card in Connection |
| Model on this Mac (Ollama) | Web look-ups row reads "Nothing leaves this Mac." |
| Not the installed app | Open at login disabled with its reason |
| Shortcut taken | The clash line under that row, and "1 shortcut needs a change" as the Shortcuts summary in `--straw-ink` |
| Paused | No change here; Pause lives in the sidebar, header and Logbook |

## Keyboard

⌘, opens Settings at the last section used. In the list column, ↑ and ↓ move between sections and the content follows. Tab moves through the content's controls in reading order. Space toggles a focused switch; Enter opens a focused link or choice.

## Accessibility

Each group is a `role="group"` labelled by its label. Switch rows are one control with the title as its name and the description as `aria-describedby`. The Saved whisper is a polite live region. The recorder announces "Recording. Press the new shortcut, or Escape to cancel."

## What main must provide

- One IPC channel to set a single setting (`setSetting(key, value)`), registered in `CHANNELS` with a guard per key, returning the saved value or a friendly error. `saveSettings` stays only for onboarding.
- Counts for the hold rows and the retention prompt (`chatCount`, `chatsOlderThan(keep)`, `noteCount`), worked out in main.
- `lastChecked` for the connection.

## Preview scenes needed

`scene=settings` with `&section=` each of `you`, `keys`, `privacy`, `usage`, `conn`, `help`; plus `settings-index`, `settings-find` (with results), `settings-retention` (the prompt open), `settings-broken` (connection not working), `settings-recording` (key recorder) — at 420, 760 and 1200, light and dark.

## Done when

No Save button anywhere in Settings; every switch round-trips through main (a renderer test per kind); the retention and Remember prompts can't forget anything without the hold; the index fits 420 × 580 without scrolling; smoke steps that pressed Save are updated in the same PR.
