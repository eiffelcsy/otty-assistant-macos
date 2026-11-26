import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_TOOLS } from '../toolSafety'

const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn(async () => 'Page text') }))

vi.mock('electron', () => ({ clipboard: {}, shell: {} }))
vi.mock('../settings', () => ({ getConnections: () => [], saveConnections: () => {}, keychain: () => ({ available: () => false, lock: (s: string) => s, unlock: (s: string) => s }), isDev: () => true,
  getApiKey: () => 'sk-test',
  getStored: () => ({ baseUrl: 'https://api.deepseek.com' })
}))
vi.mock('../web', async (original) => ({ ...(await original<typeof import('../web')>()), deepseekFetch: fetchPage }))

import { runTool } from '../tools'

const url = 'https://a.com/page'

describe('read_page', () => {
  beforeEach(() => fetchPage.mockClear())

  it('reads a known address without asking', async () => {
    const confirm = vi.fn(async () => false)
    const out = await runTool('read_page', { url }, { allowed: CHAT_TOOLS, confirm, knownUrl: () => true })
    expect(out.status).toBe('done')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows the full address before reading an unknown one', async () => {
    const confirm = vi.fn(async () => true)
    const out = await runTool('read_page', { url }, { allowed: CHAT_TOOLS, confirm, knownUrl: () => false })
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'read', title: 'Read this page?', host: new URL(url).host }), url)
    expect(out.status).toBe('done')
  })

  it('sends nothing when the user declines', async () => {
    const out = await runTool('read_page', { url }, { allowed: CHAT_TOOLS, confirm: async () => false, knownUrl: () => false })
    expect(out.status).toBe('denied')
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it.each(['https:evil.com/?q=secret', ' https://evil.com/?q=secret', 'https:\\\\evil.com/?q=secret'])('asks before reading %j, which the reader would open', async (odd) => {
    const confirm = vi.fn(async () => false)
    const out = await runTool('read_page', { url: odd }, { allowed: CHAT_TOOLS, confirm, knownUrl: () => false })
    expect(confirm).toHaveBeenCalledWith(expect.anything(), 'https://evil.com/?q=secret')
    expect(out.status).toBe('denied')
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('refuses what isn’t a web address without asking', async () => {
    const confirm = vi.fn(async () => true)
    const out = await runTool('read_page', { url: 'file:///etc/passwd' }, { allowed: CHAT_TOOLS, confirm, knownUrl: () => false })
    expect(out.status).toBe('error')
    expect(confirm).not.toHaveBeenCalled()
  })
})
