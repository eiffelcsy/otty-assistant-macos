import { describe, expect, it, vi } from 'vitest'

// D-45 step 3: the tool loop and the job runner run without electron, so jobs, the eval and a future headless Otty
// can use them as they are. Settings come through `SettingsBackend`, and the Mac through `ToolContext.mac`.
vi.mock('electron', () => {
  throw new Error('electron was imported')
})

describe('no electron in the loop', () => {
  it('imports the loop, the tools and the job runner', async () => {
    const { runLoop } = await import('../loop')
    const { JobRunner } = await import('../jobs/runner')
    const { toolDefs } = await import('../tools')
    expect([runLoop, JobRunner, toolDefs].every((f) => typeof f === 'function')).toBe(true)
  })

  it('reads settings only from the backend it is given', async () => {
    const { getStored, getApiKey, setSettingsBackend } = await import('../settings')
    expect(() => getStored()).toThrow(/backend/)
    setSettingsBackend({
      read: () => JSON.stringify({ baseUrl: 'https://api.deepseek.com', apiKeys: { deepseek: { enc: 'bG9ja2Vk' } } }),
      write: () => {},
      keychain: { available: () => true, lock: (s) => s, unlock: () => 'sk-from-keychain' },
      systemLanguages: () => ['en-GB'],
      packaged: () => true,
      loginItem: null
    })
    expect(getStored().baseUrl).toBe('https://api.deepseek.com')
    expect(getApiKey()).toBe('sk-from-keychain')
  })
})
