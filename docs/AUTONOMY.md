# Otty — Autonomy direction

Where Otty's design is heading in the long run: from something you ask, to something that looks after things for you. This is a compass, not a plan. Ideas live in [BRAINSTORM.md](BRAINSTORM.md), and work gets planned in [DEVLOG.md](DEVLOG.md). When designing a feature, check it against [the checklist](#checklist-for-every-feature).

> Otty keeps working when you look away, notices what's worth noticing, prepares things before you ask, and only taps you on the shoulder when it's worth your attention.

**Where this came from.** A summary of DeepSeek Harness's "Exploring Super-agent Design" (Nov 2026), which is about coding agents. It was read through someone else's summary, not the paper itself. Its experiments use simulated work, so they measure scheduling, not quality, and its code is a research prototype. Treat it as a source of ideas, not as proof.

## The main lesson

**Autonomy is a systems problem, not a smarter-model problem.** A model can reason, but something has to manage time, state, interruptions, failure and limits, the way an operating system manages a CPU. In Otty's terms ([BRAINSTORM](BRAINSTORM.md#scaling-with-better-models)), the model is rented and this runtime is part of what we build. It also multiplies: better models take on longer jobs, which makes coordination matter more, not less.

**The scarce resource is the user's attention.** Developers can follow 3–5 agents at once. Otty's users will follow none, and they shouldn't have to. They have one otter, and whatever is happening has to reach them through it.

## Where Otty stands

Otty already has most of the *safety* design for this: the levels and Rule of Two in Otty's chores, confirm cards, "the model proposes, code decides", `webOff` enforced inside `runTool`. What's missing is the *runtime* underneath.

Stage 1 is built ([D-22](DEVLOG.md)), so most of the runtime gap has closed: turns belong to chats, the tool loop is shared (`loop.ts`), allowed tools are a real limit, jobs are saved step by step, and a confirm can wait until tomorrow. What's left:

| Today | Why it matters |
| --- | --- |
| Which tools are safe where is kept in hand-written lists | Stage 2 needs one source of truth ([D-26](DEVLOG.md)) |
| No timer or launch at login | Nothing happens unless a person starts it ([D-27](DEVLOG.md)) |
| The only input is a person (hotkey, bubble, typing) | Otty can't react to anything else |

## The ideas, in general form

Each one is written so it applies to any assistant, then says what it means here.

### 1. Separate the one who talks from the ones who work

*Paper: a long-lived Router that never executes, plus isolated Workers.*

The thing the user talks to must never be busy. Work happens elsewhere, in isolation, and reports back.

**For Otty:** this fits better than it does for coding. The otter *is* the Router: one character, one relationship, however many jobs run behind it. But the front doesn't need to be a model. A dispatcher in plain code is enough for now, and an extra model call in front of every question would break NFR-2. A question still goes straight to a chat turn. The structural rule: **chat turns only get quick tools, and anything long has to be a job.**

### 2. Make the important property impossible to break, not merely encouraged

*Paper: a delegation-first prompt fixed the median (13.8 min) but not the slow tail (29.0 min). Only the architecture fixed the tail (15.7 min).*

Prompts improve the typical case. Structure bounds the worst case.

**For Otty:** trust is set by the worst case, so this is the idea to hold on to. It extends what's already here: a job's tools are limited inside `runTool`, not just in the list it's offered, because a model can call a tool it wasn't offered (see the comment in `tools.ts`). This doesn't conflict with "Tools before pipelines". **Code owns the boundaries, and the model has free judgement inside them.** Boundaries are Durable. Rules that work around a model's weaknesses are Scaffold, and should shrink.

### 3. Everything that happens is an event

*Paper: triggers (messages, PRs, CI, email) are the main input, not prompts.*

Make one typed stream of things that happened. A user's question is just one kind. A timer, a finished job and a machine waking are others.

**For Otty:** the sources are on the Mac: time, wake, app switches (`windows.ts` already listens to one workspace notification), calendar, reminders, a page changing. Events are recorded locally.

**New risk that the paper leaves open:** until now, only the user could start Otty. With events, a stranger's email or a web page can start work. So: **event content is data, never a decision.** An event can only start a recipe the user already approved. Its text never picks tools, sites or recipients.

### 4. Filter cheaply first, and think only about what's left

*Paper: a fast deterministic path, then a slow semantic path.*

Run the cheapest possible check first, and pay for judgement only on what survives.

**For Otty:** filtering protects privacy as well as money, so it has more stages. In order:

1. **Consent:** is this source switched on?
2. **Rules:** is it relevant at all?
3. **Local judgement:** the D-1 encoder or OCR, which costs nothing and sends nothing.
4. **Model:** only with data the user has agreed to send.

### 5. Whoever owns a topic gets its follow-ups

