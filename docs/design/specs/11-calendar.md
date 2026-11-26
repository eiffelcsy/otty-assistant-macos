# Spec 11 · Calendar: Otty's own week, with your connected calendars beside it

**Status:** spec for D-73 (2026-11-26). It builds on:
- Spec 05 (the frame, its bands and its header);
- Spec 08 (screens on the cove's glass sheet);
- Spec 10 (connected calendars);
- DESIGN.md's Foundations.

Every value is a token in `styles.css`. Anything new is listed at the end.

**Why.** It's the first place where Otty *does* something lasting, with undo, so the screen has to be calm and obvious. It's a week you can read at a glance, adding an event takes one step, and anything Otty added is plainly marked as Otty's. It isn't a clone of Calendar.app: there are no month grid, no invitations and no colour per calendar beyond two tones.

## Part 1 · Where it lives

- **Nav item:** `{ place: 'calendar', label: 'Calendar', icon: 'calendar', keys: '⌘5' }`, after the Notebook in `NAV`. It's also on the rail and in the sidebar.
- **Menus:** the app menu's View list gains "Calendar ⌘5". On the compact band, the screen menu lists it too.
- **Keys:** ⌘5 opens it from anywhere in the panel.
- **Cove:** it's a shallow screen, like the Logbook. It sits on the glass sheet over the sky, and its header rides the sheet (Spec 09 Part 1).

## Part 2 · The header bar (inside the screen, under the frame header)

A row 44 high, with `--s-4` side padding and the same tokens as `.set-bar`:
- **Left, the range title** (`--fs-title`, weight 600):
  - The week band: "1 – 7 December". A range across months reads "29 Nov – 5 Dec", and across years "29 Dec 2026 – 4 Jan 2027".
  - The list band: "Next 7 days" when it starts today, otherwise the same range format.
- **Right**, three icon buttons and one primary button, `--s-2` apart:
  - "Earlier" (`angle-small-left`, an icon button of 32, tooltip "Earlier ⌘←");
  - "Today" (a `btn--soft btn--small` with that word, disabled when today is already in view);
  - "Later" (`angle-small-right`, tooltip "Later ⌘→");
  - then "Add" (`btn--primary btn--small` with a `plus` icon and the word "Add", tooltip "Add an event ⌘N").
- **A note line** when a connected calendar couldn't be read: `--fs-small`, `--warn`, one line under the bar. For example: "Google Calendar’s sign-in ran out. Sign in again in Settings › Connections."

## Part 3 · The week grid (medium and wide bands, 640 and up)

- **Columns:** a 48-wide time gutter, then 7 equal day columns. Day headers sit in a 40-high sticky row:
  - The weekday ("Mon") in `--fs-small` and `--text-2`, over the date number in `--fs-ui`, weight 600.
  - Today’s date number sits in a 24 circle filled with `--brand-fill`, in `--brand-ink` (the primary button’s words).
- **All-day row:** under the headers, only when there's an all-day event in view. It's at most 3 chips high, then "+N more".
- **The hours:** 07:00–22:00 is shown first. The grid scrolls from 00:00 to 24:00, and opens scrolled to 07:00 or to the hour before the first event, whichever is earlier.
  - Each hour is 48 high, labelled in the gutter in `--fs-small` and `--text-3`.
  - A hairline (`--hairline`) runs at each hour.
  - A half-hour line is a hairline at 50%.
- **The now line:** in today's column, a 2 px `--brand-fill` line with an 8 circle at its left end. It moves once a minute, with a single timer and no CSS animation, to keep to NFR-3.
- **Events:** blocks placed by their start and end, at least 20 high.
  - **Otty's events:** `--fill-strong` with a 3 px left bar in `--brand-fill`. The title is in `--fs-small`, weight 600. The time is under it if the block is 40 high or more.
  - **Events Otty made** (`madeBy: 'otty'`): the same, with a small `paw` glyph (12) after the title. Its tooltip is "Otty added this".
  - **Connected events:** `--fill` (no bar), the title in `--text-2`, and the calendar name in their tooltip ("Swim practice · Apple Calendar"). They're read-only.
  - **Overlaps:** events that overlap share the column side by side, each taking an equal share, in start order.
- **Clicks:**
  - An empty slot opens the event card (Part 5) to add, with that day and the clicked half hour to an hour later.
  - Clicking one of Otty's events opens its card to edit.
  - Clicking a connected event opens a read-only card: title, time, calendar, and the line "From {calendar}. Change it there."
- **Dragging** one of Otty's timed events moves it, snapping to 15 minutes and keeping its length.
  - While dragging, the block follows the pointer at 90% opacity with `--elev-3`, and a hairline outline stays at the old place.
  - Dropping saves at once (`calendar:save`), and the grid shows the saved state.
  - A save that fails puts the block back, and the note line says "Couldn’t move that. Try again."
  - Esc while dragging cancels. A drag of less than 4 px counts as a click.
  - Assistive tech gets each event as a button whose name is "Title, Thursday 4 December, 14:00 to 16:00". Its card is the keyboard way to move it.

## Part 4 · The list (compact band, under 640)

Seven days from the range's start, one group per day:
- **Group label:** "Today", "Tomorrow", or "Wednesday 3 December".
- **Rows:** the time ("All day", or "14:00–16:00") at 88 wide in `--text-2`, then the title, then the `paw` glyph for Otty's, or the calendar name in `--text-3` for a connected one.
- **Empty day:** a quiet row, "Nothing planned", in `--text-3`.
- **Tapping a row** opens its card.
- **Adding:** the Add button only (no slots).

## Part 5 · The event card

A card in the screen, on the cove's glass, centred over the grid at 360 wide (the full width less `--s-4` on the list band), raised with `--elev-3` (no dimmed backdrop). The first field has focus.
- **Title:** "New event", "Edit event", or the event's title for a read-only one.
- **Fields** (the `label` and `field` classes, as in ConnectForm):
  - "What": text, placeholder "Swim practice", at most 200 characters.
  - "Day": `type=date`.
  - "All day": a switch row.
  - "From" and "To": two `type=time` fields side by side, hidden when All day is on.
  - "Notes": a textarea of 3 rows, at most 2,000 characters, optional.
- **Buttons:**
  - "Save" (primary), disabled until What is filled and To is after From.
  - "Cancel" (soft).
  - On an existing event, "Delete" (warn, small) on the left.

  Esc is Cancel, and ⌘↵ is Save.
- **Errors** go in an `error-card` under the fields: "That didn’t save. Try again."
- **Delete** takes no confirmation. Instead, the header bar shows an `ok-card` line, "Deleted “Swim practice”", with an Undo button that saves the event back. It fades after 6 s. The toast (D-59) stays waiting for its own entry.

## Part 6 · The chat card for `plan_event`

A `ConfirmCard` of kind `event`, with glyph `calendar-plus`:
- **Title:** "Add this to your calendar?"
- **Main line:** the event's title.
- **Meta line:** the time in words, "Thu 4 Dec, 14:00–16:00" or "Fri 5 Dec, all day".
- **Buttons:** "Add it" and "Skip".
- **Receipt:** "Added to your calendar “Essay”", with Undo when the ledger says it can.

## Part 7 · Home

Home's Today block (Spec 06) also shows today's events as ticks, using the existing tick look: the time, the state dot, and the title. A connected event's tick has its calendar as the `sub` line. Ticks are ordered by time, events and look-ups together.

## Part 8 · States with ui-preview scenes

| Scene | What it shows |
| --- | --- |
| `calendar` | A wide week with Otty's events, one Otty made, two Apple events, an all-day event and the now line |
| `calendar-list` | The same data on the compact band |
| `calendar-empty` | A week with nothing in it. The grid stays, with a quiet line in the header bar: "Nothing this week. Add something, or ask Otty to plan it." |
| `calendar-edit` | The card open on one of Otty's events |
| `calendar-note` | A Google note line ("Google Calendar’s sign-in ran out…") over the week |
| `confirm-event` | The chat card for `plan_event` |

## New values

None. The 48 hour height and the 48 gutter are `--s-12`, and the 40 header row is `calc(var(--s-8) + var(--s-2))`. Heights and widths aren't checked by the rule test, so nothing goes on its off-scale list.
