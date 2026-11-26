// D-54: connecting, checking and removing, and what windows see. No token ever reaches a view.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionError } from '../types'

const state = vi.hoisted(() => ({ list: [] as any[], baseUrl: 'https://api.deepseek.com' }))
const mocks = vi.hoisted(() => ({
  checkCanvas: vi.fn(async () => 'Ada'),
  revokeGoogle: vi.fn(async () => {}),
  googleClient: vi.fn(() => null as null | { id: string; secret: string }),
  listTools: vi.fn(),
  signInMcp: vi.fn()
}))

vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {} }))
vi.mock('../../settings', () => ({
  isDev: () => true,
  getApiKey: () => 'key',
  getStored: () => ({ baseUrl: state.baseUrl, model: 'm', learn: true }),
  getConnections: () => state.list,
  saveConnections: (l: unknown[]) => {
    state.list = l
  },
  keychain: () => ({
    available: () => true,
    lock: (s: string) => 'L:' + Buffer.from(s).toString('base64'),
    unlock: (s: string) => Buffer.from(s.replace('L:', ''), 'base64').toString('utf8')
  })
}))
vi.mock('../apple', () => ({ appleAccess: vi.fn(async () => true), setCalendarHelper: vi.fn() }))
vi.mock('../google', () => ({ googleClient: mocks.googleClient, signInGoogle: vi.fn(), revokeGoogle: mocks.revokeGoogle }))
vi.mock('../canvas', () => ({ canvasOrigin: (s: string) => `https://${s}`, checkCanvas: mocks.checkCanvas }))
vi.mock('../notion', () => ({ checkNotion: vi.fn(async () => 'Ada’s space') }))
vi.mock('../mcp', async (original) => ({ ...(await original<object>()), listTools: mocks.listTools, signInMcp: mocks.signInMcp }))

const index = await import('../index')
const { savedConnection } = await import('../store')
const { pinOf } = await import('../mcp')

const TOKEN = 'tok-secret-123'

beforeEach(() => {
  state.list = []
  state.baseUrl = 'https://api.deepseek.com'
  vi.clearAllMocks()
  mocks.googleClient.mockReturnValue(null)
})

describe('connecting (D-54)', () => {
  it('keeps a Canvas token locked, and no view carries it', async () => {
    const r = await index.connect({ kind: 'canvas', url: 'school.edu', token: TOKEN })
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r.view)).not.toContain(TOKEN)
    expect(JSON.stringify(state.list)).not.toContain(TOKEN)
    expect(savedConnection('canvas')!.secret).toBeTruthy()
  })

  it('leaves no connection behind when an MCP connect fails', async () => {
    mocks.listTools.mockRejectedValue(new ConnectionError('That address didn’t answer like a connection Otty can use.', 'bad'))
    const r = await index.connect({ kind: 'mcp', name: 'Tasks', url: 'https://mcp.example.com/mcp', auth: 'none' })
    expect(r.ok).toBe(false)
    expect(state.list.filter((c) => c.kind === 'mcp')).toEqual([])
  })

  it('drops an OAuth MCP connection when its sign-in fails', async () => {
    mocks.signInMcp.mockRejectedValue(new ConnectionError('Signing in didn’t work.', 'auth'))
    const r = await index.connect({ kind: 'mcp', name: 'Tasks', url: 'https://mcp.example.com/mcp', auth: 'oauth' })
    expect(r.ok).toBe(false)
    expect(state.list.filter((c) => c.kind === 'mcp')).toEqual([])
  })

  it('connects the built-ins that have no address of their own (the view needs none)', async () => {
    const apple = await index.connect({ kind: 'apple' })
    expect(apple.ok).toBe(true)
    expect(apple.view?.host).toBe('')
    const notion = await index.connect({ kind: 'notion', token: TOKEN })
    expect(notion.view?.host).toBe('api.notion.com')
    expect(index.connectionsState().connected.map((c) => c.kind)).toEqual(['apple', 'notion'])
  })

  it('refuses every online connection while the web is off', async () => {
    state.baseUrl = 'http://localhost:11434/v1'
    const r = await index.connect({ kind: 'notion', token: TOKEN })
    expect(r).toEqual({ ok: false, message: 'Off while Otty uses a model on this Mac.' })
  })
})

describe('checking and tools (D-54)', () => {
  it('turns off a tool whose server description changed, and says so', async () => {
    const pin = pinOf('lookup', 'old words', {})
    state.list = [
      {
        id: 'mcp-aaaaaaaaaaaa',
        kind: 'mcp',
        label: 'Tasks',
        url: 'https://mcp.example.com/mcp',
        auth: 'none',
        added: 1,
        tools: [{ name: 'lookup', title: 'Lookup', description: 'old words', schema: {}, readOnly: true, on: true, pin }]
      }
    ]
    mocks.listTools.mockResolvedValue([{ name: 'lookup', title: 'Lookup', description: 'new words', schema: {}, readOnly: true }])
    const r = await index.recheck('mcp-aaaaaaaaaaaa')
    expect(r.message).toContain('1 tool changed')
    expect(r.view?.status).toBe('changed')
    expect(r.view?.tools[0]).toMatchObject({ on: false, changed: true })
  })

  it('hides Google when this build has no client', () => {
    state.list = [{ id: 'canvas', kind: 'canvas', label: 'Canvas', url: 'https://x', auth: 'token', added: 1 }]
    const { offers, connected } = index.connectionsState()
    expect(offers.find((o) => o.kind === 'google')).toEqual({ kind: 'google', available: false, why: 'Not set up in this build.' })
    expect(offers.map((o) => o.kind)).not.toContain('canvas')
    expect(connected).toHaveLength(1)
  })

  it('revokes Google when it is removed', async () => {
    state.list = [{ id: 'google', kind: 'google', label: 'Google Calendar', auth: 'oauth', secret: 'L:e30=', added: 1 }]
    await index.removeConnection('google')
    expect(mocks.revokeGoogle).toHaveBeenCalledOnce()
    expect(state.list).toEqual([])
  })
})
