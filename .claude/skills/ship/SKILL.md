---
name: ship
description: Take a DEVLOG entry from built to a PR ready for the owner (D-48) — verify, follow the route notes, code and security review, an intent check of every "Done when" line against the diff, the docs pass, then the PR with the template filled in. Use when asked to "ship", "open the PR" or "get this ready for review".
---

# Ship: from built to a PR the owner can read

The owner reads the PR summary and its evidence, not the diff. Every step below exists so that summary is true.
Do them in order, and fix what a step finds before moving on. Never skip a step to get a PR open; if one can't run
(no eval key, no Mac), say so in the PR under "Left for a person".

## 1. Know what you're shipping

- Find the DEVLOG entry (`docs/DEVLOG.md`, `## D-NN · …`) and the step or phase this branch builds. Copy its
  **Done when** lines word for word; they're the contract.
- **Bug fix?** It starts with a test that fails on `main`. Write the test first and run it before the fix (or with
  the fix stashed: `git stash push -- <fixed files>`, run, `git stash pop`), and keep the failing line for the PR.
- Not on a branch? `git switch -c <type>/<short-name>` from `main` before anything is committed.

## 2. Verify

```bash
node tools/verify/verify.mjs --routes   # what this change needs, from the files it touches
npm run verify                          # standard: lint, typecheck, all tests, build, release check
npm run verify:full                     # instead, when the routes say "App code changed" (adds the smoke harness)
```

All green, or it isn't ready. Then do **every** route note the output prints, for example:
- **eval**: `npm run eval` (needs `OTTY_EVAL_KEY`) and `npm run eval:compare` against `tools/eval/baselines/`.
  No key → "Left for a person", with the exact commands.
- **UI preview**: launch config `ui-preview`, the touched views in light and dark, narrow and wide. Keep screenshots
  for the evidence table.
- **idle budget**: `OTTY_METRICS=1` under `caffeinate`, under 0.5% of a core.
- **schema**: a released migration is never edited, only a new one added.
- **smoke**: the `smoke` skill; anything new the app shows gets a spec tagged `@step-N` (or a ✋ with a reason).

## 3. Risk class

```bash
node tools/verify/risk.mjs          # low / normal / guarded, and the files that set it
node tools/verify/risk.mjs --json   # { class, files, changed }
```

The classes are paths in `verify.config.mjs` (`risk`), never a judgement call. A change takes the class of its
riskiest file. **Guarded** (tool safety, `act/`, the network and page reader, secrets, memory guard, the schema, the
preload and CSP, prompts and hints, the verify kit, smoke's fake world, CI, `.claude/settings.json`) never
auto-merges and always gets the security review below.

## 4. Review

- Run `/code-review` on the branch. Fix real findings; for one you don't fix, say why in the PR.
- **Guarded**, or anything touching a tool, IPC, the network or `act/`: also run `/security-review`.
- Check the CLAUDE.md rules the diff comes near. A rule that matters and has no test gets one, or a line under
  "Left for a person".

## 5. Intent check

A fresh subagent, which hasn't seen your reasoning, checks the diff against the entry. Your own reading doesn't count:
you know what you meant to build.

Spawn it with the Agent tool (`subagent_type: "general-purpose"`), and give it exactly this, filled in:

```
You check one PR against its plan. Read only; edit nothing, run no build or tests.

Plan entry: docs/DEVLOG.md, section "## D-NN · <title>" (read the whole section; this PR covers <step/phase>).
Its "Done when" lines:
1. <line, word for word>
2. …

The change: run `git diff origin/main...HEAD` and `git diff` (uncommitted), and `git ls-files --others
--exclude-standard` for new files. The evidence claimed so far:
<the draft evidence table: line → test name / smoke tag / screenshot / command>

For each "Done when" line, answer one of:
- EVIDENCED: name the test (file and test title), smoke spec and @tag, or screenshot, and confirm you found it in
  the diff or repo and that it actually checks the line (not just mentions it).
- PARTIAL: what's covered and what isn't.
- MISSING: nothing in the diff shows it.
- NOT IN SCOPE: the line belongs to a later step of the entry, and the PR draft says so.
Don't trust the claimed evidence; find it. A test that only restates the code, or a tag on a spec that doesn't
check the line, is PARTIAL. Then list anything the diff does that the entry doesn't ask for.
Reply with one row per line, then the extras. Nothing else.
```

Every MISSING or PARTIAL line gets evidence (a test, a smoke spec, a screenshot) or is stated plainly in the PR as
not in this PR, with why. Rerun the check after adding evidence. The PR's "Intent check" line reports the result.

## 6. Docs pass (CLAUDE.md)

- **DEVLOG**: shipped → summarise in `docs/CHANGELOG.md`, delete the entry, add its smoke-test steps to the
  checklist. Partly shipped → update the entry's status and "Where things stand".
- **BRAINSTORM**: mark the idea `shipped`; add any feature or UX ideas you noticed along the way.
- **README, REQUIREMENTS, CLAUDE.md**: check them against the code; fix what the change made stale. A new rule in
  CLAUDE.md is a short bullet, matching the others.
- App code changed but no docs did? Say why in the PR (the routes flag this).

## 7. Baselines

Never update a baseline file (`tools/verify/baseline/`, `tools/eval/baselines/`, screenshots, coverage floors) in the
same PR as the change it excuses. If a check only passes with a new baseline, stop: fix the code, or open the
baseline change as its own PR, with the reason, and say so here.

## 8. Open the PR

- Rerun `npm run verify` (or `verify:full`) after the last change; the PR claims what's true now.
- Commit with a message that names the entry (`… (D-NN)`), push, and open it against `main`:

  ```bash
  gh pr create --base main --title "<what changes, plainly> (D-NN)" --body-file <filled template>
  ```

- The body is `.github/pull_request_template.md` filled in: the plain summary for people using Otty, the entry,
  every Done-when line with its evidence, the intent check result, the bug-fix test, the risk class and its files,
  the checks run, baselines, the docs changed, and what's left for a person. End it with the attribution lines the
  session gives for PRs.
- Report the PR link, the risk class, and anything left for a person. Don't merge it.
