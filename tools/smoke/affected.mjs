// The smoke specs a change needs (`npm run smoke -- --changed`). CI's smoke job still runs every spec on every PR; this
// is the local run, sized to the change. A file the table doesn't know runs everything, so a gap costs time, not a check.
import { execSync } from 'child_process'
import { matchesGlob, resolve } from 'path'

/** Run on every change: the app starts, a question gets an answer, the harness can't leak. */
export const CORE = ['launch', 'basics', 'chat', 'harness']

/** Shared by every screen or every turn, or the harness itself: a change here runs the whole suite. */
export const EVERYTHING = [
  'src/main/index.ts',
  'src/main/core.ts',
  'src/main/llm.ts',
  'src/main/loop.ts',
  'src/main/sessionDeps.ts',
  'src/main/windows.ts',
  'src/main/roomy.ts',
  'src/main/controls.ts',
  'src/main/settings.ts',
  'src/main/settingsOnMac.ts',
  'src/main/net.ts',
  'src/main/env.ts',
  'src/main/notify.ts',
  'src/main/captureRoute.ts',
  'src/main/toolSafety.ts',
  'src/main/tools/index.ts',
  'src/main/tools/types.ts',
  'src/main/ipc/index.ts',
  'src/main/ipc/check.ts',
  'src/preload/**',
  'src/shared/types.ts',
  'src/renderer/src/main.tsx',
  'src/renderer/src/panel/Panel.tsx',
  'src/renderer/src/panel/Messages.tsx',
  'src/renderer/src/frame/**',
  'src/renderer/src/lib/useChat.ts',
  'tools/smoke/app/**',
  'tools/smoke/world/**',
  'tools/smoke/*.ts',
  'tools/smoke/*.mjs',
  'package.json',
  'package-lock.json',
  'electron.vite.config.ts',
  'csp.config.ts',
  'electron-builder.yml'
]

/** Never in the app the smoke run drives. */
export const NONE = ['docs/**', '**/__tests__/**', '**/*.md', 'tools/eval/**', 'tools/ui-preview/**', 'tools/otty-art/**', 'tools/verify/**', '.github/**', '.claude/**', 'verify.config.mjs']

