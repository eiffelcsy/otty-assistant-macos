// D-54: signing in in the browser. One loopback catcher on 127.0.0.1 at a random port, with a checked state, for Google and for MCP servers. The browser is opened through what core.ts plugs in.
import { createHash, randomBytes } from 'crypto'
import { createServer, type Server } from 'http'
import { ConnectionError, LIMITS } from './types'

let opener: (url: string) => Promise<void> = async () => {
  throw new ConnectionError('Otty can’t open your browser here.', 'bad')
}

export function setOpener(open: (url: string) => Promise<void>): void {
  opener = open
}

export async function openInBrowser(url: string): Promise<void> {
  const protocol = new URL(url).protocol
  if (protocol !== 'http:' && protocol !== 'https:') throw new ConnectionError('That sign-in address isn’t one Otty can open.', 'bad')
  await opener(url)
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function newState(): string {
  return randomBytes(16).toString('base64url')
}

export interface Catcher {
  redirectUri: string
  code: Promise<string>
  close(): void
}

const PAGE = '<!doctype html><meta charset="utf-8"><title>Otty</title><body style="font:16px -apple-system,sans-serif;padding:48px;text-align:center"><p>You can close this tab and go back to Otty.</p></body>'

export function catchRedirect(o: { state: string; signal?: AbortSignal; timeoutMs?: number }): Promise<Catcher> {
  return new Promise((resolveCatcher, rejectCatcher) => {
    let settle: (ok: boolean, value: string | Error) => void = () => {}
    let server: Server | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let done = false

    const code = new Promise<string>((resolve, reject) => {
      settle = (ok, value) => {
        if (done) return
        done = true
        if (ok) resolve(value as string)
        else reject(value)
        finish()
      }
    })
    code.catch(() => {})

    const finish = () => {
      clearTimeout(timer)
      o.signal?.removeEventListener('abort', onAbort)
      server?.close()
    }
    const onAbort = () => settle(false, new ConnectionError('Sign-in was cancelled.', 'cancelled'))

    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const state = url.searchParams.get('state')
      const error = url.searchParams.get('error')
      const got = url.searchParams.get('code')
      if (error) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
        settle(false, new ConnectionError('Sign-in was cancelled in the browser.', 'cancelled'))
        return
      }
      if (state !== o.state) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('This sign-in didn’t come from Otty.')
        return
      }
      if (got) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGE)
        settle(true, got)
        return
      }
      res.writeHead(400).end()
    })

    server.on('error', (err) => {
      rejectCatcher(err)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      timer = setTimeout(
        () => settle(false, new ConnectionError('Signing in took too long. Try again.', 'auth')),
        o.timeoutMs ?? LIMITS.signInMs
      )
      o.signal?.addEventListener('abort', onAbort)
      if (o.signal?.aborted) onAbort()
      resolveCatcher({
        redirectUri: `http://127.0.0.1:${port}/callback`,
        code,
        close: () => {
          settle(false, new ConnectionError('Sign-in was cancelled.', 'cancelled'))
          finish()
        }
      })
    })
  })
}
