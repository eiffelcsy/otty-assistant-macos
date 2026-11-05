import { describe, expect, it, vi } from 'vitest'
import { createExplainCache, termsToWarm } from '../explainCache'

describe('createExplainCache', () => {
  it('fetches a term once, whatever its case, per language', async () => {
    const fetcher = vi.fn(async (term: string) => `About ${term}`)
    const explain = createExplainCache(fetcher)
    expect(await explain('CDN', '', 'en')).toBe('About CDN')
    expect(await explain('cdn', '', 'en')).toBe('About CDN')
    await explain('CDN', '', 'zh-HK')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('shares a call that’s still running', async () => {
    let finish = (_: string) => {}
    const fetcher = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)))
    const explain = createExplainCache(fetcher)
    const warm = explain('CDN', '', 'en')
    const tap = explain('CDN', '', 'en')
    finish('Shared')
    expect(await Promise.all([warm, tap])).toEqual(['Shared', 'Shared'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('forgets a failure, so the next tap tries again', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce('Back')
    const explain = createExplainCache(fetcher)
    await expect(explain('CDN', '', 'en')).rejects.toThrow('Offline')
    expect(await explain('CDN', '', 'en')).toBe('Back')
  })

  it('stops growing, forgetting the oldest first', async () => {
    const fetcher = vi.fn(async (term: string) => term)
    const explain = createExplainCache(fetcher)
    for (let i = 0; i <= 200; i++) await explain(`term${i}`, '', 'en')
    await explain('term200', '', 'en')
    expect(fetcher).toHaveBeenCalledTimes(201)
    await explain('term0', '', 'en')
    expect(fetcher).toHaveBeenCalledTimes(202)
  })
})

describe('termsToWarm', () => {
  it('takes the first three, once each', () => {
    const answer = 'A [CDN](#explain), a [cdn](#explain), [DNS](#explain), [TLS](#explain) and [HTTP](#explain).'
    expect(termsToWarm(answer)).toEqual(['CDN', 'DNS', 'TLS'])
  })

  it('ignores ordinary links', () => {
    expect(termsToWarm('See [the docs](https://a.com).')).toEqual([])
  })
})
