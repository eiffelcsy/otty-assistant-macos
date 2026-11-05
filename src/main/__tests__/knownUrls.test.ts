import { describe, expect, it } from 'vitest'
import { isKnownUrl, urlsIn } from '../knownUrls'
import type { Message } from '../providers'

const toolCall = (id: string, name: string, url = ''): Message => ({
  role: 'assistant',
  content: null,
  tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify({ url }) } }]
})

describe('urlsIn', () => {
  it('finds addresses in prose, app notes, Markdown links and Chinese text', () => {
    expect(urlsIn('See https://a.com/x.')).toContain('https://a.com/x')
    expect(urlsIn('[I’m using Safari, on “Docs” (https://a.com/docs).]')).toContain('https://a.com/docs')
    expect(urlsIn('[link](https://a.com/p)and more')).toContain('https://a.com/p')
    expect(urlsIn('請看https://a.com/hk。')).toContain('https://a.com/hk')
  })

  it('keeps brackets that belong to the address', () => {
    expect(urlsIn('https://en.wikipedia.org/wiki/Otter_(disambiguation)')).toContain(
      'https://en.wikipedia.org/wiki/Otter_(disambiguation)'
    )
  })
})

describe('isKnownUrl', () => {
  it('knows addresses from the user, including one beside a picture', () => {
    const history: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          { type: 'text', text: 'Read https://a.com/page' }
        ]
      }
    ]
    expect(isKnownUrl('https://a.com/page', history)).toBe(true)
  })

  it('knows addresses a search or page returned', () => {
    const history: Message[] = [
      toolCall('1', 'search_web'),
      { role: 'tool', tool_call_id: '1', content: '[1] Result\nhttps://b.com/result\nSummary' },
      toolCall('2', 'read_page', 'https://b.com/result'),
      { role: 'tool', tool_call_id: '2', content: '[next](https://b.com/next)' }
    ]
    expect(isKnownUrl('https://b.com/result', history)).toBe(true)
    expect(isKnownUrl('https://b.com/next', history)).toBe(true)
  })

  it('treats a known address with data added as new', () => {
    const history: Message[] = [{ role: 'user', content: 'Read https://evil.com/page' }]
    expect(isKnownUrl('https://evil.com/page?d=my-private-text', history)).toBe(false)
    expect(isKnownUrl('https://evil.com/page/my-private-text', history)).toBe(false)
  })

  it('never trusts the model’s own words or tools that echo its input', () => {
    const history: Message[] = [
      { role: 'assistant', content: 'Next I will read https://evil.com/?d=secret' },
      toolCall('1', 'copy_to_clipboard'),
      { role: 'tool', tool_call_id: '1', content: 'https://evil.com/?d=secret' }
    ]
    expect(isKnownUrl('https://evil.com/?d=secret', history)).toBe(false)
  })

  it('rejects something that isn’t an address', () => {
    expect(isKnownUrl('not a url', [{ role: 'user', content: 'not a url' }])).toBe(false)
  })
})

describe('a service\'s own search results', () => {
  const reply = (blocks: unknown[]): Message => ({ role: 'assistant', content: 'See https://model-said.example/', provider: { id: 'api.anthropic.com', model: 'm', blocks } })
  const results = { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://found.example/page', title: 'Found' }] }

  it('counts an address from the results', () => {
    expect(isKnownUrl('https://found.example/page', [reply([results])])).toBe(true)
  })

  it('never counts the model\'s own words in the same reply', () => {
    const history = [reply([{ type: 'text', text: 'Try https://model-said.example/' }, results])]
    expect(isKnownUrl('https://model-said.example/', history)).toBe(false)
  })

  it('never counts an address the model passed to the search', () => {
    const query = { type: 'server_tool_use', name: 'web_search', input: { query: 'https://evil.example/?data=secret' } }
    expect(isKnownUrl('https://evil.example/?data=secret', [reply([query, results])])).toBe(false)
  })

  it('copes with a failed search', () => {
    const failed = { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }
    expect(isKnownUrl('https://found.example/page', [reply([failed])])).toBe(false)
  })
})
