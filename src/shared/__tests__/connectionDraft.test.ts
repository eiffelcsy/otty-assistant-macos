// D-54: a ```connection block is only a card when it's one of the shapes Otty can show. Secrets in it are dropped.
import { describe, expect, it } from 'vitest'
import { connectionDraft } from '../connectionDraft'

describe('connectionDraft', () => {
  it('reads a built-in service by its name', () => {
    expect(connectionDraft('{"service":"canvas"}')).toEqual({ kind: 'canvas' })
    expect(connectionDraft('{"service":"apple"}')).toEqual({ kind: 'apple' })
  })

  it('reads one of the user’s own by name, address and sign-in, and drops any secret', () => {
    const code = '{"service":"mcp","name":"  Linear  ","url":"https://mcp.linear.app/mcp","auth":"token","token":"sk-123","key":"k","secret":"s"}'
    expect(connectionDraft(code)).toEqual({ kind: 'mcp', name: 'Linear', url: 'https://mcp.linear.app/mcp', auth: 'token' })
  })

  it('cuts the name to 40 characters and defaults the sign-in to oauth', () => {
    const draft = connectionDraft(`{"service":"mcp","name":"${'n'.repeat(60)}","url":"http://localhost:3000/mcp","auth":"basic"}`)
    expect(draft).toEqual({ kind: 'mcp', name: 'n'.repeat(40), url: 'http://localhost:3000/mcp', auth: 'oauth' })
  })

  it('returns null for anything it cannot show', () => {
    expect(connectionDraft('not json')).toBeNull()
    expect(connectionDraft('[]')).toBeNull()
    expect(connectionDraft('{"service":"dropbox"}')).toBeNull()
    expect(connectionDraft('{"service":"mcp","name":"  ","url":"https://x.test"}')).toBeNull()
    expect(connectionDraft('{"service":"mcp","name":"L","url":"javascript:alert(1)"}')).toBeNull()
    expect(connectionDraft('{"service":"mcp","name":"L","url":"not a url"}')).toBeNull()
    expect(connectionDraft('{"service":"mcp","name":"L"}')).toBeNull()
  })
})