*Paper: subscription and pass-through. Later events go straight to the Worker.*

Don't re-triage what's already assigned.

**For Otty:** this is small, because it's a saving rather than a speed-up: in the paper it cut tokens by about a quarter and left completion times flat. A recipe's trigger is already its subscription, and replying to an inbox note continues that job. No many-to-many machinery needed.

### 6. Treat context as a cache, with links to the rest

*Paper: Inline & Spill, and Chain of Recall over linked ids.*

Keep a short summary and ids in context, and fetch the rest when needed. Give everything an id, and link it to what caused it.

**For Otty:** this suits the cache rule well: recalled content arrives as a tool result, which appends, so nothing already sent changes. D-13's history budget, D-10's `forPrompt` and a `recall` tool over `chat_search` are all this idea. Links also pay off for trust, because they answer **"why did you do that?"**: note → job → trigger → recipe → the chat where you agreed.

Scope memory by job, too:

| Scope | Holds | Who sees it |
| --- | --- | --- |
| **Global** | Memories about the user (D-10) | Chat turns; a job only if its recipe says so |
| **Job** | The job's own history | That job |
| **Shared** | Saved chats, pages, documents | Only through `recall`, and it counts as private data under the Rule of Two |

### 7. Prepare ahead, but make wasted work free

*Paper: speculative execution. Start before you know it's needed.*

Speculation is only safe when discarding it costs nothing: no side effects, little expense, nobody interrupted.

**For Otty:** already shipped in small form: explain cards warmed after an answer (D-18). The general rule is **prepare freely, deliver on demand, act never.** Speculative work gets no tools with side effects. Local preparation is free. Anything that sends data needs a source the user opted into, which is why "Answer before ↵" is still an open decision.

### 8. Never block the conversation

*Paper: full-duplex. `start()` returns at once, and results come back as events.*

Long work returns a handle, and the result arrives later as an event. Waiting is a state, not a stuck thread.

**For Otty:** "waiting for you" has to be a saved state, so a confirm card can sit in the inbox until tomorrow. Each surface is a channel with its own length, and a job returns a headline plus a body so each surface can use the right one:

| Surface | Budget |
| --- | --- |
| Otter's mood | No words: working, waiting, something ready |
| Speech bubble | A few words |
| Quick view | A short answer |
| Inbox note | A headline and a few lines |
| Panel | As long as it needs |

### 9. State outlives the process

*Paper: separate compute, state and environment, so agents run in the cloud and reach the Mac through a daemon.*

The truth about a job lives in storage, not in a process, a promise or a context window. Any process can die and the work carries on.

**For Otty:** take the state half now, and leave the cloud half. Jobs live in `otty.db`, step by step. The Mac sleeps, so design for that honestly: pause on sleep, catch up once on wake, and say so. A missed Monday job runs once, not three times. Keep jobs behind an interface, as `ChatStore` and `Provider` are, so compute could move one day if there's a real reason. Otty already separates brain from hands anyway: the brain is an API, the hands are on the Mac.

### 10. Check for progress, not just life

*Paper: an independent Watchdog that checks health and whether tasks are going anywhere.*

Running isn't working, and working isn't doing what was asked. Something outside the work should check all three.

**For Otty:** start with plain code: step limits, time limits, spend limits, the same call repeated, and auto-pause after failures. `MAX_TOOL_ROUNDS` is the seed of this. A model check for drift can come later.

**The supervisor can never widen a limit.** It reads what jobs read, so hostile text can fool it just as it can fool a job. If it could loosen a limit, fooling it would remove a safeguard. If it can only tighten, the worst outcome is a job stopped for no reason. That's the same reason a classifier can only make a decision stricter. The paper's Watchdog can rewrite rules because engineers watch it and have git. Otty's users have neither.

This limits who widens the limits, not how much Otty can do:

| Kind of change | Example | Who can make it |
| --- | --- | --- |
| **How the work gets done** | Restart a stuck job with a new plan, try another search, reword its own instructions | The supervisor |
| **Inside limits the user set** | Share a monthly budget across jobs | The supervisor |
| **Tightening a limit** | Pause, stop, lower a level | The supervisor |
| **Widening a limit** | Raise a budget, allow a site, add a tool or a data source | Only the user, with a card or a setting. The supervisor can suggest it |

**Limits are what let Otty run unattended.** With the worst failure bounded, nobody has to watch each job. And the rule matters more at each stage, as Otty reads more without anyone there.

## What a coding agent gets for free, and Otty doesn't

The paper's setting hides some problems. These are Otty's to solve, and they're what make this harder than a coding agent:

