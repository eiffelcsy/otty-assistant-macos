/**
 * Default-deny for a smoke run (D-47): nothing leaves the machine and nothing on it is run, except what's listed here.
 * Installed before Otty loads, so every module Otty imports sees the guarded functions.
 */
import child_process from 'child_process'
import net from 'net'
import { promisify } from 'util'
import { app, session, type Session } from 'electron'

/** Refused attempts. The fixture fails the test when any are left at the end. */
export const blocked: string[] = []

export function refuse(what: string): Error {
  blocked.push(what)
  return new Error(`Smoke run refused: ${what}`)
}

/**
 * Where a `Socket#connect` call is going: a TCP port and host, or a local IPC path. A port wins over a path, because
 * HTTPS hands TLS its options with the request's path still in them. Anything unclear is TCP, so the guard fails closed.
 */
function target(args: unknown[]): { path: string } | { host: string; port: number } {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0] // Node passes normalised [options, cb] internally
  if (first && typeof first === 'object') {
    const o = first as { host?: string; port?: number | string; path?: string }
    const tcp = o.port !== undefined || o.host !== undefined || typeof o.path !== 'string'
    return tcp ? { host: o.host ?? 'localhost', port: Number(o.port) } : { path: o.path! }
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { path: first }
  return { host: typeof args[1] === 'string' ? args[1] : 'localhost', port: Number(first) }
}

/**
 * Only the world's own port on this machine. Guarded at `net.Socket#connect`, which every TCP and TLS connection from
 * main goes through (`fetch`, `http`, `https`, `tls`), however the caller got hold of its `connect`.
 */
export function guardSockets(worldPort: number): void {
  // oxlint-disable-next-line typescript/unbound-method -- kept to be called with each socket as `this`, below
  const connect = net.Socket.prototype.connect as (this: net.Socket, ...a: unknown[]) => net.Socket
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const t = target(args)
    const local = 'path' in t || ((t.host === '127.0.0.1' || t.host === 'localhost') && t.port === worldPort)
    if (local) return connect.apply(this, args)
    const err = refuse(`connect ${'host' in t ? `${t.host}:${t.port}` : ''}`)
    process.nextTick(() => this.destroy(err)) // fails like a refused connection, so callers take their error path
    return this
  }
}

type ExecFile = typeof child_process.execFile
type Handler = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }> | null

/**
 * `execFile` goes to `handler` first (the fake Mac). What it doesn't take runs for real only if `real(file)` allows it;
 * everything else is refused. `promisify(execFile)` keeps resolving to `{ stdout, stderr }`.
 */
export function guardProcesses(handler: Handler, real: (file: string) => boolean): void {
  const original = child_process.execFile
  const run = (file: string, args: string[], options: object): Promise<{ stdout: string; stderr: string }> => {
    const faked = handler(file, args)
    if (faked) return faked
    if (!real(file)) return Promise.reject(refuse(`run ${file} ${args.join(' ')}`))
    return (promisify(original) as (f: string, a: string[], o: object) => Promise<{ stdout: string; stderr: string }>)(file, args, options)
  }
  const execFile = function (file: string, ...rest: unknown[]) {
    const args = Array.isArray(rest[0]) ? (rest.shift() as string[]) : []
    const callback = typeof rest[rest.length - 1] === 'function' ? (rest.pop() as (e: Error | null, out?: string, err?: string) => void) : undefined
    const options = (rest[0] as object | undefined) ?? {}
    run(file, args, options).then(
      (r) => callback?.(null, r.stdout, r.stderr),
      (e: Error) => callback?.(e)
    )
  } as unknown as ExecFile
  Object.defineProperty(execFile, promisify.custom, {
    value: (file: string, args: string[] = [], options: object = {}) => run(file, args, options)
  })
  const spawn = child_process.spawn
  child_process.execFile = execFile
  child_process.spawn = function (this: unknown, ...args: Parameters<typeof spawn>) {
    const file = String(args[0])
    if (!real(file)) throw refuse(`spawn ${file}`)
    return spawn.apply(this, args)
  } as typeof spawn
  for (const name of ['exec', 'execSync', 'execFileSync', 'spawnSync'] as const) {
    Object.assign(child_process, { [name]: (file: string) => { throw refuse(`${name} ${file}`) } })
  }
}

/** Renderers may load the app's own files and nothing else. */
export function guardRenderers(): void {
  const guard = (s: Session) =>
    s.webRequest.onBeforeRequest((details, done) => {
      const ok = /^(file|data|blob|devtools|chrome-extension):/i.test(details.url)
      if (!ok) refuse(`renderer request ${details.url}`)
      done({ cancel: !ok })
    })
  app.on('session-created', guard)
  void app.whenReady().then(() => guard(session.defaultSession))
}