/** Where each part of Otty is checked, by the files it lives in. */
export const AREAS = [
  [['src/main/calendar/**', 'src/renderer/src/calendar/**', 'src/main/tools/calendar.ts', 'src/main/ipc/calendar.ts', 'tools/otty-calendar/**'], ['calendar', 'home', 'connections']],
  [['src/main/logbook/**', 'src/renderer/src/panel/logbook/**', 'src/main/ipc/activity.ts'], ['logbook', 'ledger', 'sent', 'jobs', 'home']],
  [['src/main/home/**', 'src/renderer/src/home/**'], ['home', 'flow']],
  [['src/main/jobs/**', 'src/shared/repeat.ts', 'src/shared/cap.ts'], ['jobs', 'schedule', 'logbook', 'activity', 'long', 'home']],
  [['src/main/connections/**', 'src/main/ipc/connections.ts', 'src/renderer/src/components/ConnectForm.tsx', 'src/shared/connectionDraft.ts'], ['connections', 'calendar']],
  [['src/main/files/**', 'src/renderer/src/components/FileChips.tsx', 'src/renderer/src/lib/useAttachments.ts'], ['files', 'keys']],
  [['src/main/memory/**'], ['memory', 'rewind']],
  [['src/main/providers/**', 'src/shared/services.ts', 'src/renderer/src/components/ConnectionFields.tsx'], ['providers', 'web', 'language', 'long']],
  [['src/main/store/**', 'src/shared/match.ts'], ['history', 'privacy', 'find', 'sent']],
  [['src/main/act/**', 'src/main/macHands.ts', 'src/main/tools/mac.ts', 'src/renderer/src/components/StepCard.tsx'], ['steps', 'basics']],
  [['src/main/capture.ts', 'src/main/ocr.ts', 'src/renderer/src/pickup/**', 'src/renderer/src/viewer/**', 'tools/otty-ocr/**', 'src/shared/captures.ts'], ['captures', 'pickup', 'quick']],
  [['src/renderer/src/quick/**'], ['quick', 'captures', 'drafts']],
  [['src/renderer/src/bubble/**', 'src/renderer/src/components/InWater.tsx', 'src/renderer/src/components/Otter.tsx'], ['captures', 'idle', 'window']],
  [['src/main/draw.ts', 'src/renderer/src/draw/**', 'src/shared/slides.ts'], ['drawings']],
  [['src/main/chart.ts', 'src/shared/table.ts'], ['charts']],
  [['src/main/math.ts', 'src/shared/math.ts', 'src/renderer/src/lib/*Math*.ts', 'src/renderer/src/lib/mathText.ts'], ['math']],
  [['src/main/copyFormats.ts'], ['clipboard']],
  [['src/main/explainCache.ts', 'src/renderer/src/panel/Markdown.tsx'], ['explain', 'proofread', 'drawings', 'charts', 'math', 'clipboard', 'pages', 'tiles']],
  [['src/main/pageReader.ts', 'src/main/web.ts', 'src/main/knownUrls.ts', 'src/main/tools/web.ts'], ['pages', 'web', 'ruleOfTwo', 'sent']],
  [['src/main/tools/chat.ts', 'src/main/hints.ts', 'src/main/prompts.ts', 'src/main/language.ts'], ['language', 'basics', 'memory', 'tiles']],
  [['src/main/cards.ts', 'src/renderer/src/components/ConfirmCard.tsx'], ['decisions', 'basics']],
  [['src/main/ledger.ts'], ['ledger', 'rewind']],
  [['src/main/sent.ts'], ['sent']],
  [['src/main/usage.ts', 'src/main/metrics.ts', 'src/main/permissions.ts', 'src/main/install.ts'], ['activity', 'health']],
  [['src/main/diagnostics.ts', 'src/main/log.ts'], ['help']],
  [['src/main/compact.ts'], ['long']],
  [['src/main/pebbles.ts', 'src/main/ipc/pouch.ts', 'src/renderer/src/pouch/**', 'src/shared/pebbles.ts'], ['pouch', 'tiles']],
  [['src/renderer/src/panel/settings/**', 'src/main/ipc/settings.ts'], ['settings', 'privacy', 'health', 'tiles']],
  [['src/main/hiddenLines.ts', 'src/shared/secrets.ts'], ['keys']],
  [['src/shared/tiles.ts'], ['tiles']],
  [['src/renderer/src/components/MessageBox.tsx', 'src/renderer/src/components/Capsule.tsx', 'src/renderer/src/lib/useDraft.ts'], ['drafts', 'chat', 'quick']],
  [['src/renderer/src/panel/History.tsx'], ['history']],
  [['src/renderer/src/panel/FindBar.tsx', 'src/renderer/src/lib/findInChat.ts'], ['find']],
  [['src/renderer/src/panel/HealthBanner.tsx', 'src/shared/health.ts'], ['health']],
  [['src/renderer/src/panel/Onboarding.tsx'], ['launch', 'settings']],
  [['src/renderer/src/panel/Notebook.tsx'], ['memory']],
  [['src/renderer/src/components/Cove.tsx', 'src/renderer/src/lib/cove.ts', 'src/renderer/src/lib/visitors.ts', 'src/renderer/src/assets/**'], ['flow', 'home', 'idle']],
  [['src/renderer/src/styles.css', 'src/renderer/src/lib/motion.tsx', 'src/renderer/src/components/Icon.tsx', 'src/renderer/src/lib/tooltips.ts'], ['flow', 'frame', 'idle']],
  [['src/main/ipc/chat.ts', 'src/main/ipc/windows.ts', 'src/main/trayIcon.ts', 'src/renderer/src/lib/again.ts'], ['chat', 'rewind', 'window', 'captures']],
  [['src/main/pause.ts', 'src/renderer/src/components/PauseButton.tsx'], ['schedule', 'chat']],
  [['src/shared/suggestions.ts', 'src/renderer/src/components/QuickActions.tsx'], ['basics', 'quick']]
]

const hits = (file, globs) => globs.some((g) => matchesGlob(file, g))

/** The specs for a set of changed files: 'all', or spec names (without `.smoke.ts`), core first. */
export function affected(files) {
  const specs = new Set()
  for (const file of files) {
    const spec = file.match(/^tools\/smoke\/specs\/(.+)\.smoke\.ts$/)
    if (spec) specs.add(spec[1])
    else if (file.startsWith('tools/smoke/specs/files/')) specs.add('files')
    else if (file.startsWith('tools/smoke/specs/')) return 'all'
    else if (hits(file, EVERYTHING)) return 'all'
    else if (hits(file, NONE)) continue
    else {
      const areas = AREAS.filter(([globs]) => hits(file, globs))
      // Only app code reaches the build; a file nobody mapped is checked by everything rather than nothing.
      if (!areas.length) {
        if (/^(src|tools\/otty-)/.test(file)) return 'all'
        continue
      }
      for (const [, names] of areas) for (const n of names) specs.add(n)
    }
  }
  return specs.size ? [...new Set([...CORE, ...specs])] : []
}

/** Files changed against origin/main, committed or not (the verify kit's rule). */
export function changedFiles(root) {
  const git = (cmd) => {
    try {
      return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  const base = git('merge-base HEAD origin/main')[0]
  return [...new Set([...(base ? git(`diff --name-only ${base}`) : []), ...git('ls-files --others --exclude-standard')])]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(import.meta.dirname, '../..')
  const picked = affected(changedFiles(root))
  console.log(picked === 'all' ? 'all' : picked.join(' ') || '(none)')
}
