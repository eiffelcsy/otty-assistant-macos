import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn(async () => 'Page text') }))

vi.mock('electron', () => ({ clipboard: {}, shell: {} }))
vi.mock('../settings', () => ({
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
    const out = await runTool('read_page', { url }, { confirm, knownUrl: () => true })
    expect(out.status).toBe('done')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('shows the full address before reading an unknown one', async () => {
    const confirm = vi.fn(async () => true)
    const out = await runTool('read_page', { url }, { confirm, knownUrl: () => false })
    expect(confirm).toHaveBeenCalledWith('Read this page?', url)
    expect(out.status).toBe('done')
  })

  it('sends nothing when the user declines', async () => {
    const out = await runTool('read_page', { url }, { confirm: async () => false, knownUrl: () => false })
    expect(out.status).toBe('denied')
    expect(fetchPage).not.toHaveBeenCalled()
  })
})
