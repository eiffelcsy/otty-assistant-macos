import { beforeEach, describe, expect, it, vi } from 'vitest'

let baseUrl = 'http://localhost:11434/v1'
let model = 'm'

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {} }))
vi.mock('../settings', () => ({ getApiKey: () => 'key', getStored: () => ({ baseUrl, model }) }))
const { runTool, toolDefs } = await import('../tools')

const ctx = { confirm: async () => true, knownUrl: () => true }
const names = () => toolDefs().map((t) => t.function.name)

beforeEach(() => {
  baseUrl = 'http://localhost:11434/v1'
  model = 'm'
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

  it('offers the simple lookup and page reading elsewhere', () => {
    baseUrl = 'https://api.openai.com/v1'
    expect(names().slice(0, 2)).toEqual(['search_web', 'read_page'])
  })

  it('leaves search to Claude, and keeps page reading in Otty’s hands', () => {
    baseUrl = 'https://api.anthropic.com'
    model = 'claude-sonnet-5-5'
    expect(names()).not.toContain('search_web')
    expect(names()).toContain('read_page')
  })

  it('falls back to the lookup on a Claude model with no search tool', () => {
    baseUrl = 'https://api.anthropic.com'
    model = 'claude-haiku-5-5'
    expect(names()).toContain('search_web')
  })

  it('still asks before reading an unfamiliar page from the Mac', async () => {
    baseUrl = 'https://api.openai.com/v1'
    const confirm = vi.fn(async () => false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const out = await runTool('read_page', { url: 'https://example.com/?secret=1' }, { confirm, knownUrl: () => false })
    expect(confirm).toHaveBeenCalledWith('Read this page?', 'https://example.com/?secret=1')
    expect(out.status).toBe('denied')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a private address even when the user approves', async () => {
    baseUrl = 'https://api.openai.com/v1'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const out = await runTool('read_page', { url: 'http://192.168.1.1/' }, { confirm: async () => true, knownUrl: () => true })
    expect(out.status).toBe('error')
    expect(out.result).toContain('public web pages')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
