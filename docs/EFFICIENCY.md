# Otty — Harness efficiency

How the leanest open-source agent harnesses spend fewer tokens without losing quality, and which of their methods fit Otty, with long jobs and autonomous work in mind. This is research and a direction, not a plan: anything worth building becomes a DEVLOG entry first, and ideas live in [BRAINSTORM.md](BRAINSTORM.md#efficiency-spending-fewer-tokens). Check every method here against [AUTONOMY.md's checklist](AUTONOMY.md#checklist-for-every-feature): a saving that weakens a safety limit is not a saving.

Researched 2026-11-20. Effort uses the DEVLOG's scale (S/M/L by the amount and complexity of the work, never time).

> **The short version.** On today's APIs the bill is mostly *cache economics*, not token counts. The methods that work are boring: keep the prefix byte-stable, take fewer turns, hide old tool output with plain rules in rare single steps, and let code do what code can. Clever compression and model-written summaries often cost more than they save. Otty already gets the first one right; its gap is long jobs, where nothing yet stops the history from growing until it overflows.

## How to read the evidence

- Most numbers below come from one paper, one benchmark, or a vendor measuring its own product. They're shown as reported, with the source, and should be read as direction, not promise.
- Nearly all of it is about **coding agents** on SWE-bench or Terminal-Bench. Otty's long work is research on the web: fewer, bigger observations (pages), no shell, no test suite to check itself against. Where that difference changes the conclusion, it's said.
- Several 2026 arXiv papers were read through abstracts and summaries, not their full tables. Re-check a figure at its source before quoting it in a decision.

## What the evidence agrees on

1. **Token reduction is not cost reduction.** In one study of API coding agents, prompt-cache writes and reads made up about 80–87% of the bill. The most aggressive tool-output compression cut 38% of output tokens and *raised* billed cost by about 7%, and token savings barely predicted cost savings (r ≈ 0.15) ([arXiv 2607.12161](https://arxiv.org/abs/2607.12161)). A 35,000-run study found the same: every compression policy saved tokens, but not always money, and some made runs slower because they caused extra calls ([arXiv 2609.32961](https://arxiv.org/abs/2609.32961)). **Measure billed cost and finished work, never tokens alone.**
2. **The cache hit rate is the number to protect.** Manus calls KV-cache hit rate its most important production metric, because cached input is roughly a tenth of the price ([Manus, via summaries](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/manus/)). Anything that edits what was already sent (a timestamp in the system prompt, a summary swapped in, a tool removed) makes everything after it a miss. TokenPilot's whole result (56–87% cheaper) comes from managing context *without* moving the prefix ([arXiv 2606.17016](https://arxiv.org/abs/2606.17016)).
3. **Tool output is most of the context, so hide old tool output first.** JetBrains and TU Munich found that simply masking old observations halved cost and matched or beat LLM summarization on SWE-bench, and a hybrid saved a further 7–11% ([The Complexity Trap, arXiv 2508.21433](https://arxiv.org/abs/2508.21433)). A 176-configuration harness study found rule-based elision *before* any summarizing was the most efficient strategy, and that making elided content recoverable added machinery models rarely used ([arXiv 2609.20804](https://arxiv.org/abs/2609.20804)). On DiscoveryBench, LLM condensers *raised* token cost by 24–94% with no quality change, while masking tool outputs saved about 9% ([arXiv 2605.18854](https://arxiv.org/abs/2605.18854)).
4. **Compact rarely, in one step, and never compact a compaction.** CliffCompaction deletes and truncates deterministically at a high threshold, so the new prefix then stays cached for a long time, and it reports about half the cost on long runs ([arXiv 2609.26779](https://arxiv.org/abs/2609.26779)). Short tasks gain nothing. Compacting every few turns throws the cache away every few turns.
5. **Fewer turns beat smaller turns.** Each turn resends the whole prefix, so a long job's input grows with the square of its length. Asking for several things in one turn, stopping when nothing new is learned, and not re-reading are the cheapest wins ([2607.12161](https://arxiv.org/abs/2607.12161), [Codex CLI cost notes](https://codex.danielvaughan.com/2026/08/07/token-reduction-is-not-cost-reduction-prompt-cache-economics-codex-cli-cost-strategy/)).
6. **Small, stable prompts and few tools are enough for strong models.** Pi keeps its system prompt and tools under about 1,000 tokens, against roughly 7–10k for the big harnesses, and sends about 3× less context per turn in one comparison ([Tensorlake](https://www.tensorlake.ai/blog/pi-coding-agent-efficient-system-prompting), [Tensorlake comparison](https://www.tensorlake.ai/blog/best-ai-coding-agents-2026)). mini-swe-agent reaches 74%+ on SWE-bench Verified with about 100 lines, one tool and a plain linear history ([mini-swe-agent](https://pypi.org/project/mini-swe-agent/)). The harness study found the right amount of scaffolding depends on the model: planning helps weak models score and helps strong models save ([2609.20804](https://arxiv.org/abs/2609.20804)).
7. **Multi-agent is a quality tool, not a cost tool.** Anthropic's research system used about 15× the tokens of a chat (a single agent about 4×) for a large quality gain on broad research ([Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system)). It pays when the work is wide, parallel and bigger than one window, and wastes money when every worker needs the same background.
8. **Code beats tokens for anything deterministic.** Letting the agent filter data in code and pass only the result cut one MCP workflow from about 150k to 2k tokens ([Anthropic, code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)); loading tool definitions on demand cut one setup from about 134k to 5k and raised tool-choice accuracy ([Anthropic, advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)).

## Where Otty stands today

Read from the code on 2026-11-20.

**Already right:**

| What | Where | Which lesson |
| --- | --- | --- |
| The system prompt depends only on settings; per-turn words go in `turnNote` at the end; nothing already sent is rewritten, and `llm.test.ts` guards it | `language.ts`, `llm.ts` | 2 |
| Try again and Edit cut the history to a prefix and resend the stored question unchanged | `ChatSession.rewind`, `rewind.test.ts` | 2 |
| Tools are added at the end of their group, so the tool list repeats byte for byte | `tools/index.ts` | 2 |
| A tool outside the allowed list is refused in `runTool` rather than removed from the request mid-run (Manus's "mask, don't remove") | `loop.ts`, `toolSafety.ts` | 2 |
| Background calls (titles, explain cards) are separate one-shot `complete()` calls with `reasoning: 'least'` that never touch chat history | `llm.ts`, `explainCache.ts` | 2, 6 |
| A job holds only its brief, not the chat, and its saved report keeps the brief and report, not every page | `jobs/runner.ts` | 3 (isolation) |
| Hard limits in plain code that only tighten: rounds, lookups, work time, the same call three times | `jobs/limits.ts` | 5 |
| Charts, math and diffs are worked out in code; the model gets the numbers | `chart.ts`, `math.ts`, `shared/diff.ts` | 8 |
| Usage is counted per request, including the cached part | `usage.ts`, `providers/index.ts` | 1 (partly) |

**The gaps:**

- **A job's history only grows.** Every `read_page` result (up to `PAGE_MAX_CHARS`, 24,000 characters, in `web.ts`) stays in the job's history for every later request. `LIMITS` allows 24 rounds and 30 lookups. A rough estimate: an English page near the cap is about 6k tokens and a Chinese one can be well over 10k, so somewhere around a dozen full pages, fewer in Chinese, fills `contextTokens` (128k). The service then refuses with "prompt is too long" (`errors.ts`), and the job fails at the point where it had learned the most. The whole history is also resent every round, so input grows with the square of the job's length, and only the cache keeps that affordable.
- **Chats have the same shape**, more slowly. The D-13 history budget is still `considering` in BRAINSTORM.
- **Nothing reports cost in the eval.** `npm run eval` scores answers; it doesn't say what a case cost, cached and uncached, so a change that saves tokens but costs more (lesson 1) would look like a win.
- **One model and one effort level for every step of a job.** Reading a page and writing the final report get the same thinking.
- **A repeating look starts from nothing each time.** A series run (D-34) re-does the searching it did last week.

## Likely applicable

Ordered by value per effort, the way BRAINSTORM orders its tables. "Long-horizon" says how much it matters as jobs get longer and Otty starts work by itself.

### 1. Measure billed cost and cache rate, per run and per eval case

**What it is.** Record, per request, uncached input, cached input, cache writes (Anthropic reports them separately) and output, and roll them up per chat turn, job and eval case. Report the cache hit rate. **Who does it:** the cost studies above, Manus (hit rate as the key metric), Codex CLI's telemetry posts.

**For Otty.** `usageOf` already reads cached tokens; it drops Anthropic's cache-write count into `input`. Keep the split in `Usage`, add it to the job's tally, and add cost-shaped columns to the eval's summary next to the score, compared against the baseline. This is step 0 for everything below: without it no other change here can be judged. Never show money in the UI without a dated price table (CLAUDE.md); token kinds and ratios are enough for the eval.

Impact H · Effort S · Long-horizon: high, it's the only way to see what a long job costs.

### 2. Rule-based masking of old tool output in jobs, in rare single steps ("cliff" compaction)

**What it is.** When a run's history passes a threshold, replace the bodies of older tool results with a short stub written by code, keep the most recent few in full, and never touch the prefix again until the next threshold. **Who does it:** SWE-agent's observation masking, CliffCompaction, AWS Strands (truncates oldest tool results first), Anthropic's `clear_tool_uses`, Pi's reserve-based trigger.

**For Otty.** This is the fix for the job overflow above, and it's D-13 done for jobs first.
- **Trigger** at a share of `profile().contextTokens` (Codex users settle around 60%; the right number comes from item 1), not every few turns. Each compaction costs one full cache write, then the new prefix stays cached until the next one.
- **The stub is code's words, never the model's:** title, address, size, and "read it again with `read_page` if you need it". No new recall machinery: the harness study found models rarely used it. Re-reading an address already in the job counts as known, so it costs no card.
- **Keep the brief, the steering notes, every assistant message and every tool call.** Only old tool *results* shrink, so the model still sees what it did and why.
- **Trust comes first. Masking must not change what Otty believes.** `isKnownUrl` reads the job's history to decide which addresses are known. It must keep reading the full saved steps in `JobStore`, not the masked view, or a masked page would silently make its links unknown, and a later code change might "fix" that by loosening the check. Taint (`RunTaint`), `hiddenLines` and the ledger are untouched. The stored steps stay complete, and the masked history is a view built when sending, so a resume rebuilds the same bytes.
- **Order:** masking alone first. Add the hybrid (one summary of the masked span) only if item 1 shows masking losing quality, because a summary is extra cost and, worse, it turns outside words into what looks like the model's own words (see "Not applicable", item 7).

Impact H · Effort M · Long-horizon: essential. Without it a job's length is capped by the window, not by `LIMITS`.

### 3. Fewer turns: ask for several things at once, and stop when nothing new arrives

**What it is.** Each turn resends the prefix, so batching calls into one turn and ending runs that have stopped learning save more than shrinking any one turn. **Who does it:** every cost study above; Codex CLI's cost guidance; parallel tool calls in all major harnesses.

**For Otty.**
- `runLoop` already runs every call in a reply. A short line in the job prompt ("ask for the pages you need together") is a Scaffold rule, so give it an eval case and expect to delete it when models do it by themselves.
- A plain-code progress check in `Supervisor`: if N rounds in a row bring no new address and no new page, end the tools early and ask for the report (the existing `WRAP_UP`). It can only end early, never extend, so it fits idea 10 in AUTONOMY.md.
- Return a short stub when a job asks for a page it already read in full and still holds unmasked, instead of fetching and resending it.

Impact H · Effort S · Long-horizon: high. The tail of a long job is where turns are wasted.

### 4. Cap and shape tool output at the source

**What it is.** Big results are the main cost, so trim them before they ever enter the history: a preview plus a way to get more, and structure instead of prose. **Who does it:** Strands' context offloading (preview plus a handle), Manus (the file system as memory), Headroom, Anthropic's code-execution pattern.

**For Otty.** `read_page` sends up to 24,000 characters whether the job needs a fact or the whole article. Options, measured with item 1:
- A smaller first read with an optional `from` argument for the rest. Careful: the cost studies show paging can *add* turns. Only take it if the eval shows fewer total tokens and the same score.
- Strip boilerplate (navigation, cookie banners, link farms) in `web.ts` before counting characters. That's pure saving with no extra turns.
- TOON for list-shaped results, already a BRAINSTORM idea with its own measurement plan ([concept note](BRAINSTORM.md#toon-fewer-tokens-for-tables-of-things)).

Impact M–H · Effort S–M · Long-horizon: high, it slows how fast item 2 has to step in.

### 5. Thinking effort per step, decided in code

**What it is.** Not every step deserves deep thinking. A router picks low, medium or high effort per step. **Who does it:** Ares (up to about 53% fewer reasoning tokens with little loss, [NeurIPS 2026](https://neurips.cc/virtual/2026/poster/152084)), TAB, Plan-and-Budget. All warn that "low everywhere" hurts quality badly.

**For Otty.** Skip the learned router. A rule in the runner is enough to start: the first round (planning) and the report (after `WRAP_UP`) get `normal`, the reading rounds in between get `least`. `ChatRequest.reasoning` already exists per request. **Check the cache first:** on some services, changing the thinking settings between requests invalidates cached messages, so measure the hit rate on each service (item 1) before keeping it, and keep effort fixed within a phase rather than flipping each round.

Impact M · Effort S · Long-horizon: grows with job length.

### 6. A worker model for jobs, a lead model for plans and reports

**What it is.** A cheap model does the many reading steps; a strong one plans and writes. **Who does it:** Aider's architect/editor split (o3 plus GPT-4.1 beat o3 alone and cost less on its benchmark), Anthropic's research system (a strong lead with lighter subagents). A 2026 study found a router that picks *before* generating beats a cascade that tries the cheap model first ([arXiv 2605.06350](https://arxiv.org/abs/2605.06350)).

**For Otty.** A `Profile` could name a second, cheaper model on the same service (no new key, no new privacy line), used for job rounds, with the lead model for the brief's first round and the report. Decide by step kind in code, never by asking a model. Two models means two caches, so switch only at phase boundaries. Users never pick this; it's a profile fact, and "Friendly copy never says job" still holds. Local models stay a stretch goal; this is not that.

Impact M–H · Effort M · Long-horizon: high, since long jobs are mostly reading steps.

### 7. Reuse last time's plan for repeating looks

**What it is.** Save the plan from a finished run and adapt it for the next similar request, instead of planning from scratch. **Who does it:** Agentic Plan Caching (about 50% cheaper, about 97% of accuracy, [arXiv 2506.14852](https://arxiv.org/abs/2506.14852)), Agent Workflow Memory (fewer steps on WebArena, [arXiv 2409.07429](https://arxiv.org/abs/2409.07429)). A 2026 EMNLP paper warns that the memory module's own cost is rarely counted.

**For Otty.** The natural first user is a series (D-34): the same brief every week. The next run can start with a short code-written note: the addresses the last run found useful, and the last report's headline, so it can say what changed. **The safety rule matters more than the saving:** those addresses came from the web, so they count as known only because the previous run of the *same series* found them, exactly as a job's own finds do today; the note never adds tools, and a series' first run plans from the brief alone. Measure with item 1 whether it pays once the note's own tokens are counted.

Impact M · Effort S–M · Long-horizon: high for Look after me and recipes, which are mostly repeats.

### 8. A scratchpad that survives masking

**What it is.** The agent keeps its plan and findings in a small note it rewrites as it goes, so they survive when old tool output is hidden, and the plan stays near the end of the context where attention is strongest. **Who does it:** Manus's `todo.md`, Anthropic's memory tool (with context editing, +39% on their eval and 84% fewer tokens in a 100-turn search eval, [Anthropic](https://www.anthropic.com/news/context-management)), the CWL paper's typed episodes (89 tasks in one session, [arXiv 2606.11213](https://arxiv.org/abs/2606.11213)).

**For Otty.** Once item 2 masks pages, the job needs somewhere to keep what it learned from them. The simplest form needs no new tool: ask that each reading round end with a line or two of findings in the assistant message, which masking never removes. A `note` tool comes only if that fails in the eval. Manus spent about a third of its actions on bookkeeping early on, so watch the turn count. Findings are the model's words about outside text, so they carry the run's taint.

Impact M · Effort S · Long-horizon: high, it's what makes item 2 safe for quality.

### 9. Run what can wait when it's cheaper

**What it is.** Non-urgent work runs in discounted windows. **Who does it:** Anthropic's Message Batches (half price, most finish within an hour, [docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)); DeepSeek's off-peak hours (half the peak rate since August 2026, by several reports; check the official page).

**For Otty.** Scheduled looks and series with a loose due time ("every morning") could prefer off-peak hours, decided by `JobRunner` and a dated price fact in the profile. The Batch API fits only one-shot work (a summary, a digest), not a multi-step loop, where each step would wait. Never delay work the user is waiting on, and say plainly when a look will run.

Impact M · Effort S–M · Long-horizon: grows as more work runs without the user there.

### 10. Prepare while idle, only where the result is reused

**What it is.** Think about a context before a question arrives, so the answer is cheap. Pays only when several questions share the context. **Who does it:** Letta's sleep-time compute (about 5× fewer answer-time tokens, and 2.5× cheaper per question only when amortised, [arXiv 2504.13171](https://arxiv.org/abs/2504.13171)).

**For Otty.** Already the rule in AUTONOMY idea 7 ("prepare freely, deliver on demand, act never") and shipped in small form as warm explain cards. Extend it only where reuse is likely: one digest of a long attached document that later questions in the chat read, instead of the whole document every turn. Never send anything the user hasn't agreed to send (NFR-5).

Impact M · Effort M · Long-horizon: medium.

### 11. Sub-runs for breadth, priced honestly

**What it is.** Isolated workers read in parallel and return only condensed results, so the lead's context stays small. **Who does it:** Anthropic's research system, Claude Code subagents, OpenHands.

**For Otty.** Already designed in AUTONOMY idea 1 and BRAINSTORM's sub-runs. The efficiency lesson to add: a sub-run costs more in total (about 4–15×), so `delegate` should be for breadth that wouldn't fit one window, not the default. Each child's budget comes out of its parent's, which makes this measurable. A child returns typed results with sources, which is also the cheapest thing for the parent to read.

Impact M · Effort M–L (with sub-runs) · Long-horizon: high for goals.

### 12. Keep the prompt and tools lean, and load tools on demand once there are many

**What it is.** Small fixed prompts, few tools, and tool definitions loaded only when searched for. **Who does it:** Pi, mini-swe-agent, Anthropic's tool search (`defer_loading`), Claude skills (names first, bodies on demand).

**For Otty.** `prompts.ts` is about 16k characters and tools are offered only when set up (`offer(setup)`), so today this is fine. It matters when Connections (MCP) arrive: dozens of outside tools would cost tokens on every request. Then: a fixed small set always offered, the rest found through a search tool, added at the end so the prefix holds. On Claude that can be `defer_loading` in `claudeExtras`; everywhere else, Otty's own search tool. Keep a check on prompt size in a test, so it can't creep.

Impact M (H once Connections land) · Effort S now, M with Connections · Long-horizon: medium.

### 13. Recover from an overlong context instead of failing

**What it is.** When a service says the prompt is too long, compact and retry once. **Who does it:** Codex CLI, Claude Code, OpenCode.

**For Otty.** Today the chat gets "This chat has grown too long" and a job fails. With item 2 in place, the same step can run once on that error and retry. A safety net, not the plan: hitting it often means item 2's threshold is wrong.

Impact M · Effort S (after item 2) · Long-horizon: high for reliability.

## Likely not applicable

| Method | Who uses it | Why not for Otty |
| --- | --- | --- |
| **1. Bash as the only tool** | mini-swe-agent, Pi | Cheap for coding models, but Otty's users aren't developers and the Mac is theirs. A shell bypasses `toolSafety`, cards, the ledger and Undo. The lesson that carries over is "few general tools", not "a shell". |
| **2. Repo maps** | Aider (`--map-tokens`) | Coding-specific. The nearest Otty idea, an outline of a long attached document, is item 10. |
| **3. Token-level prompt compression** | LLMLingua, LongLLMLingua | Needs a local model, loses meaning in tool arguments (reports of 5–10 points of argument accuracy), changes bytes per request so it fights the cache, and is weakest exactly where it would matter (addresses, numbers, Chinese text). |
| **4. Provider-side compaction and context editing** | Codex's encrypted `/responses/compact`, Anthropic server compaction and `clear_tool_uses` | One service each, and the default is DeepSeek. The service keeps or rewrites state Otty can't see, which breaks "What left your Mac" and the cache rule, and `isKnownUrl` needs the full history. Otty does its own masking (item 2) for every service. Revisit only as a Claude-only extra if item 2 measures worse. |
| **5. Constraining tools by masking logits** | Manus | Needs control of decoding, which hosted APIs don't give. The principle (never change the tool list mid-run, refuse in code instead) is already how `runTool` works. |
| **6. Learned routers and value heads** | Ares, SWE-Router, RouteLLM | Need training data and usually a local model, and a drifting router can quietly escalate everything. Plain rules on step kind (items 5 and 6) get most of the gain and are testable. |
| **7. Recursive model-written summaries every few turns** | OpenHands' default condenser, many frameworks | Evidence is mixed at best (24–94% *more* tokens on DiscoveryBench, no better than masking on SWE-bench), every summary breaks the cache, and it's lossy. For Otty there's a trust cost too: a summary of web pages is outside text that now reads like the model's own notes. If ever used, it carries the run's taint and never counts as knowing an address. |
| **8. Starting before the user asks** | Speculative execution, "answer while typing" | Sends data the user hasn't sent yet, against NFR-5. Already parked in BRAINSTORM; local-only preparation is fine (item 10). |
| **9. Agent teams by default** | Agent swarms | 15× the tokens of a chat. Sub-runs stay a deliberate choice for breadth (item 11). |
| **10. Self-hosted serving tricks** | vLLM prefix sharing, KV-cache offload, fine-tuned small models | Otty rents models. Local models are a stretch goal; if they return, prefix caching in Ollama or LM Studio follows the same cache rule for free. |
| **11. Third-party token proxies** | Headroom, the CliffCompaction proxy | Every request must leave through `send` in `net.ts` and be recorded; a proxy would see the user's words. Take the ideas, not the tools. |
| **12. Semantic answer caching** | Gateways like GPTCache | Otty's answers depend on what's on screen, the user's language and memories, and a fresh web. A stale cached answer is worse than paying. The explain-card cache is the safe exception, and it exists. |
| **13. Just use a bigger window** | 1M-token models | Moves the cliff without removing it, and every token in a long prefix is billed again each round. Raise `contextTokens` only together with item 2. |

## Long jobs and autonomous work: how the pieces fit

The direction in AUTONOMY.md (events, recipes, goals, Look after me, sub-runs) means more work runs longer, more often, with nobody watching. Efficiency then stops being a nice-to-have and becomes a limit on what Otty can do within a monthly limit. Four rules keep the methods above in line with the rest of Otty's design:

1. **A budget belongs to the run, and only narrows.** Tokens are another limit beside rounds and lookups. A child's budget comes from its parent's, so the whole tree stays under the monthly limit (D-33). Compaction thresholds come from `contextTokens`; budgets come from the user.
2. **Compaction is a view, never an edit.** `JobStore` keeps every step in full. What gets sent is built from it by code, deterministically, so a resumed job sends the same bytes, Try again still finds a prefix, and anything that judges trust (`isKnownUrl`, taint, the ledger, `hiddenLines`) reads the full record.
3. **The cache rule extends to compaction.** Between compactions, append only. A compaction is a rare, deliberate cache write, logged with its size, never a per-turn habit. The append-only prompt builder in BRAINSTORM's Runtime table is where this rule should live in code.
4. **Code decides, models suggest.** Thresholds, effort per step, which model runs a step, when to stop and when to run off-peak are all plain code, tested. A model can say "I've got enough"; only code can end the tools, and nothing here can widen a limit.

**Order to build in**, each its own DEVLOG entry when its turn comes:

1. Item 1, measurement, with the eval reporting cost beside score. A baseline on today's prompts.
2. Item 2 with item 8's findings line and item 13's retry, for jobs. Add an eval case that reads enough pages to overflow today.
3. Item 3 (fewer turns) and item 4's boilerplate stripping. Cheap, compare against the new baseline.
4. Items 5 and 6, one at a time, each checked for its effect on the cache.
5. Item 7 when series and Look after me need it; items 9–12 when their features arrive.
6. The same history view for long chats (D-13), once jobs have proved it.

**What "on par" means here.** Every change is compared with the committed eval baseline: the same or better score, lower billed cost (cached and uncached together), and no step that used to ask for a card now skipping it. A cheaper run that asks the user less is a safety regression, not a win.

## Sources

Papers:
- [Token Reduction Is Not Cost Reduction (arXiv 2607.12161)](https://arxiv.org/abs/2607.12161)
- [Beyond Token Savings: A Systematic Study of Context Compression in LLM Agents (arXiv 2609.32961)](https://arxiv.org/abs/2609.32961)
- [The Complexity Trap: observation masking vs. LLM summarization (arXiv 2508.21433)](https://arxiv.org/abs/2508.21433), with [JetBrains Research's summary](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)
- [An Empirical Study of Harness Design for Coding Agents (arXiv 2609.20804)](https://arxiv.org/abs/2609.20804)
- [CliffCompaction (arXiv 2609.26779)](https://arxiv.org/abs/2609.26779)
- [TokenPilot: Cache-Efficient Context Management (arXiv 2606.17016)](https://arxiv.org/abs/2606.17016)
- [Beyond Compaction: Structured Context Eviction (arXiv 2606.11213)](https://arxiv.org/abs/2606.11213)
- [OpenHands condensers on DiscoveryBench (arXiv 2605.18854)](https://arxiv.org/pdf/2605.18854)
- [Agentic Plan Caching (arXiv 2506.14852)](https://arxiv.org/abs/2506.14852)
- [Agent Workflow Memory (arXiv 2409.07429)](https://arxiv.org/abs/2409.07429), and the [2026 EMNLP budget-constrained web agents paper](https://aclanthology.org/2026.emnlp-main.1657.pdf)
- [Sleep-time Compute (arXiv 2504.13171)](https://arxiv.org/html/2504.13171v1)
- [Ares: Adaptive Reasoning Effort Selection](https://neurips.cc/virtual/2026/poster/152084), [Adaptive Thinking Budgets (arXiv 2604.05164)](https://arxiv.org/html/2604.05164)
- [Routing vs. cascades (arXiv 2605.06350)](https://arxiv.org/abs/2605.06350), [Stanford review of routing and cascades](https://web.stanford.edu/~shuhuiq/blog/review-routing-cascades.html)

Harnesses and vendor material:
- [OpenHands context condenser](https://docs.openhands.dev/sdk/guides/context-condenser), [OpenHands blog](https://openhands.dev/blog/openhands-context-condensensation-for-more-efficient-ai-agents)
- [Pi: efficient system prompting](https://www.tensorlake.ai/blog/pi-coding-agent-efficient-system-prompting), [coding agent comparison](https://www.tensorlake.ai/blog/best-ai-coding-agents-2026)
- [mini-swe-agent](https://pypi.org/project/mini-swe-agent/)
- [Aider token usage comparison](https://www.morphllm.com/comparisons/morph-vs-aider-diff), [Aider token limits](https://fast.io/resources/aider-token-limit.md)
- [AWS Strands context engineering](https://strandsagents.com/docs/learning/context-engineering-and-conversation-management/), [Strands context offloading](https://dev.to/aws/your-agent-doesnt-need-that-10000-token-api-response-context-offloading-with-strands-2imd), [The Register on Strands](https://www.theregister.com/ai-and-ml/2026/09/21/aws-bolts-together-open-source-agent-harness-says-it-sips-fewer-tokens-than-rivals/5297915)
- [Codex CLI compaction](https://codex.danielvaughan.com/2026/03/31/codex-cli-context-compaction-architecture/), [Codex CLI cost strategy](https://codex.danielvaughan.com/2026/08/07/token-reduction-is-not-cost-reduction-prompt-cache-economics-codex-cli-cost-strategy/)
- [Manus context engineering (summary)](https://agentic-ai.readthedocs.io/en/latest/ContextEngineering/manus/), [ZenML summary](https://www.zenml.io/llmops-database/context-engineering-strategies-for-production-ai-agents)
- [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system), [context management](https://www.anthropic.com/news/context-management), [code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp), [advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use), [batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
- [LLMLingua and tool calling](https://callsphere.ai/blog/vw9g-prompt-compression-llmlingua-microsoft-2026)
- [DeepSeek peak and off-peak pricing (report)](https://ecorpit.com/deepseek-v4-peak-off-peak-pricing-utc-windows-agent-cost-2026/), check the official pricing page before relying on it
