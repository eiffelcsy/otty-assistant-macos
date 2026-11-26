import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOOKUP_PLACES, serviceById } from '../../shared/services'
import type * as WebModule from '../web'

// D-79: what the web tools record as a look-up's place comes from LOOKUP_PLACES, so Settings › Privacy names every one.
const state = vi.hoisted(() => ({ baseUrl: 'https://api.openai.com/v1', key: null as string | null }))
const sent = vi.hoisted(() => ({ record: vi.fn() }))

vi.mock('../sent', () => ({ record: sent.record }))
vi.mock('../settings', () => ({
  getStored: () => ({ baseUrl: state.baseUrl, apiFormat: 'auto', model: 'gpt-test' }),
  getApiKey: () => state.key
}))
vi.mock('../net', () => ({ send: vi.fn(async () => ({ ok: true, json: async () => ({}) })) }))
vi.mock('../pageReader', () => ({ readPageFromMac: vi.fn(async () => 'the page') }))
vi.mock('../web', async (orig) => ({
  ...(await orig<typeof WebModule>()),
  deepseekSearch: vi.fn(async () => 'deepseek results'),
  deepseekFetch: vi.fn(async () => 'deepseek page')
}))

import { readPageTool, searchWebTool } from '../tools/web'  // eslint-disable-line no-restricted-imports -- the web tools, not the repo's tools/ folder

const ctx = { knownUrl: () => true, confirm: async () => true, allowed: new Set<string>(), sent: { chatId: 'c1' } } as never
const allowed = new Set([LOOKUP_PLACES.lookup, LOOKUP_PLACES.page, serviceById('deepseek').label])

beforeEach(() => {
  sent.record.mockReset()
  state.baseUrl = 'https://api.openai.com/v1'
  state.key = null
})

describe('the places a look-up is recorded under (D-79)', () => {
  it('a simple search is recorded as Wikipedia and DuckDuckGo', async () => {
    await searchWebTool.run({ query: 'otters' }, ctx)
    expect(sent.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'search', service: LOOKUP_PLACES.lookup }))
  })

  it('a page read on the Mac is recorded as the page’s own site', async () => {
    await readPageTool.run({ url: 'https://example.com/otters' }, ctx)
    expect(sent.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'page', service: LOOKUP_PLACES.page, host: 'example.com' }))
  })

  it('DeepSeek’s search and page are recorded under its label', async () => {
    state.baseUrl = 'https://api.deepseek.com'
    state.key = 'sk-test'
    await searchWebTool.run({ query: 'otters' }, ctx)
    await readPageTool.run({ url: 'https://example.com/otters' }, ctx)
    const services = sent.record.mock.calls.map(([row]) => row.service)
    expect(services).toEqual([serviceById('deepseek').label, serviceById('deepseek').label])
  })

  it('every recorded service name is one LOOKUP_PLACES names (or DeepSeek’s label)', async () => {
    await searchWebTool.run({ query: 'otters' }, ctx)
    await readPageTool.run({ url: 'https://example.com/otters' }, ctx)
    for (const [row] of sent.record.mock.calls) expect(allowed.has(row.service)).toBe(true)
  })
})