| A coding agent has | Otty has | So |
| --- | --- | --- |
| Git, so mistakes can be undone | No version control over a person's life | Prepare rather than act, and every action needs a confirm or an undo |
| A pull request as a review step | A non-technical user who may not check | Results must be plain, short and honest about uncertainty |
| Interruptions that are part of the job | A pet that can become a nuisance | One attention budget shared by everything unprompted |
| Work data | Private life | Noticing stays local, and "Watching" stays rejected |
| A company paying for tokens | The user's own key | A visible daily budget. The paper's design used 3.8× the cache-read tokens |
| A team, so scaling the Router is a question | One person on one Mac | Skip multi-Router design completely |

**Attention is a budget, not a setting.** Being wrong out loud costs more than being quiet. Everything unprompted shares one small daily allowance, a dismissal should shrink it, and quiet mode always wins. Proactive help stays off until evals show it's rarely wrong.

## The shape to build towards

```
Sources      question · hotkey · timer · wake · job finished · page changed · app switch
   │
Event log    one typed record each, in otty.db
   │
Gate         consent → rules → local judgement → model, only if needed
   │
Dispatcher   plain code: answer now, start a job, pass to its owner, or drop it
   ├───────────────┐
Chat turn        Jobs         own history, locked tools, budget, saved step by step
   │               │
   │           Supervisor     plain code: limits and repeats; never widens a limit
   ├───────────────┘
Attention    quiet mode, daily allowance, confidence
   │
Surfaces     otter's mood · speech bubble · quick view · inbox · panel
```

A question from the user skips straight to a chat turn, so NFR-1 and NFR-2 are unaffected.

A job's states are kept by code, never by the model: **scheduled → working → waiting for you → done**, with **paused** and **failed** to the side. People see those words in the activity list and inbox.

## Stages

Each stage is useful alone, and Otty takes more initiative at each one. Move up only when the last stage has earned it.

