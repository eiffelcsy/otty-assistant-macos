import { isLocal } from '../shared/services'

// D-52: the one door out. Every request Otty makes goes through `send`, so "with a model on this Mac nothing leaves
// it" is checked here, in code, before a socket opens, whatever a tool or a feature forgets. A rule test fails on a
// `fetch(` anywhere else in main. Why something was sent is the caller's to say (`SentTag`), so the sent log stays
// where the reason is known.

let localOnly: () => boolean = () => false

/** Plugged in by `core.ts`, so this file needs no settings and no electron. */
export function setLocalOnly(check: () => boolean): void {
  localOnly = check
}

export class LocalOnlyError extends Error {
  constructor() {
    super('Otty is using a model on this Mac, so nothing goes online.')
  }
}

const hostOf = (input: string | URL | Request): string => new URL(input instanceof Request ? input.url : input).hostname

/** True when `host` is off this Mac and the chosen model keeps everything on it. For a check made before a request,
 *  such as the page reader's DNS lookup. */
export const refused = (host: string): boolean => localOnly() && !isLocal(host)

/** `fetch`, refusing anything off this Mac while the chosen model keeps everything on it. */
export const send: typeof fetch = (input, init) => {
  if (!localOnly()) return fetch(input, init)
  if (refused(hostOf(input))) return Promise.reject(new LocalOnlyError())
  // A local server's redirect would otherwise be followed off the Mac unchecked, so it isn't followed at all.
  return fetch(input, { ...init, redirect: 'manual' })
}
