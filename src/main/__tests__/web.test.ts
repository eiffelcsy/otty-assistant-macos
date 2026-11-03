import { describe, expect, it, vi } from 'vitest'
import { deepseekFetch, deepseekSearch, isDeepSeek, WebError } from '../web'

const cfg = { baseUrl: 'https://api.deepseek.com/v1', key: 'sk-test' }

/** A fake fetch that answers each call with the next response and records what was sent. */
function fakeFetch(...responses: { status?: number; json?: unknown }[]) {
  const calls: { url: string; body: any; auth: string }[] = []
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization })
    const r = responses.shift() ?? { status: 500 }
    const status = r.status ?? 200
    return { ok: status < 300, status, json: async () => r.json } as Response
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

describe('isDeepSeek', () => {
  it('only matches DeepSeek’s own API host', () => {
    expect(isDeepSeek('https://api.deepseek.com')).toBe(true)
    expect(isDeepSeek('https://api.deepseek.com/v1/')).toBe(true)
    expect(isDeepSeek('https://api.openai.com/v1')).toBe(false)
    expect(isDeepSeek('http://localhost:11434/v1')).toBe(false)
    expect(isDeepSeek('not a url')).toBe(false)
  })
})

describe('deepseekSearch', () => {
  it('posts to the origin with the key and formats results for the model', async () => {
    const f = fakeFetch({
      json: {
        results: [
          {
            title: 'macOS 27 released',
            url: 'https://example.com/macos',
            summary: 'Apple released macOS 27 today.',
            snippet: 'short',
            site_name: 'Example News',
            date: '2026-10-28T00:00:00+00:00'
          },
          { title: 'No summary', url: 'https://b.example', snippet: 'Only a snippet.', site_name: null, date: null }
        ]
      }
    })
    const text = await deepseekSearch(cfg, '  what is new in macOS  ', f.impl)
    expect(f.calls[0]).toMatchObject({
      url: 'https://api.deepseek.com/v1/tools/search',
      auth: 'Bearer sk-test',
      body: { query: 'what is new in macOS', count: 5, need_content: false }
    })
    expect(f.calls[0].body).not.toHaveProperty('localization')
    expect(text).toBe(
      '[1] macOS 27 released (Example News, 2026-10-28)\nhttps://example.com/macos\nApple released macOS 27 today.\n\n' +
        '[2] No summary\nhttps://b.example\nOnly a snippet.'
    )
  })

  it('says so when nothing is found, and keeps queries within 128 characters', async () => {
    const f = fakeFetch({ json: { results: [] } })
    expect(await deepseekSearch(cfg, 'x'.repeat(200), f.impl)).toContain('No web results')
    expect(f.calls[0].body.query).toHaveLength(128)
  })

  it('retries once when busy, then gives up kindly', async () => {
    const ok = fakeFetch({ status: 429 }, { json: { results: [] } })
    await deepseekSearch(cfg, 'otters', ok.impl)
    expect(ok.calls).toHaveLength(2)

    const busy = fakeFetch({ status: 429 }, { status: 429 })
    await expect(deepseekSearch(cfg, 'otters', busy.impl)).rejects.toMatchObject({ fallback: true })
  })

  it('explains an empty balance and allows a fallback', async () => {
    const f = fakeFetch({ status: 402 })
    const err = await deepseekSearch(cfg, 'otters', f.impl).catch((e) => e)
    expect(err).toBeInstanceOf(WebError)
    expect(err.message).toContain('balance is empty')
    expect(err.fallback).toBe(true)
  })
})

describe('deepseekFetch', () => {
  it('returns the page as Markdown with its source', async () => {
    const f = fakeFetch({ json: { title: 'Refunds', content: '# Refunds\n\nWithin 30 days.' } })
    const text = await deepseekFetch(cfg, 'https://shop.example/refunds', f.impl)
    expect(f.calls[0]).toMatchObject({ url: 'https://api.deepseek.com/v1/tools/fetch', body: { url: 'https://shop.example/refunds' } })
    expect(text).toBe('# Refunds\nSource: https://shop.example/refunds\n\n# Refunds\n\nWithin 30 days.')
  })

  it('cuts long pages and says so', async () => {
    const f = fakeFetch({ json: { title: '', content: 'a'.repeat(30_000) } })
    const text = await deepseekFetch(cfg, 'https://long.example', f.impl)
    expect(text).toContain('[Only the first 24,000 of 30,000 characters were included.]')
    expect(text.length).toBeLessThan(25_000)
  })

  it('refuses addresses it shouldn’t send, without calling out', async () => {
    const f = fakeFetch()
    await expect(deepseekFetch(cfg, 'file:///etc/passwd', f.impl)).rejects.toBeInstanceOf(WebError)
    await expect(deepseekFetch(cfg, 'https://me:secret@site.example', f.impl)).rejects.toBeInstanceOf(WebError)
    await expect(deepseekFetch(cfg, 'nonsense', f.impl)).rejects.toBeInstanceOf(WebError)
    expect(f.calls).toHaveLength(0)
  })

  it('explains pages it can’t read, such as signed-in ones', async () => {
    const f = fakeFetch({ status: 404 })
    await expect(deepseekFetch(cfg, 'https://mail.example/inbox', f.impl)).rejects.toThrow(/sign-in/)
  })
})
