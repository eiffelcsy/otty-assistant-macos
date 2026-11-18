import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalOnlyError, send, setLocalOnly } from '../net'
import { readPageFromMac } from '../pageReader'

const ok = vi.fn(async () => new Response('ok'))

afterEach(() => {
  setLocalOnly(() => false)
  ok.mockClear()
  vi.unstubAllGlobals()
})

describe('the one door out (D-52)', () => {
  it('refuses anything off this Mac while the model is on it, before a request is made', async () => {
    vi.stubGlobal('fetch', ok)
    setLocalOnly(() => true)
    for (const address of ['https://api.deepseek.com/chat', 'https://en.wikipedia.org/w/api.php', 'http://192.168.1.1/', new URL('https://example.com')]) {
      await expect(send(address)).rejects.toBeInstanceOf(LocalOnlyError)
    }
    await expect(send(new Request('https://example.com/a'))).rejects.toBeInstanceOf(LocalOnlyError)
    expect(ok).not.toHaveBeenCalled()
  })

  it('refuses a page before its name is looked up, so not even DNS leaves the Mac', async () => {
    setLocalOnly(() => true)
    const resolve = vi.fn(async () => ['93.184.216.34'])
    await expect(readPageFromMac('https://example.com/', ok, resolve)).rejects.toBeInstanceOf(LocalOnlyError)
    expect(resolve).not.toHaveBeenCalled()
    expect(ok).not.toHaveBeenCalled()
  })

  it('lets a model on this Mac be reached', async () => {
    vi.stubGlobal('fetch', ok)
    setLocalOnly(() => true)
    for (const address of ['http://localhost:11434/v1/chat/completions', 'http://127.0.0.1:1234/v1', 'http://[::1]:8080/', 'http://ollama.localhost/']) {
      await expect(send(address)).resolves.toBeInstanceOf(Response)
    }
    expect(ok).toHaveBeenCalledTimes(4)
  })

  it('never follows a local server’s redirect off the Mac', async () => {
    vi.stubGlobal('fetch', ok)
    setLocalOnly(() => true)
    await send('http://localhost:11434/v1/chat/completions', { method: 'POST' })
    expect(ok).toHaveBeenCalledWith('http://localhost:11434/v1/chat/completions', { method: 'POST', redirect: 'manual' })
  })

  it('passes everything through with an online service, using the fetch of the moment', async () => {
    vi.stubGlobal('fetch', ok)
    const init = { method: 'POST', body: '{}' }
    await send('https://api.deepseek.com/chat/completions', init)
    expect(ok).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', init)
  })

  it('asks the check each time, so switching services takes effect at once', async () => {
    vi.stubGlobal('fetch', ok)
    let local = false
    setLocalOnly(() => local)
    await send('https://api.openai.com/v1')
    local = true
    await expect(send('https://api.openai.com/v1')).rejects.toBeInstanceOf(LocalOnlyError)
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
