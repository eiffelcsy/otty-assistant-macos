# Otty — the first run, and the time to "oh wow"

A review of Otty as a new person meets it, on 2026-11-27 (0.6.1 plus D-85 and D-86). The question: how many steps and
context switches stand between opening Otty and the first moment someone says "oh, that's cool", and how to bring that
moment forward. Sizes are effort (S/M/L), never time.

## The moment worth reaching

Otty has several candidates, but one is the product: **highlight something confusing in any app, press ⌥Space, and a
plain-words answer appears right at the cursor.** It is fast, it happens where the person already is, and no chat app
does it. Snipping a screen error and getting "here's what it means and what to do" is the same moment with a picture.

Smaller, earlier delights exist and should be used as stepping stones, not mistaken for the moment:
- The cove and the otter (zero steps; it lands as "cute", not "useful").
- Pick up text: snip anything and copy its words (needs no AI and no key).
- Explain terms: tapping an underlined word in an answer.
- A look-into that finishes in the background and lands in Needs you (the long-run wow; days, not minutes).

## Today's path, step by step

| # | Step | Where | Notes |
| --- | --- | --- | --- |
| 1 | Download, drag to Applications, open; Gatekeeper and the move-to-Applications prompt | Finder | Unsigned today (LAUNCH_READINESS §19) |
| 2 | Onboarding 1: "Do you also speak another language?" → Let's get started | Otty | A question before any value |
| 3 | Onboarding 2: choose a service and paste a key | Otty | |
| 4 | Leave for the service's site: sign up, verify email, add a payment method or top up, create a key, copy it | Browser | **The wall.** Most non-technical people stop here |
| 5 | Back in Otty: paste, Save & test, Next | Otty | |
| 6 | Onboarding 3: Accessibility → System Settings → find Otty → toggle → authenticate | System Settings | |
| 7 | Screen Recording → the same, and macOS may ask to reopen Otty | System Settings | A relaunch mid-onboarding |
| 8 | Land on Home: greeting, water, Try asking chips | Otty | The chips fill the box; they don't show anything happening |
| 9 | Discover the hotkey | — | Only mentioned inside the Accessibility row's sentence |
| 10 | Go to another app, highlight something, press ⌥Space | Any app | **The wow**, if they get here |

**Count:** about ten steps and three to four context switches (browser, System Settings twice, maybe a relaunch) before
the first real answer, with money asked for before any value is shown. The wow itself is never demonstrated or
practised; the person has to find it.

## What blocks it, in order of damage

1. **The key before the value.** A key needs a separate account and usually a payment. This is the single largest drop.
   The launch plan already fixes it (Model C: sign in, free tier on hosted AI; LAUNCH_READINESS), so the first run
   should be designed for that world now.
2. **Nothing teaches the gesture.** The hotkey is the product, yet onboarding never asks the person to try it.
3. **Two permissions up front.** Screen Recording is only needed for snips, and it can force a relaunch. Asking for it
   before the first snip costs a step and a scare ("record my screen?") for nothing.
4. **A question before value.** The language choice can default from the Mac's languages (it already does when unset)
   and move to Settings or the first Chinese answer.
5. **A quiet landing.** Home's chips fill the box but don't send, so the first screen asks for more work rather than
   showing Otty doing something.

## The proposed path

| # | Step | Change |
| --- | --- | --- |
| 1 | Open Otty: the cove, Otty waves, "Hi! I'm Otty. Want to see what I do?" | One screen, one button |
| 2 | Sign in (or "use my own key", folded) | Hosted free tier; own key stays as a choice (Model C) |
| 3 | Accessibility only, with a picture of the exact toggle and live tick | Screen Recording waits for the first snip |
| 4 | **Practice card:** a sentence with jargon on Otty's own page. "Highlight it and press ⌥Space." The keycap pulses; Otty watches | The gesture is learnt by doing it |
| 5 | The quick view answers at the cursor; Otty cheers once; "That's it. It works in any app." | **The wow, inside onboarding** |
| 6 | Home, with the Calendar widget and one line: "Try it on something you're reading" | Real use starts |

**Count:** five steps to the wow, one context switch (System Settings, once), no money and no browser.

Until the hosted tier exists, the same order still helps with a key: permissions and the practice card first with an
AI-free wow (Pick up text on a snip of Otty's own page), then the key, then the practice answer.

## Recommendations

| Idea | Impact | Effort | Notes |
| --- | --- | --- | --- |
| Practice card in onboarding: highlight a sentence on Otty's own page, press the hotkey, get a real answer, Otty cheers | H | S–M | The single biggest change that needs no server |
| Screen Recording asked at the first snip, not in onboarding | H | S | `needs-screen` already exists for whole-screen capture |
| Hosted free tier as the default first run (Model C) | H | L | Planned; design the onboarding around it now |
| Language question removed from step 1 (defaults from the Mac, changeable in Settings and offered after a first Chinese answer) | M | S | |
| A first-answer moment: the otter's happy face plus one line, once | M | S | Art exists (`cheer`) |
| Try asking chips on a first Home send (with the box showing what was sent), instead of only filling the box | M | S | Keeps "never sends" for every later visit |
| A local first-run funnel: counts of each onboarding step reached and the first hotkey answer, in Usage, never sent | M | S | So the next review is measured, not guessed |
| The hotkey shown on Home's empty state as a keycap until it has been used once | M | S | |

## How to check it

- Run a cold first run on a fresh macOS user account, counting steps and switches, before and after.
- Five people who have never seen Otty, given only "here's an app", with the facilitator silent: note where each
  stops and the first time each smiles or says "oh".
- Once the funnel counts exist, the share of installs that reach a first hotkey answer is the number to move.
