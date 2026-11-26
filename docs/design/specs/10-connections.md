# Spec 10 · Connections: Settings › Connections and the chat card

**Status:** built (D-54, 2026-11-26; CHANGELOG). The chat card says "Manage it in Settings › Connections." as plain text: no chat card can open a Settings section yet. Builds on Spec 02 (Settings: rows, groups, holds, apply as you go) and DESIGN.md "Foundations". Every value here is a token in `styles.css`; anything new is listed at the end.

**Why.** A connection is a new level of reach, so the screen has three jobs. It says plainly what Otty can read, makes connecting as easy as pasting one thing, and makes the off switch obvious. The look is Settings', not a marketplace: one list, no tiles, no logos. Every service gets a UIcon, not a brand mark.

## Part 1 · Where it lives

- A new Settings section, **Connections**, icon `plug-connection`, placed between **Privacy** and **Usage & limit**. Its `SectionId` is `'links'`.
- **Summary in the list:**
  - None connected: "None yet".
  - One or more: "Canvas on", "Canvas and Notion on", or "Canvas and 2 more on". Names are in the order connected.
  - A tool turned itself off, or a sign-in ran out: the summary turns warn, "Notion needs you".
- **Find a setting** gains these entries, all in section `links`:

| Entry | Extra search words |
| --- | --- |
| Connections | calendar canvas notion google mcp connector app |
| Add your own connection | mcp server custom connector address |
| Apple Calendar and Reminders | eventkit |
| Google Calendar | gmail account |
| Canvas | school course assignment nus |
| Notion | notes pages |

## Part 2 · The section

Top to bottom:

**Group "Connected"** (hidden when empty). One row per connection.
- Glyph by kind:
  - Apple: `calendar`
  - Google: `calendar-clock`
  - Canvas: `graduation-cap`
  - Notion: `notebook`
  - Your own: `puzzle-alt`
- Title: the name ("Canvas", or the name the person gave).
- Description, one line, from main (`view.reads`):
  - Apple: "Reads your calendars and reminders on this Mac"
  - Google: "Reads your Google calendars"
  - Canvas: "Reads what's due and announcements at canvas.nus.edu.sg"
  - Notion: "Reads pages you've shared with Otty"
  - Your own: "{n} of {m} tools on · {host}"
- Value on the right, only when something is wrong (`--warn` text role):
  - "Needs you": a tool changed, or a sign-in ran out.
  - "Off": the web is off.
