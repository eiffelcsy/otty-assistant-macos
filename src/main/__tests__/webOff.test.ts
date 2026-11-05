import { beforeEach, describe, expect, it, vi } from 'vitest'

let baseUrl = 'http://localhost:11434/v1'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {} }))
vi.mock('../settings', () => ({ getApiKey: () => 'key', getStored: () => ({ baseUrl }) }))
const { runTool, toolDefs } = await import('../tools')

const ctx = { confirm: async () => true, knownUrl: () => true }
const names = () => toolDefs().map((t) => t.function.name)

beforeEach(() => {
  baseUrl = 'http://localhost:11434/v1'
})

describe('with web lookups off', () => {
  it('offers no web tools', () => {
    expect(names()).not.toContain('search_web')
    expect(names()).not.toContain('read_page')
    expect(names()).toContain('create_reminder')
  })

  it('refuses a search the model asks for anyway, without touching the network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await runTool('search_web', { query: 'private words' }, ctx)).toMatchObject({ status: 'error' })
    expect(await runTool('read_page', { url: 'https://example.com' }, ctx)).toMatchObject({ status: 'error' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('other services', () => {
  it('offers real search and page reading on DeepSeek', () => {
    baseUrl = 'https://api.deepseek.com'
    expect(names().slice(0, 2)).toEqual(['search_web', 'read_page'])
  })

  it('offers the simple lookup elsewhere', () => {
    baseUrl = 'https://api.openai.com/v1'
    expect(names()).toContain('search_web')
    expect(names()).not.toContain('read_page')
  })
})
