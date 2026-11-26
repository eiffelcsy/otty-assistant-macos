# Spec 12 · The Pouch: what you kept, on shelves

**Status:** spec for D-77 (2026-11-26). It builds on Spec 05 (frame), Spec 08 (screens on the glass sheet), Spec 11 (a screen's header bar and card), Pebbles step 1 (Keep on drawings and charts), and DESIGN.md's Foundations. Every value is a token in `styles.css`.

**Why.** "Keep" is a promise. The Pouch is where it's kept: a calm wall of the things Otty made that you wanted, each one recognisable at a glance by its picture. It's not a file browser. There are no folders, no file names and no sort menus. Shelves are just names you give.

## Part 1 · Where it lives

- Nav item `{ place: 'pouch', label: 'Pouch', icon: 'gem', keys: '⌘6' }`, after Calendar. It's also on the rail, the sidebar and the compact screen menu. The app menu gets "Pouch ⌘6", shown but not registered.
- A shallow screen on the glass sheet, like the Logbook and the Calendar.

## Part 2 · The header bar

A row 44 high, as in Spec 11 Part 2:
- **Left:** the title "Pouch" with the count after it in `--text-2`, "Pouch · 12".
- **Right:** a search field (the `set-find` look from Settings, with `search` glyph), 240 wide, the full width on the compact band, where it drops to a second row. Placeholder "Find in your Pouch". Esc clears it.
- **Put back line:** after Put back, an `ok-card` line under the bar says "Put back “Rainfall by month”" with an Undo button. It goes after 6 s, or at the next Put back.

## Part 3 · The wall

- **Groups:** one per shelf, in the order shelves were first used. Each group label (the `Group` label from Settings) is the shelf's name. Pebbles with no shelf come last, under "Not on a shelf". With no shelves at all, there's no label.
- **Grid:** `repeat(auto-fill, minmax(200px, 1fr))` with `--s-3` gaps, and `--s-page` side padding. On the compact band, `minmax(150px, 1fr)`.
- **A stone** is a `<button>` card (the cove glass card, `--r-lg`):
  - **Picture**, 120 high, on `--fill`. The Pebble drawn by `draw()`: a picture is an `<img>` fitted with `object-fit: contain` and `--s-2` padding; slides show their first slide as a `SlideView`. It's drawn lazily, when the stone scrolls into view (IntersectionObserver), one drawing at a time. A failed drawing shows the kind’s glyph at `--i-xl` in `--text-3`.
  - **Under the picture:** the kind's glyph (16) and label in `--fs-small` and `--text-2` ("Chart", "Diagram", "Slides", "Picture"). Then the title in `--fs-ui`, weight 600, clamped to 2 lines. Then the from-line in `--fs-small` and `--text-3`: "From “Trip budget” · 12 Nov", or "From a deleted chat · 12 Nov".
  - Hover lifts it to `--elev-2`, and focus shows `--ring`. Its accessible name is "{title}, {kind}, from {chat}".
- **Opening a stone** opens its card (Part 4).

## Part 4 · The stone card

Centred over the wall at 440 wide, or the full width less `--s-4` on compact. It’s solid like a menu (`--surface`, `--glass-lift-float`), with no dimmed backdrop, and has focus on open. Esc closes it.
- **The picture:** up to 280 high, contained.
- **Title** in `--fs-title`, then the from-line.
- **Shelf:** a `ChoiceRow`-style pop-up labelled "Shelf". Its options are "Not on a shelf", each existing shelf, and "New shelf…". Choosing "New shelf…" swaps the pop-up for a field, placeholder "Recipes", at most 40 characters, with "Save" (Enter) and "Cancel" (Esc). The choice saves at once through `pouch:shelf`.
- **Buttons:**
  - "Open big" (primary) opens the viewer, the same window "open big" uses in a chat.
  - "Go to the chat" (soft) is shown only when the chat still exists. It closes the card and opens the chat at that answer.
  - "Put back" (warn, small, on the left) closes the card, removes the stone, and shows the Put back line.

## Part 5 · Empty and no match

- **Empty Pouch:** the wall's place holds Otty's `idle` face (Otter, 64) above the line "Keep a chart, a diagram or slides from any answer, and it lands here." in `--text-2`, centred.
- **No match:** "Nothing in your Pouch matches “kelp”." in `--text-2`, under the bar.

## Part 6 · Settings

Privacy's "Can't be undone" group gains a hold row, after "Forget everything in the Notebook":
- Title "Forget my Pouch".
- Description "{n} kept things. Chats aren't touched.", or "Nothing kept yet." with the hold disabled.

"Forget all chats" gets the description "Your Pouch and calendar are kept." Find a setting reaches the row with the words "pebbles kept delete clear".

## Part 7 · Scenes

| Scene | What it shows |
| --- | --- |
| `pouch` | A wide wall with two shelves and some stones not on a shelf: charts, a diagram, slides, and one from a deleted chat |
| `pouch-list` | The same on the compact band |
| `pouch-empty` | The empty Pouch |
| `pouch-card` | A stone's card open, with its shelf pop-up |
| `pouch-search` | A search with matches, and the Put back line showing |
| `settings-privacy` | The updated Privacy section (the existing scene, updated) |

## New values

None. The 200 and 150 grid minimums, the 120 picture height and the 440 card width aren't checked by the rule test.
