# Spec 14 · Long work stays in its chat: the work card, the pool's speech box, and the report as a doc

**Status:** spec for D-87 (2026-11-27). Builds on Spec 01 (confirm cards, receipts, arming), Spec 04 (the Logbook's Now card), Spec 12 (Pebbles and the Pouch), Spec 13 (the pool) and DESIGN.md's Foundations. Every value is a token in `styles.css` unless it's listed under New values.

**Why.** Today a look-up started in a chat leaves it: its questions wait in the Logbook, the pool only lights straw and says "open the Logbook", and the report lands in a new chat. The user has to go find their own work three times. The work should stay where it was asked for, like a coding agent's run stays in its session: progress and questions in the chat that started it, a question asked once from Otty itself when the user is elsewhere, and the result as a thing to keep.

## Part 1 · Where things live

| What | Before | Now |
| --- | --- | --- |
| A running look-up | Logbook's Now card | A **work card** in the chat that started it, at the point it was started, plus the **work strip** above that chat's message box. The Logbook's Now card stays as the overview |
| A question it asks (read this page?) | Logbook details, Home's Needs you | A **confirm card inside the work card** (Spec 01's anatomy). Also, once, the **speech box** from the pool when no Otty window shows that chat |
| Logbook and Home's Needs you rows | Decide there | One button, **Open chat**, which opens the chat scrolled to the card. They stay the index, so nothing is ever only in a chat that's been scrolled away |
| The result | A new chat with the report | An answer at the **end** of the starting chat: two or three lines of summary and a **doc** Pebble with the full report |
| Scheduled and repeating runs | New chat each time | Unchanged for runs with no live chat: they keep making a report chat, now with the doc Pebble. A run whose starting chat is gone does the same |

Deciding stays one path in main: every surface sends the job id and the answer through the same channel the Logbook uses today, and main looks up what was asked. The renderer never sends an address.

## Part 2 · The work card

Sits in the answer that started the work, where the `start_job` card's receipt was, replacing it once confirmed. Full reading width, at most 520 px, left-aligned with the answer.

```
┌──────────────────────────────────────────────┐  radius 14 · --surface · --elev-1
│ ●  Train times to Sendai                 ⋯   │  12 top · 16 sides
│    Page 3 of about 6 · back by 4:10          │
│    ▬▬▬ ▬▬▬ ▬▬▬ ▭▭▭ ▭▭▭ ▭▭▭                     │  8 above
│                                              │
│  ┌ Read this page? ─────────────────────┐    │  only while waiting
│  │ jreast.co.jp  /en/timetable/…        │    │
│  │ [ Read it ]  [ Skip ]                │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘  12 bottom
```

| Part | Spec |
| --- | --- |
| Card | Padding 12 16, `--surface`, `--elev-1`, radius 14 (the confirm card's surface) |
| Line 1 | The Now card's line 1 (Spec 04): 7 px `--brand` dot stepping full ↔ 35% every 1.2 s, 8 gap, title `--fs-ui` 700. At the end a 28 px icon button, `menu-dots`, "More": **Add a note**, **Stop**, **Show in the Logbook** |
| Line 2 | `--fs-small` `--text-2`, the Now card's words from main ("Page 3 of about 6 · back by 4:10") |
| Progress | The Now card's segments, 8 below line 2 |
| Waiting | The dot turns `--straw` and still; line 2 reads "Needs your OK"; the card gets the unusual variant's 1 px `--straw` inner edge. The confirm card nests 12 below the progress, inset: radius 12, `--surface-2` (one step in from the work card), no elevation, padding 12 14. Its title, detail, buttons, arming (400 ms, 50% visible), receipts and copy are Spec 01's unchanged |
| After a decision | The nested card folds to its receipt (Spec 01, K3) inside the work card, and the dot steps again. Receipts stack, at most three shown, then "and 2 more" (`--fs-meta`, a quiet button that unfolds them) |
| Paused | Spec 01's paused state for the nested card; dot `--straw` and still, line 2 "Paused", **Carry on** as the card's one word button |
| Done | The card folds to one 28 px line, like a receipt: a check in `--brand`, "Looked into it · 6 pages · the report is below", and a 28 px `arrow-down` icon button, "Go to the report". Failed: a dash in `--text-2`, the runner's words, and **Try again** (small secondary) |
| Stopped | One 28 px line: "Stopped after 3 pages", no buttons |

The card is drawn from main's `ActivityItem` for that job (the Logbook's own words), so the two never disagree. In a reopened chat a finished card is drawn static.

