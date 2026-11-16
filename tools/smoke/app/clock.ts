/**
 * Time in a smoke run (D-47): main's `Date` runs at real speed plus an offset a spec can move.
 * Timers stay real. Moving time forward and then sending `resume` is what a sleeping Mac does, so specs use that pair.
 */
import { app, webContents, type WebContents } from 'electron'

const RealDate = Date
export const clock = { offset: 0 }

class SmokeDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + clock.offset)
    else super(...(args as [string]))
  }
  static now(): number {
    return RealDate.now() + clock.offset
  }
}

/** The same offset in a renderer, so times it shows agree with main. Re-applied on every page load. */
function rendererPatch(offset: number): string {
  return `(() => {
    const D = window.__realDate ?? Date
    window.__realDate = D
    window.__smokeOffset = ${offset}
    if (window.__smokeDate) return
    class SmokeDate extends D {
      constructor(...a) { if (a.length === 0) super(D.now() + window.__smokeOffset); else super(...a) }
      static now() { return D.now() + window.__smokeOffset }
    }
    window.__smokeDate = SmokeDate
    window.Date = SmokeDate
  })()`
}

function apply(contents: WebContents): void {
  if (!contents.isDestroyed()) void contents.executeJavaScript(rendererPatch(clock.offset)).catch(() => {})
}

export function installClock(startOffset: number): void {
  clock.offset = startOffset
  globalThis.Date = SmokeDate as DateConstructor
  app.on('web-contents-created', (_e, contents) => contents.on('dom-ready', () => apply(contents)))
}

/** Move time by `ms` (forward or back) everywhere. */
export function shiftClock(ms: number): number {
  clock.offset += ms
  for (const contents of webContents.getAllWebContents()) apply(contents)
  return clock.offset
}