| Stage | Who starts it | Example | Needs |
| --- | --- | --- | --- |
| **0. Reactive** (today) | You, now | Answer this | — |
| **1. Non-blocking** ([D-22](DEVLOG.md)) | You, now, and you walk away | Keep going after closing; ask something else meanwhile | Shared tool loop, jobs, Activity, sleep and wake |
| **2. Standing** | You, ahead of time | Ask me later, Watch for me, first chores | Timer, launch at login, recipes, budgets, once-only checks for tools with side effects |
| **3. Noticing** | The Mac, with nothing sent until you tap | Paw-raise on an error dialog | Local events, the gate, the attention budget, Swift AX helper |
| **4. Anticipating** | An opted-in source | Prep note before a meeting | Calendar access, speculation rules, evals proving precision |
| **5. Initiating** | Otty suggests, you agree | Offers a chore from your habits | D-10 habits, plus everything above |
| **6. Looking after you** | Otty, inside one permission you gave | A greeting with a focus list; "time for some water" | [Look after me](#look-after-me), plus everything above |

Actions stay separate from initiative. A Stage 5 chore still can't send, pay or delete. The levels in [Otty's chores](BRAINSTORM.md#ottys-chores-safe-proactive-work) decide that.

**How limits widen.** Who decides stays fixed, and how far the limits reach keeps growing, so the user makes a few big decisions and Otty handles the many small ones:

1. A card for every job.
2. Agree to a recipe once, and it runs unattended from then on.
3. Set wider limits, such as a monthly budget or a list of trusted sites, and Otty works freely inside them.
4. Otty suggests widening from its record ("you've approved this 10 times, want me to stop asking?"), and evals show which actions have earned it.

Cards can turn into a habit people click through, which weakens them, so their number should fall quickly through steps 2 and 3.

### Look after me

The furthest this direction goes for now: Otty greets you with a short priority list for the next few hours, and offers wellbeing and productivity suggestions nobody asked for.

**Priority: medium, and on purpose.** Autonomy compounds, so it builds on whatever is underneath it, flaws included. This waits for a strong foundation: the eval, tool labels, standing work and real use of what has shipped.

**One permission, not a recipe per nudge.** Recipes suit jobs you can name in advance, and "remind me about something I didn't think of" can't be one. So wellbeing and productivity suggestions sit under a single **Look after me** permission, asked for during onboarding and changeable in Settings. This is step 3 of "How limits widen": one big decision, with Otty free inside it.

| Inside the permission | Still needs its own yes |
| --- | --- |
| Deciding when a suggestion is worth making, and how to word it | Each connection, and what it may read |
| Using memories, habits and what connections already share | Anything that acts: sending, changing, deleting, paying |
| Choosing when to look again | Spending past the daily limit |

It only ever **suggests**. A suggestion can offer a button, but pressing it is still the user's click. Onboarding has to say this plainly, including what gets sent to the model and how often, because the user is agreeing before Otty has earned it.

**Who decides what.** The model decides whether something is worth saying and how to say it, so wellbeing needs a prompt rather than rules. Code decides when the model is asked, what it can see, and how often it may speak, because a prompt improves the typical day and only structure bounds the worst one.

**Otty picks its own next look.** Each time it thinks, it also says when to look again, which replaces a fixed check and sends far less. Around that:
- Code enforces a shortest gap, a daily cap and a longest gap, so a bad guess or a hostile page can't make it wake every minute, and a failed call can't leave it silent for good.
- Cheap local signals can wake it early, such as the user coming back, or a call ending.
- When the time comes, local checks run first: are they at the Mac, on a call, or in Focus mode? If so, it skips the call and tries later, which costs nothing and sends nothing.
- After sleep, it looks once, and doesn't catch up on what it missed.

**It needs a record of itself.** Each model call starts fresh, so what Otty said, when, and how the user reacted are saved and handed back. Without it, every nudge looks reasonable alone and the day adds up to nagging. Dismissals feed the attention budget.

**Connections are the source of context.** Tasks, calendars and messages live in other apps and services, so Otty needs a general way to connect to them, not a one-off per app. Calendar and Reminders are simply the first two. Every connection sits behind one interface, is opted into separately, and starts read-only. Connection content is **private data and outside text at once**: a stranger can write a calendar invite's title. So it's handled as data, never a decision, and a run holding it has no web and no tools with side effects.

This doesn't reopen "Watching". Context comes from connections and local signals the user agreed to, never from sending the screen to a model.

**First foundations, cheapest first:**
1. ✅ Move the tool loop out of `ChatSession.run` into a shared function that takes a history, the allowed tools, a `ToolContext` and a signal (`loop.ts`).
2. ✅ An allowed list enforced in `runTool`, covering Claude's web search too. Tool safety labels are still to come, with jobs.
3. ✅ A `jobs` migration and a `JobStore` interface, with confirm cards that can be saved.
4. `powerMonitor` is in ✅. One timer set for the next due job comes with D-27. No polling, so NFR-3 holds. Re-measure anyway.

**How the current roadmap feeds this:**
- **D-10 memory (shipped):** the Global scope, with each memory's source chat and message kept for the chain in idea 6. A job gets no `learn` in its `ToolContext`, so it can't touch memories by default.
- **D-11 step cards (shipped):** a job whose worker is the user. They kept their own simple state, since sharing job states would have cost more than it saved.
- **D-1 intents:** its encoder is the gate's local judgement stage.
- **D-13 history budget:** Inline & Spill for chats.

## What we're not taking

- **Cloud compute.** It conflicts with privacy and bring-your-own-key, for a benefit (running while the Mac sleeps) that catch-up on wake mostly covers.
- **A model in front of every message.** That adds latency and cost, and Otty's inputs are mostly unambiguous.
- **Monitoring other people's conversations.** Fine for a team's agent, wrong for "without ever making you feel watched".
- **A supervisor that can widen its own limits.** See idea 10. Improving how work gets done is fine.
- **Agent teams and many-to-many subscriptions.** Nothing Otty does needs them yet.
- **Sessionless agents and multiple Routers.** Open research problems that don't apply to one person on one Mac.

## Checklist for every feature

Not every feature needs all of this now, but none should make the direction harder.

1. **Does it block?** Could it keep the conversation busy for more than a few seconds? Then it's a job.
2. **Does it survive?** If the Mac restarts or sleeps halfway, what's left? State goes in `otty.db`.
3. **What starts it?** Could this be written as an event, rather than wired to one button?
4. **Who can trigger it?** Could outside text cause it, or shape what it does?
5. **Is the guarantee in code?** If a safety property depends on a prompt, move it.
6. **Cheapest check first?** Could a rule or local model settle this before a model call?
7. **What does it cost?** In attention as well as tokens. Does it fit the budget, and is that visible?
8. **Can it be seen, stopped and undone?** And can Otty say why it happened?
9. **Does a better model make it better?** Or is it a scaffold to remove later?

## Open decisions

- **NFR-5 needs rewording before Stage 2.** It says nothing is sent until the user asks a question, and a standing recipe sends later. Something like "until the user asks, or has agreed to something that says so" would keep its spirit, and it also covers Look after me. It's the one place this direction changes a promise made to users.
- **What exactly does Look after me send, and how often?** Decided: one permission, asked for at onboarding, for suggestions only. Still open: the wording of that screen, whether it starts on or off, and how existing users get asked.
- **How small should the attention budget start?** It should probably begin at one unprompted thing a day, and grow only if people engage.
- **Where do jobs run?** Most of a job is waiting on the network, so main is fine to start, but a utility process (like `fileWorker.js`) gives stronger isolation. Measure before deciding.
- **What does "private" cover for cloud models?** Already open in Otty's chores, and it decides how far Stage 4 can go.