## Part 3 · The work strip

While a chat has work running or waiting, a strip sits on top of its message box (inside the capsule's column, above it, 8 apart), so the user can keep talking without losing it. The conversation never blocks: sending a question doesn't stop the work.

| Part | Spec |
| --- | --- |
| Strip | 32 high, padding 0 12, radius 10, `--fill-strong`, full message-box width |
| Contents | The work card's dot (same stepping), 8 gap, title `--fs-small` 600 `--text`, one line, ellipsis; then `--fs-small` `--text-2` "· page 3 of about 6"; at the end a 28 px `arrow-up` icon button, "Go to it" |
| Waiting | Dot `--straw`, still; the words become "· needs your OK"; the whole strip is the button (it scrolls to the nested card and focuses it, no approval) |
| Several | One strip with the first title and "and 1 more"; Go to it scrolls to the first waiting card, else the first running one |
| Hidden | When the work card is on screen (`IntersectionObserver`), the strip fades out over `--t-quick`, so the same thing never shows twice |

## Part 4 · The speech box from the pool

When a job asks something and no Otty window is showing its chat, Otty asks once from the pool.

```
            ┌───────────────────────────────┐   radius 14 · --surface · --elev-2
            │ Can I read this page?      ✕  │   12 top · 14 sides
            │ jreast.co.jp                  │
            │ /en/timetable/tokyo-sendai    │
            │ for “Train times to Sendai”   │
            │ [ Read it ] [ Skip ]   ↗      │
            └────────────╲──────────────────┘
                          ╲  tail, 12 × 8, points at Otty's head
                      ( pool )
```

| Part | Spec |
| --- | --- |
| Window | A new view, `say`: transparent, 300 wide, height from its content (at most 220), shown with `showInactive` so it never takes the focus from the app in front. Placed 6 px above the pool with the tail's tip over Otty's head (the pool's x + 52%); flipped below the pool, tail up, when there's no room above; kept 8 px inside the screen's work area |
| Box | Padding 12 14, `--surface`, `--elev-2`, radius 14. Solid like menus (floating over anything) |
| Title | `--fs-ui` 700 `--text`, Otty's voice: "Can I read this page?". A 28 px `cross-small` icon button, "Not now", top-right |
| Detail | Spec 01's read-a-page detail (host line, path line, unusual line when it applies, decided in `cards.ts`). Then `--fs-meta` `--text-2`: "for “Train times to Sendai”" |
| Buttons | 12 below: **Read it**, **Skip** at 32 high (Spec 01: a decision gets full-size targets), arming as Spec 01; then, pushed to the end, a 28 px `arrow-up-right-from-square` icon button, "Open the chat" |
| Several waiting | One at a time, oldest first. `--fs-meta` `--text-2` "1 of 3" after the title. Deciding one slides the next in |
| Not now | The box closes; the question stays on the work card, the strip, the Logbook and Home, and the pool keeps the needs-you look. The same question never pops up again; a new question does |
| Gone by itself | When the chat with that card is shown in a window, or the question is answered anywhere else |
| Pause everything | Never shown while paused |
| Motion | Opens from the tail: scale 0.92 → 1 and fade, transform origin at the tail, `--t-settle` `--glide`; Otty's pool plays one ring as it opens. Closing is a 150 ms fade. Reduced motion: fades only |

**The pool while asking.** Needs-you is unchanged (`float-pebble`, the straw rim). Its tooltip becomes "Otty needs your OK on something · Click to see it", and a click opens the chat with the waiting card, not the Logbook.

**Safety.** The box is a view with its own `CHANNELS` entries: it receives words from main, and sends back only the job id with `allow` or `skip`. Main checks the job is still waiting on the same question before acting. It never shows the model's words except the job's title (plain text), and never a link the user can click through to the page.

## Part 5 · The report as a doc Pebble

A new Pebble kind, **doc** ("Doc" in `KIND_LABELS`), so a report is a thing to keep, not a scroll of chat.

**In the chat.** The final answer is a short summary (two or three lines the model writes as the report's opening) and a doc card:

```
┌──────────────────────────────────────────────┐  the drawing card's frame (Spec 12)
│ ▤  Train times to Sendai                      │
│    Doc · 6 sources · 4 min read               │
│ ┌──────────────────────────────────────────┐ │
│ │ The fastest is the Hayabusa at 8:36…     │ │  a preview: the first 5 lines, faded
│ │ …                                        │ │  out over the last 24 px
│ └──────────────────────────────────────────┘ │
│ [ Keep ]                  ⤢  ⧉  ⇩            │
└──────────────────────────────────────────────┘
```

| Part | Spec |
| --- | --- |
| Card | The drawing card's frame and actions row (Spec 12, D-85): **Keep** is the one word button; Open (`expand`, "Read it all"), Copy (`copy-alt`) and Save as PDF (`download`) are 28 px icon buttons |
| Title line | A 16 px `doc` glyph (Otty's own, `glyphs.tsx`: a page with three lines and a folded corner), title `--fs-ui` 700 |
| Meta | `--fs-meta` `--text-2`: "Doc · 6 sources · 4 min read", counted in main |
| Preview | The doc's first five lines through `Markdown.tsx`, `--fs-small`, fading out over the last 24 px |
| Reading | Open shows it in the viewer (`?view=viewer`, a new `doc` scene): a 680 px reading column, the doc through `Markdown.tsx` (no remote images, explain links work), its sources at the end as a numbered list of hosts, each one a known address |
| Pouch | A kept doc is a stone like any other Pebble (Spec 12), drawn with the `doc` glyph |

**What a doc is.** Markdown in a ` ```doc ` fence, its first `#` heading the title. Only a job's report makes one (the job prompt asks for it), so a chat answer stays an answer. Saved as text in the chat (images are stripped anyway). Save as PDF goes through `main/draw.ts`'s hidden window, with no JavaScript and every non-`data:` request cancelled, like the other exports.

## Part 6 · Copy

- Never "job", "task" or "queue" (CLAUDE.md). The work is "looking into it"; the card's title is the job's title.
- Questions in Otty's voice in the speech box ("Can I read this page?"), Spec 01's titles on cards in a chat ("Read this page?"), because in the chat the answer around the card already speaks for Otty.
- The Logbook's waiting row: "Waiting: read jreast.co.jp?" with **Open chat**.

## Part 7 · Accessibility

- The work card is a `role="group"` labelled by its title; its line 2 is a polite live region only when it changes to or from waiting, never on every page.
- The speech box is `role="alertdialog"` with `aria-modal="false"`, labelled by its title, announced when it appears; it never takes the focus (`showInactive`), and the user reaches it with the same shortcut that opens Otty.
- The strip's button is named "Go to Train times to Sendai, needs your OK".

## What main must provide

- `ActivityItem` gains `sourceChatId` for jobs started in a chat, and `asking`: the waiting question's card parts from `cards.ts` (kind, host, path, unusual), so no window parses an address.
- A chat's events carry its work cards' `ActivityItem`s (from `JobRunner.list()`, filtered by `sourceThread`), so `useChat` redraws them with the rest of the chat.
- `say` view: its window, placement next to the bubble, and channels `say:show` (main → view) and `say:decide` (`{ jobId, allow }`).
- The report: `JobRunner` appends the answer to the source chat through `ChatSession` (rows only at the end, D-45 boundaries kept) when the chat still exists, else makes a report chat as today.
- `PebbleKind` `doc`, `pebblesOf` counting doc fences after drawings, and `validExport` accepting a doc's PDF.

## Preview scenes needed

`work-running`, `work-waiting`, `work-done`, `work-strip`, `work-strip-waiting`, `doc-card`, `logbook-open-chat`; `?view=say` with `say`, `say-unusual`, `say-several`; `?view=viewer&scene=doc`. Light and dark.

## New values

- `say` window 300 wide, at most 220 tall; tail 12 × 8. Sizes, which the rule test doesn't check.
- The nested confirm card's radius 12 is the existing small-card radius; no new tokens.

## Done when

A look-up started in a chat shows its work card and strip there; its question can be answered on the card, from the speech box or by Open chat from the Logbook, Home or the pool, and every path leaves the same receipt; the report arrives at the end of the same chat as a doc card that opens in the viewer and goes into the Pouch; a scheduled run with no chat still makes a report chat; and smoke covers each path.
