// D-48: Otty's settings for the verify kit (tools/verify/). The kit is generic; this file is the project.

const quick = [
  ['lint', 'node tools/verify/lint.mjs'],
  ['typecheck', 'npm run typecheck --silent'],
  ['unit tests (changed)', 'npx vitest run --changed --passWithNoTests']
]

const standard = [
  ['lint', 'node tools/verify/lint.mjs'],
  ['typecheck', 'npm run typecheck --silent'],
  ['unit tests', 'npm test --silent'],
  ['build', 'npm run build --silent'],
  ['no smoke code in the release build', 'node tools/smoke/check-release.mjs']
]

export default {
  base: 'origin/main',
  defaultTier: 'standard',
  tiers: {
    // The Stop hook runs this: fast enough to run every time an agent says it's done.
    quick,
    // What CI's `ci` job runs. "Done" for anything that isn't visible in the app.
    standard,
    // Before a PR that touches anything the app shows.
    full: [...standard, ['smoke (builds, then runs)', 'npm run smoke --silent']]
  },
  // What else a change needs, by the files it touches. `unlessChanged` drops a note when its proof is in the change too.
  routes: [
    {
      when: ['src/main/prompts.ts', 'src/main/hints.ts', 'src/main/tools.ts', 'src/main/loop.ts', 'src/main/language.ts', 'src/main/providers/**', 'src/shared/slides.ts'],
      say: 'A prompt, hint, tool or provider changed: run `npm run eval` (needs OTTY_EVAL_KEY) and compare with `npm run eval:compare` against tools/eval/baselines/.'
    },
    {
      when: ['src/**'],
      unless: ['**/__tests__/**'],
      say: 'App code changed: run the `full` tier (the smoke harness) before the PR, and add a smoke spec or a ✋ step for anything new the app shows.'
    },
    {
      when: ['src/renderer/**/*.tsx', 'src/renderer/**/*.css'],
      say: 'The UI changed: look at it in the UI preview (launch config `ui-preview`), in light and dark mode, and narrow and wide.'
    },
    {
      when: ['src/renderer/src/styles.css', 'src/renderer/src/components/Otter.tsx', 'src/renderer/src/bubble/**'],
      say: 'Something that runs while idle may have changed: re-measure NFR-3 with OTTY_METRICS=1 (under 0.5% of a core).'
    },
    {
      when: ['src/main/store/db.ts'],
      say: 'The schema file changed: a released migration must never be edited, only a new one added.'
    },
    {
      when: ['src/**'],
      unless: ['**/__tests__/**'],
      unlessChanged: ['docs/**'],
      say: 'App code changed but no docs did: do the docs pass (DEVLOG, CHANGELOG, BRAINSTORM, README, REQUIREMENTS), or say in the PR why none applies.'
    }
  ]
}