- Tapping the row (a chevron that turns, `angle-small-down` and `angle-small-up`, as in Connection's "Change service or key") opens its **detail** under it. One detail is open at a time.

**The detail** (inside the row's group, inset `--s-4`, `set-conn` layout):
1. **The privacy line**, `--fs-small`, `--text-2`. From `view.privacy`, for example "What Otty reads goes to DeepSeek with your question, and shows in What left your Mac." For Apple with a model on this Mac: "Stays on this Mac."
2. **Tools** (your own only): group label "What Otty may use", then one `SwitchRow` per tool.
   - Title: the tool's title, or its name with `_` read as spaces, capitalised.
   - Description: its description, cut to two lines (`line-clamp: 2`), as outside text in `--text-2`.
   - A tool that can change something gets a trailing tag, "Asks first" (the `hint` class, no pill).
   - A changed tool: the switch is off, and the description is replaced by "Changed since you turned it on. Check what it does before turning it on again." in the warn role.
3. **Buttons** in a row, `--s-2` apart, all `btn--small`:
   - "Check again" (`btn--soft`, your own only). While it runs: "Checking…".
   - "Sign in again" (`btn--soft`, only when `status === 'needs-sign-in'`).
   - "Hold to disconnect" (`HoldButton`, `what` = the name). Disconnecting forgets the key, revokes it at Google, and leaves chats alone.
4. When something fails, an `error-card` appears under the buttons with main's friendly words.

**Group "Add a connection".** One row per built-in not yet connected, then "Your own connection".

| Row | Description |
| --- | --- |
| Apple Calendar and Reminders | Your Mac's calendars, including Google ones you've added to Calendar. Stays on this Mac. |
| Google Calendar | Sign in with Google. Otty can read your calendars, never change them. *Not set up in this build* when there's no client ID: the row is disabled. |
| Canvas | Paste a token from your Canvas profile. Otty can read what's due and announcements. |
| Notion | Paste a token from an integration you made. Otty sees only pages you share with it. |
| Your own connection | Any app with a connection address (MCP). Its help pages give you the address. |

Tapping one opens its **form** under it (Part 3). One form or detail is open at a time across the whole section.

**Footnote** under the groups (`--fs-small`, `--text-2`, `--s-3` above): "Connections only work while you're asking. Background look-ups never use them."

**Web off** (a model on this Mac): online rows in both groups get the description "Off while Otty uses a model on this Mac." and can't be opened. Apple works as normal.

## Part 3 · The form (`ConnectForm`, shared with the chat card)

One component, `components/ConnectForm.tsx`, takes `kind`, an optional `draft` (to fill it in) and `onDone(view)`.

- **Apple:** one line, "macOS will ask you to allow Otty.", then the primary button "Allow access". It calls `connect({ kind: 'apple' })`. A refusal shows the error card "Otty isn't allowed to read your calendars. Turn it on in System Settings › Privacy & Security › Calendars.", and a "Open System Settings" link button (`shell:open` to `x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars`).
- **Google:** the primary button "Sign in with Google". While waiting: "Finish signing in in your browser…" with a spinner glyph (`spinner`, stepped), and a quiet "Cancel" button that calls `cancelConnect()`.
- **Canvas:**
  - Field "Your school's Canvas address", placeholder `canvas.nus.edu.sg`. `https://` is added when missing.
  - Field "Token", `type=password`, placeholder "Paste it here". Under it, the help line "In Canvas: Account › Settings › New access token."
  - Primary button "Check and connect".
- **Notion:**
  - Field "Token", password, placeholder `ntn_…`. Help line: "At notion.so/my-integrations, make an integration, copy its secret, then share pages with it."
  - Primary button "Check and connect".
- **Your own:**
  - Field "Name", placeholder "Linear", at most 40 characters.
  - Field "Address", placeholder `https://mcp.example.com/mcp`.
  - Choice "How it signs in" with three options: "No sign-in", "A key or token", "Sign in in the browser". The default is "Sign in in the browser".
  - With "A key or token": a field "Key or token", password.
  - Primary button "Check and add". Once it's checked: "Added. Turn on the tools you want Otty to use." in the ok-card, and the new row's detail opens with every tool off.
- **Buttons** are disabled until the fields are filled in. The words while checking are "Checking…".
- **Errors** (`error-card`) are main's words, never raw text. The form keeps what was typed except the token, which is cleared after every try.
- **Keys** are never shown again after saving. A connected row never offers to show one.

## Part 4 · The chat card (` ```connection `)

When the user asks Otty to connect something, the answer can hold a ` ```connection ` block. `Markdown.tsx` shows it as `.connect-card`, the same frame as the tile card (`TileCard`):
- **Header row:** the kind's glyph, then the title. For a built-in it's "Connect {Name}". For your own it's "Add “{name}”", with the host under the title in `--font-mono`, `--fs-small`. The host is what the address really points at, so a lookalike is visible.
- **Body:** `ConnectForm` for that kind, filled from the draft. Your own gets name, address and sign-in. A key or token is never filled in.
- **Done:** the card collapses to one line, "{Name} is connected. Manage it in Settings › Connections.", with a link button that opens that section.
- **Already connected:** "{Name} is already connected." with the same link.
- **A damaged draft** (`connectionDraft` returns null) shows as a normal code block.
- **In the quick view:** the card shows "Continue in chat to set this up." with the ↵ chip, and no form (the quick view is too small for a form, and keys typed there would be one window too many).

## Part 5 · Motion and states

- The detail and the form open with the group's existing height transition (`--t-settle`, `--glide`). There's no new motion.
- **States with ui-preview scenes:**
  - `connections`: two connected (Canvas, and your own with one tool changed), the add group below.
  - `connections-add`: the "Your own connection" form open, with "A key or token" chosen.
  - `connections-mcp`: your own connection's detail open, showing tools on, off and changed.
  - `connections-off`: web off.
  - `connect-card`: a chat answer holding the card for "Add “Linear”".

## New values

None. Everything uses the existing row, group, field, button, card and switch classes. `.connect-card` reuses `.tile-card`'s rules by sharing its class list.
