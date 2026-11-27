---
name: smoke
description: Run Otty's smoke harness (D-47) — the real app driven by Playwright against a fake world — and report which checklist steps failed. Use after any change the app would show, before a PR, or when asked to "run the smoke test". Also how to add a smoke spec.
---

# Otty smoke harness

The real release build (`out/`) runs under `tools/smoke/app/main.ts`, which makes the run hermetic and fakes the
network and the Mac. Specs in `tools/smoke/specs/*.smoke.ts` drive the windows. Nothing leaves the machine.

## Run it

```bash
npm run smoke
```

It builds first (so it never tests a stale build) and holds a machine-wide lock while it runs, because smoke runs
share the real clipboard, window focus and `out/`. Several agents can call it at once; they take turns.

- Only what a change needs: `npm run smoke -- --changed` (the verify kit's `full` tier does this). `tools/smoke/affected.mjs`
  maps changed files to specs plus a core set, and runs everything for shared code or a file it doesn't know. CI runs
  every spec. A new spec needs a place in its `AREAS` (`affected.test.ts` fails otherwise).
- One area: `npm run smoke -- launch` (a file name), or by step: `npm run smoke -- --grep @step-44`.
- The release gate only: `npm run smoke -- --grep @gate`.
- The harness's own checks: `npm run smoke -- --grep @harness`.

`npm run smoke -- --no-build …` skips the build when nothing changed since the last run.
Build with `npm run smoke`, never `npm run build:smoke` by hand: the runner adds the fake Google client, and without it
Google Calendar's button is missing and its spec fails.

## Report

Say which tests failed and their `@step-N` tags (the step numbers in DEVLOG's smoke-test checklist), with the first
error line of each. For a failure, read `tools/smoke/results/<test>/error-context.md` (the page's accessibility tree
at the failure) and look at the `test-failed-*.png` screenshots before guessing. `smoke-snapshot.json` and
`world-requests.json` are attached to failed tests: what main recorded, and every request the app sent.

The end-of-test checks fail a test when:
- `blocked` isn't empty: the app tried to reach the internet or run a process. Find out what; never widen the guard to make it pass.
- `errors` isn't empty: main crashed or left a promise unhandled.
- a window logged a console error.
- `unscripted` isn't empty: the app asked the world for something no spec scripted.

## Add a spec

- Use the fixture: `import { expect, test } from '../fixtures'`. Tag every test with the checklist steps it covers (`{ tag: ['@step-29'] }`), and `@gate` for release-gate steps.
- Script the model with `world.reply(match, turn…)` (`say`, `think`, `calls`, `status`). Pages: `world.page(url, html)`. Background calls (titles, explain warm-ups) get `world.backgroundReply`.
- Fake Mac: `otty.control((c, arg) => c.mac(arg), { selection: 'text', front: { name: 'Safari', bundleId: 'com.apple.Safari', url: 'https://…' } })`, then `c.press('Alt+Space')`. What Otty did to the Mac is in `snapshot().calls`.
- Time: `c.shiftClock(ms)` then `c.power('resume')` is a sleeping Mac waking up.
- Find elements by role and name (`getByRole('button', { name: 'Send' })`); don't add a `data-testid` where a real name works.
- Never wait with sleeps; use `expect(...).toBeVisible()` and `expect.poll`.
- The fixture's function passed to `otty.control` is serialised: it can use only its arguments.
