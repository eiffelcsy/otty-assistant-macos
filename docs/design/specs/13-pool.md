# Spec 13 · The pool: the bubble as a piece of the cove

**Status:** spec for D-82, step 1 (2026-11-26). It builds on BRAINSTORM's "The pool", Spec 07 (the cove's paintings and night filter), D-37 and D-38 (feeding, moods, dozing), and DESIGN.md's Foundations. Every value is a token in `styles.css` unless it's listed under New values.

**Why.** The bubble is the first thing a tester sees. A green ball with a bust in it is a picture of an app. A pool of the cove's own water, with Otty floating in it at the true hour, is a piece of Otty's place on the desktop.

## Part 1 · Shape

- **The window** is 128 × 96, transparent. The **pool** sits inside it at `inset: 18px 8px 10px`, so it's 112 × 68, with 18 px above it for Otty's head: a horizontal ellipse (`border-radius: 50%`).
- **The water** fills the pool: `<img>` of `cove-<time>-water.webp`, `object-fit: cover`, `object-position: 50% 30%` (the sunlit band of the water).
- **The rim** is glass, made of three layers, all on the pool:
  - an inset hairline highlight, `inset 0 1px 0 rgba(255,255,255,0.55)`;
  - an inner shade at the bottom, `inset 0 -6px 10px rgba(20,40,50,0.28)`;
  - an outer drop, `var(--elev-2)`.
- **Otty:** `<img>` of the float frame, 104 wide (a little oversized for the pool, chosen by the owner on 2026-11-26 for cuteness), centred at 52% across, floating so his head breaks the top rim. The image's top is 4 px from the window's top, 14 px above the pool's, and `overflow: visible` on a wrapper lets the head show above the ellipse. The pool itself clips only the water.
  - **Night:** Otty gets the cove's night filter, the same `filter` value as `.cove-otty__img` at night (copy it from `styles.css`).
- **Reflection:** none in step 1.

## Part 2 · States, one at a time

The root is `.bubble.pool`, plus a state class. Classes in quotes are what smoke and tests find.

| State | When | What shows |
| --- | --- | --- |
| Resting | idle, no mood | `float`; still |
| Hover | pointer enters | One bob (translateY 0 → −3 px → 0, `--t-settle`, stepped in 3) and one ring: a 1.5 px white ellipse at 40% that grows from the pool's size to 1.15× and fades, once, about 600 ms. Never again until the pointer leaves and comes back |
| Working | `mood === 'working'`, or Otty is answering (`state === 'thinking'`) | Frames step `float` ↔ `float-paddle` every 700 ms (CSS `steps(1)` on two stacked images, opacity). Marker `"bubble__working"`: a small wake, a 10 × 3 white ellipse at 35% opacity behind Otty's feet, still |
| Needs you | `mood === 'waiting'` | `float-pebble` (Otty holds up sea glass), and the rim lights straw: an outer `0 0 0 2px var(--straw)` added to the shadows. Marker `"bubble__working bubble__working--waiting"`: the straw ring itself, as an element so it can be found |
| Has an answer | `badge` | Marker `"bubble__badge"`: a piece of sea glass, a 12 × 9 rounded shape (`border-radius: 40% 60% 50% 50%`) in `--straw` with a white highlight dot, sitting on the open water below Otty’s feet, in front of him (right 22 px, top 66 px). It bobs once when it appears (the hover bob), then stays still |
| Paused | `mood === 'paused'` | The water greys and stills (`filter: saturate(0.25) brightness(0.92)` on the water only). Marker `"bubble__paused"`: a glass bead (18, `--surface`, `--elev-1`) with the `pause` icon, at the pool's left edge |
| Asleep | idle with nothing for `SLEEP_MS` (unchanged) | `float-doze`, and three "z" letters (`--fs-small`, weight 600, white at 80%) rise 8 px and fade, staggered 150 ms, once. A hover wakes it, as now |
| Feeding | a file or text is over it | The pool swells to `scale(1.08)`, the rim lights `--grass` (like Needs you, in green) and Otty opens its mouth wide (`float-mouth`); on the drop, one bite (`float-munch`, 900 ms) and a ripple |
| Fed | on the drop | Two rings (the hover ring twice, 120 ms apart). Otty's frame doesn't change: the munch face is retired from the pool |
| Carried | held after moving `CARRY_PX` | The pool tilts −4° (`rotate`). On landing, one ring |

**Order** when several are true: paused > needs you > munching > feeding > working > carried > asleep > resting. Feeding outranks working because it answers the user's own drag (2026-11-27). The badge shows alongside any of them except asleep, and a badge arriving wakes Otty.

## Part 3 · Motion and the idle budget

- Only the working loop runs for any length of time, and only while something runs. Everything else is one brief motion, then still.
- Stepped, never smooth infinite (NFR-3, CLAUDE.md).
- Reduced motion: no bob, no rings, no rise and no loop. Working shows `float-paddle` still, and state changes are a 150 ms fade.
- The hour's water changes by one timer (`untilNextCove`), never a poll.

## Part 4 · Tooltips and accessibility

- `TITLES` is unchanged.
- The root gets `role="button"` and `aria-label` = its title. It keeps `title`, which shows Otty's own tooltip, because the bubble is the one view where that isn't installed: the native one shows.

## Part 5 · Scenes (`?view=bubble`)

`pool` (day), `pool-working`, `pool-waiting`, `pool-answer`, `pool-paused`, `pool-asleep` and `pool-night` (resting, night water and filter). Each is light and dark; the page around the pool is transparent.

## New values

- The rim's two inset shadows and the ring's white at 40%, written in the pool's rules: glass highlights have no tokens yet. They follow the cove's glass rim (Spec 08), which uses the same kind of literal rgba, so the rule test's colour check treats them like the cove's.
- 128 × 96 window, 112 × 68 pool, 104 Otty, 12 × 9 sea glass, 10 × 3 wake. These are sizes, which the rule test doesn't check.
