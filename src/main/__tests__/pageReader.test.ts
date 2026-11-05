import { describe, expect, it, vi } from 'vitest'
import { htmlToText, isPrivateAddress, readPageFromMac } from '../pageReader'

const html = (body: string, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
const publicDns = async () => ['93.184.216.34']

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.0.1', '172.31.255.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:192.168.0.1', '64:ff9b::7f00:1', 'not-an-ip'
  ])('blocks %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each(['93.184.216.34', '8.8.8.8', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

describe('readPageFromMac', () => {
  it('reads a public page, with its title and address', async () => {
    const fetcher = vi.fn(async () => html('<title>Otters</title><p>They float.</p>')) as unknown as typeof fetch
    const out = await readPageFromMac('https://example.com/otters', fetcher, publicDns)
    expect(out).toBe('# Otters\nSource: https://example.com/otters\n\nThey float.')
  })

  it.each([
    'http://127.0.0.1/admin',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://localhost/',
    'http://router/',
    'https://example.com:8080/',
    'file:///etc/passwd',
    'https://user:pass@example.com/'
  ])('never opens %s', async (url) => {
    const fetcher = vi.fn() as unknown as typeof fetch
    await expect(readPageFromMac(url, fetcher, publicDns)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a name that points at a private address, or at both kinds', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch
    await expect(readPageFromMac('https://evil.example/', fetcher, async () => ['10.0.0.5'])).rejects.toThrow('public web pages')
    await expect(readPageFromMac('https://evil.example/', fetcher, async () => ['8.8.8.8', '127.0.0.1'])).rejects.toThrow('public web pages')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('checks every redirect, so a public page can’t bounce Otty inside', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://192.168.1.1/admin' } })) as unknown as typeof fetch
    await expect(readPageFromMac('https://example.com/', fetcher, publicDns)).rejects.toThrow('public web pages')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('follows a public redirect, relative ones included, and reports the final address', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/new' } }))
      .mockResolvedValueOnce(html('<p>Moved here.</p>'))
    const out = await readPageFromMac('https://example.com/old', fetcher as unknown as typeof fetch, publicDns)
    expect(out).toContain('Source: https://example.com/new')
  })

  it('gives up on endless redirects', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } })) as unknown as typeof fetch
    await expect(readPageFromMac('https://example.com/', fetcher, publicDns)).rejects.toThrow('too many times')
    expect(fetcher).toHaveBeenCalledTimes(5)
  })

  it('never follows redirects by itself and sends no credentials', async () => {
    const fetcher = vi.fn(async () => html('<p>Hi</p>'))
    await readPageFromMac('https://example.com/', fetcher as unknown as typeof fetch, publicDns)
    const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0][1]
    expect(init.redirect).toBe('manual')
    expect(Object.keys(init.headers as object).map((h) => h.toLowerCase())).not.toContain('cookie')
  })

  it('refuses things that aren’t pages', async () => {
    const pdf = async () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } })
    await expect(readPageFromMac('https://example.com/a.pdf', pdf as unknown as typeof fetch, publicDns)).rejects.toThrow('isn’t a page')
  })

  it('explains a page that can’t be opened, in words that repeat no address', async () => {
    const denied = async () => html('', 403)
    const err = await readPageFromMac('https://example.com/secret-token', denied as unknown as typeof fetch, publicDns).catch((e: Error) => e)
    expect((err as Error).message).toContain('may need a sign-in')
    expect((err as Error).message).not.toContain('example.com')
  })

  it('stops reading a huge page', async () => {
    const big = async () => html(`<p>${'word '.repeat(2_000_000)}</p>`)
    const out = await readPageFromMac('https://example.com/', big as unknown as typeof fetch, publicDns)
    expect(out.length).toBeLessThan(26_000)
    expect(out).toContain('Only the first')
  })
})

describe('htmlToText', () => {
  it('keeps the words and drops the machinery', () => {
    const { title, text } = htmlToText(`<html><head><title>A &amp; B</title><style>p{}</style></head>
      <body><nav>Menu</nav><script>alert(1)</script><h1>Otters</h1><p>Sea &#x26; river<br>otters &mdash; 🦦</p><!-- hidden --><footer>© 2026</footer></body></html>`)
    expect(title).toBe('A & B')
    expect(text).toBe('Otters\nSea & river\notters — 🦦')
  })
})
