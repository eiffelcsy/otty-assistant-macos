// D-50: what Copy diagnostics puts on the clipboard. The panel shows all of it before copying. Facts about the Mac
// and Otty only: never a key, a custom service's address, or anything from a chat.

export interface DiagnosticFacts {
  version: string
  macOS: string
  arch: string
  installed: boolean
  inApplications: boolean
  /** The service's name ("DeepSeek", "your AI service"), never its address. */
  service: string
  model: string
  web: string
  accessibility: boolean
  screen: boolean
  paused: boolean
  /** The log's last lines, already masked and cut by `log.ts`. */
  log: string[]
  /** Names that must not appear, such as a custom service's host; each becomes "your service". */
  hide: string[]
}

const yes = (b: boolean) => (b ? 'yes' : 'no')

export function diagnosticsReport(f: DiagnosticFacts): string {
  return [
    `Otty ${f.version} · macOS ${f.macOS} · ${f.arch}`,
    `Installed app: ${yes(f.installed)} · in Applications: ${yes(f.inApplications)}`,
    `Service: ${f.service} · model ${f.model} · web ${f.web}`,
    `Accessibility: ${yes(f.accessibility)} · Screen Recording: ${yes(f.screen)} · paused: ${yes(f.paused)}`,
    '',
    f.log.length ? `Last ${f.log.length} log ${f.log.length === 1 ? 'line' : 'lines'}:` : 'Nothing in the log yet.',
    ...f.log.map((l) => f.hide.filter(Boolean).reduce((line, name) => line.split(name).join('your service'), l))
  ].join('\n')
}

/** D-79: the note, and with the log ticked, the diagnostics and the last day's log under their headings. Nothing else. */
export function feedbackText(note: string, withLog: boolean, report: string, log: string[]): string {
  if (!withLog) return note
  return [note, '', '— Diagnostics —', report, '', '— Log, last 24 hours —', ...log].join('\n')
}
