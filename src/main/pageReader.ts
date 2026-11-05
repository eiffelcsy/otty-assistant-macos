import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { checkedUrl, formatPage, WebError } from './web'

// Reads a web page from the Mac, for services with no page reader of their own. A hostile page could try to send
// Otty to something only this Mac can reach, such as a router, so every address is checked before it's opened.
// No Electron imports, so it can be tested on its own.

const MAX_REDIRECTS = 4
const MAX_BYTES = 3_000_000
const TIMEOUT_MS = 15_000
const READABLE = /^(text\/(html|plain)|application\/xhtml\+xml)/i

function privateIPv4(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19))
  )
}

/** The eight 16-bit groups of an IPv6 address, or null if it can't be read. */
function ipv6Groups(ip: string): number[] | null {
  const dotted = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  let text = ip
  if (dotted) {
    const [a, b, c, d] = dotted[2].split('.').map(Number)
    text = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head, tail] = text.split('::')
  const parse = (s?: string) => (s ? s.split(':').map((g) => parseInt(g, 16)) : [])
  const start = parse(head)
  const end = parse(tail)
  const missing = 8 - start.length - end.length
  if (tail === undefined ? missing !== 0 : missing < 0) return null
  return [...start, ...Array(missing).fill(0), ...end]
}

/** True for anything that isn't a public internet address. If in doubt, it counts as private. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return privateIPv4(ip)
  if (kind !== 6) return true
  const g = ipv6Groups(ip)
  if (!g) return true
  if (g.slice(0, 7).every((x) => x === 0)) return true // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return privateIPv4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`) // an IPv4 address in IPv6 clothes
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return true // NAT64 can reach IPv4 addresses
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00
}

type Resolve = (host: string) => Promise<string[]>

const resolveHost: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address)

/** Refuses anything but a public address on a normal web port. */
async function assertPublic(url: URL, resolve: Resolve): Promise<void> {
  const blocked = new WebError('Otty can only read public web pages.', false)
  if (url.port && url.port !== '80' && url.port !== '443') throw blocked
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  if (isIP(host)) addresses = [host]
  else {
    if (!host.includes('.')) throw blocked
    addresses = await resolve(host).catch(() => {
      throw new WebError('Otty couldn’t find that website.', false)
    })
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw blocked
}

/** The body as text, stopping at the size limit. */
async function bodyText(res: Response): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  await reader.cancel().catch(() => {})
  return Buffer.concat(chunks).toString('utf8')
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? whole
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole
  })
}

/** A page's title and readable text. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/\s+/g, ' ').trim()
  const text = decode(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(head|title|script|style|noscript|template|svg|nav|footer|form|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(p|div|li|tr|section|article|blockquote|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/[ \t\f\r]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title, text }
}

export async function readPageFromMac(address: string, fetchImpl: typeof fetch = fetch, resolve: Resolve = resolveHost): Promise<string> {
  let url = checkedUrl(address)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url, resolve)
    let res: Response
    try {
      // Redirects are followed by hand, so each new address gets checked too. Node's fetch keeps no cookies.
      res = await fetchImpl(url.href, {
        redirect: 'manual',
        headers: { Accept: 'text/html,text/plain;q=0.9', 'User-Agent': 'Mozilla/5.0 (Macintosh) Otty' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch {
      throw new WebError('That page timed out or couldn’t be reached.', false)
    }
    const next = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && next) {
      try {
        url = checkedUrl(new URL(next, url).href)
      } catch {
        throw new WebError('That page sent Otty somewhere it can’t read.', false)
      }
      continue
    }
    if (!res.ok) throw new WebError('That page couldn’t be opened. It may need a sign-in.', false)
    const type = res.headers.get('content-type') ?? ''
    if (!READABLE.test(type)) throw new WebError('That address isn’t a page Otty can read.', false)
    const raw = await bodyText(res)
    const { title, text } = /plain/i.test(type) ? { title: '', text: raw.trim() } : htmlToText(raw)
    if (!text) throw new WebError('That page had no text Otty could read.', false)
    return formatPage(title, url.href, text)
  }
  throw new WebError('That page redirected too many times.', false)
}
