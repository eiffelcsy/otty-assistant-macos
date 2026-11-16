/**
 * The network in a smoke run (D-47): every `fetch` from main goes to the world server in the test process,
 * as `<world>/<host><path>`. Names resolve to one documentation address, so pageReader's public-only check runs for real.
 */
import dns from 'dns'
import { refuse } from './hermetic'

/** TEST-NET-3: public to `isPrivateAddress`, and never routed anywhere. */
export const WORLD_ADDRESS = '203.0.113.10'

export const netState = { offline: false }

const MAX_REDIRECTS = 20

function connectionLost(url: string): TypeError {
  return Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(`getaddrinfo ENOTFOUND ${new URL(url).hostname}`), { code: 'ENOTFOUND' }) })
}

export function installNet(world: string): void {
  const realFetch = globalThis.fetch
  const worldUrl = new URL(world)

  /** One hop, with redirects left to the caller, like `redirect: 'manual'`. */
  const hop = async (url: string, init: RequestInit): Promise<Response> => {
    const target = new URL(url)
    if (target.origin === worldUrl.origin) return realFetch(url, init)
    if (!/^https?:$/.test(target.protocol)) throw refuse(`fetch ${url}`)
    if (netState.offline) throw connectionLost(url)
    const headers = new Headers(init.headers)
    headers.set('x-smoke-url', url)
    const res = await realFetch(`${world}/${target.host}${target.pathname}${target.search}`, { ...init, headers, redirect: 'manual' })
    // A Response's url is read-only; callers that log it see the world's, which is fine.
    return res
  }

  globalThis.fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const request = input instanceof Request ? input : null
    let url = request ? request.url : String(input)
    const merged: RequestInit = request
      ? { method: request.method, headers: request.headers, body: request.body, signal: request.signal, ...(request.body ? { duplex: 'half' } : {}), ...init }
      : init
    if (merged.redirect === 'manual' || merged.redirect === 'error') return hop(url, merged)
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const res = await hop(url, merged)
      const next = res.headers.get('location')
      if (res.status < 300 || res.status >= 400 || !next) return res
      url = new URL(next, url).toString()
    }
    throw new TypeError('fetch failed: too many redirects')
  }

  const resolve = (host: string) => {
    if (netState.offline || host.endsWith('.invalid')) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' })
    return [{ address: WORLD_ADDRESS, family: 4 }]
  }
  const lookupPromise = async (host: string, options?: { all?: boolean }) => {
    const found = resolve(host)
    return options?.all ? found : found[0]
  }
  Object.assign(dns.promises, { lookup: lookupPromise })
  Object.assign(dns, {
    lookup: (host: string, ...rest: unknown[]) => {
      const callback = rest.pop() as (e: Error | null, address?: unknown, family?: number) => void
      const options = (rest[0] ?? {}) as { all?: boolean }
      try {
        const found = resolve(host)
        if (options.all) callback(null, found)
        else callback(null, found[0].address, found[0].family)
      } catch (e) {
        callback(e as Error)
      }
    }
  })
}
