// D-48: Otty's settings for the verify kit (tools/verify/). The kit is generic; this file is the project.

const quick = [
  ['lint', 'node tools/verify/lint.mjs'],
  // About 2 s. A refactor that leaves an export with no users otherwise passes here and fails only in CI.
  ['dead code', 'npm run knip --silent'],
  ['typecheck', 'npm run typecheck --silent'],
  ['unit tests (changed)', 'npx vitest run --changed --passWithNoTests']
]

const standard = [
  ['lint', 'node tools/verify/lint.mjs'],
  ['dead code', 'npm run knip --silent'],
  ['typecheck', 'npm run typecheck --silent'],
  ['unit tests, with coverage floors', 'npm run coverage --silent'],
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
    // Before a PR that touches anything the app shows. Smoke runs the specs the change needs (tools/smoke/affected.mjs);
    // CI's smoke job runs every spec, and `npm run smoke` alone still does too.
    full: [...standard, ['screenshots', 'npm run screens --silent'], ['smoke, the specs this change needs (builds, then runs)', 'npm run smoke --silent -- --changed']]
  },
  // Coverage floors (tools/verify/coverage.mjs), lines and branches, that only go up. Groups are folder prefixes; files
  // are the safety modules, held on their own so a drop there can't hide in a folder's average.
  coverage: {
    groups: ['src/main/', 'src/shared/', 'src/renderer/'],
    files: [
      'src/main/toolSafety.ts',
      'src/main/knownUrls.ts',
      'src/main/web.ts',
      'src/main/pageReader.ts',
      'src/main/memory/guard.ts',
      'src/main/act/risk.ts',
      'src/main/act/open.ts',
      'src/shared/secrets.ts',
      'src/shared/cap.ts',
      'src/shared/repeat.ts',
      'src/renderer/src/draw/sanitize.ts'
    ]
  },
  // Risk classes for merging (tools/verify/risk.mjs, `node tools/verify/risk.mjs`). A change takes the class of its
  // riskiest file; guarded beats low, and anything in neither list is normal. Guarded gets /security-review and never
  // auto-merges.
  risk: {
    guarded: [
      'src/main/toolSafety.ts',
      'src/main/act/**',
      'src/main/web.ts',
      'src/main/pageReader.ts',
      'src/main/knownUrls.ts',
      'src/shared/secrets.ts',
      'src/main/memory/guard.ts',
      'src/main/store/db.ts',
      'src/preload/**',
      'csp.config.ts',
      'src/main/prompts.ts',
      'src/main/hints.ts',
      'tools/verify/**',
      'tools/smoke/app/**',
      'verify.config.mjs',
      '.claude/settings.json',
      '.claude/skills/**',
      '.github/workflows/**'
    ],
    low: ['docs/**', '**/__tests__/**', 'tools/**', '**/*.md']
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
      say: 'The UI changed: run `npm run screens` (every preview scene, light and dark) and read any diff image in tools/ui-preview/screens/results/. A wanted change is `npm run screens:update` after CI has run, in a PR of its own.'
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
