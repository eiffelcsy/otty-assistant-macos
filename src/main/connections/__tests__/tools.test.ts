// D-54: the built-in tools and the user's own: offers, limits, merged results, failures, cards and safety rows.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionError, type CalendarEvent } from '../types'

const state = vi.hoisted(() => ({ list: [] as any[], baseUrl: 'https://api.deepseek.com' }))
const mocks = vi.hoisted(() => ({
  appleEvents: vi.fn(),
  appleReminders: vi.fn(),
  googleEvents: vi.fn(),
  googleToken: vi.fn(async () => 'g-token'),
  canvasDue: vi.fn(),
  canvasAnnouncements: vi.fn(),
  notionSearch: vi.fn(),
  notionPage: vi.fn(),
  callTool: vi.fn(),
  listTools: vi.fn(),
  record: vi.fn()
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
vi.mock('../apple', () => ({ appleAccess: vi.fn(), appleEvents: mocks.appleEvents, appleReminders: mocks.appleReminders }))
vi.mock('../google', () => ({ googleClient: () => null, signInGoogle: vi.fn(), googleToken: mocks.googleToken, googleEvents: mocks.googleEvents, revokeGoogle: vi.fn() }))
vi.mock('../canvas', () => ({ canvasOrigin: (s: string) => s, checkCanvas: vi.fn(), canvasDue: mocks.canvasDue, canvasAnnouncements: mocks.canvasAnnouncements }))
vi.mock('../notion', () => ({ checkNotion: vi.fn(), notionSearch: mocks.notionSearch, notionPage: mocks.notionPage }))
vi.mock('../mcp', async (original) => ({ ...(await original<object>()), callTool: mocks.callTool, listTools: mocks.listTools }))
vi.mock('../../sent', () => ({ record: mocks.record }))

const { runTool, toolDefs } = await import('../../tools')
const { ownSafety, ownToolNames } = await import('../tools')
const { mcpToolName } = await import('../mcp')
const { CHAT_TOOLS } = await import('../../toolSafety')

const ALL = ['calendar_events', 'calendar_free', 'reminders_due', 'canvas_due', 'canvas_announcements', 'notion_search', 'notion_page']
const confirm = vi.fn(async () => true)
const ctx = (taint = { private: false, outside: false }) => ({ allowed: new Set([...CHAT_TOOLS, ...ownToolNames()]), taint, confirm, knownUrl: () => true })

const at = (day: number, hour: number) => new Date(2026, 11, day, hour).getTime()
const lunch: CalendarEvent = { title: 'Lunch', start: at(1, 12), end: at(1, 13), allDay: false, calendar: 'Home', source: 'Apple Calendar' }

const saved = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ id, kind, label: kind, auth: 'none', added: 1, ...extra })

const OWN_ID = 'mcp-abcdef123456'
const OWN_NAME = mcpToolName(OWN_ID, 'create_issue')
const ownConnection = (readOnly: boolean) =>
  saved(OWN_ID, 'mcp', {
    url: 'https://mcp.example.com/mcp',
    tools: [{ name: 'create_issue', title: 'Create issue', description: 'Makes one', schema: { type: 'object', properties: {} }, readOnly, on: true, pin: 'x' }]
  })

beforeEach(() => {
  state.list = []
  state.baseUrl = 'https://api.deepseek.com'
  vi.clearAllMocks()
  confirm.mockImplementation(async () => true)
})

describe('which tools are offered (D-54)', () => {
  const names = (connections: string[], web: 'deepseek' | 'off' = 'deepseek') =>
    toolDefs(new Set(ALL), { web, learn: false, connections: new Set(connections as never[]) }).map((d) => d.function.name)

  it('offers the calendar tools for Apple at any web setting, and for Google only with the web on', () => {
    expect(names(['apple'], 'off')).toContain('calendar_events')
    expect(names(['google'])).toContain('calendar_events')
    expect(names(['google'], 'off')).not.toContain('calendar_events')
  })

  it('with the web off, only Apple’s tools are offered (decision 15)', () => {
    expect(names(['apple', 'google', 'canvas', 'notion'], 'off').sort()).toEqual(['calendar_events', 'calendar_free', 'reminders_due'])
  })
})

describe('calendar_events', () => {
  it('refuses a range over 14 days', async () => {
    state.list = [saved('apple', 'apple')]
    const out = await runTool('calendar_events', { from: '2026-12-01', to: '2026-12-20' }, ctx())
    expect(out.status).toBe('error')
    expect(out.result).toContain('14 days')
  })

  it('lists merged events and records what was read', async () => {
    state.list = [saved('apple', 'apple')]
    mocks.appleEvents.mockResolvedValue([lunch])
    const out = await runTool('calendar_events', { from: '2026-12-01', to: '2026-12-01' }, ctx())
    expect(out.status).toBe('done')
    expect(out.result).toContain('1 events:')
    expect(out.result).toContain('- ')
    expect(out.result).toContain('Lunch')
    expect(out.result).toContain('(Home, Apple Calendar)')
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'connection', service: 'Apple Calendar', local: true, what: 'Read 1 events' }))
  })

  it('marks Google expired on an auth failure and still returns Apple’s events', async () => {
    state.list = [saved('apple', 'apple'), saved('google', 'google', { auth: 'oauth', secret: 'L:e30=' })]
    mocks.appleEvents.mockResolvedValue([lunch])
    mocks.googleEvents.mockRejectedValue(new ConnectionError('ran out', 'auth'))
    const out = await runTool('calendar_events', { from: '2026-12-01', to: '2026-12-01' }, ctx())
    expect(out.status).toBe('done')
    expect(out.result).toContain('Lunch')
    expect(out.result).toContain('sign-in ran out')
    expect(state.list.find((c) => c.id === 'google').expired).toBe(true)
  })

  it('is an error when every source failed', async () => {
    state.list = [saved('apple', 'apple')]
    mocks.appleEvents.mockRejectedValue(new ConnectionError('Apple said no', 'denied'))
    const out = await runTool('calendar_events', { from: '2026-12-01', to: '2026-12-01' }, ctx())
    expect(out).toEqual({ result: 'Apple said no', status: 'error' })
  })
})

describe('calendar_free', () => {
  it('lists gaps from the events', async () => {
    state.list = [saved('apple', 'apple')]
    mocks.appleEvents.mockResolvedValue([lunch])
    const out = await runTool('calendar_free', { from: '2026-12-01', to: '2026-12-01' }, ctx())
    expect(out.status).toBe('done')
    expect(out.result).toContain('8:00')
    expect(out.result.split('\n').length).toBeGreaterThan(1)
  })
})

describe('notion_search', () => {
  beforeEach(() => {
    state.list = [saved('notion', 'notion', { auth: 'token', secret: 'L:' + Buffer.from(JSON.stringify({ token: 't' })).toString('base64') })]
    mocks.notionSearch.mockResolvedValue([{ id: 'p1', title: 'Plans', edited: at(1, 9) }])
  })

  it('shows a card, and stops when refused, once private data and outside words meet', async () => {
    confirm.mockImplementation(async () => false)
    const out = await runTool('notion_search', { query: 'budget' }, ctx({ private: true, outside: true }))
    expect(out.status).toBe('denied')
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'use', service: 'Notion', yes: 'Send' }))
    expect(mocks.notionSearch).not.toHaveBeenCalled()
  })

  it('asks nothing when the run holds no private data', async () => {
    const out = await runTool('notion_search', { query: 'budget' }, ctx())
    expect(confirm).not.toHaveBeenCalled()
    expect(out.result).toContain('Plans (id p1')
  })
})

describe('the user’s own tools', () => {
  beforeEach(() => {
    state.list = [ownConnection(true)]
    mocks.callTool.mockResolvedValue({ text: 'done it', isError: false })
  })

  it('runs a read-only one without a card when the run holds no private data', async () => {
    const out = await runTool(OWN_NAME, { x: 1 }, ctx())
    expect(confirm).not.toHaveBeenCalled()
    expect(out).toEqual({ result: 'done it', status: 'done' })
  })

  it('always asks before one that changes something, and stops when refused', async () => {
    state.list = [ownConnection(false)]
    confirm.mockImplementation(async () => false)
    const out = await runTool(OWN_NAME, { title: 'x' }, ctx())
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'use', service: 'mcp', yes: 'Go ahead' }))
    expect(out.status).toBe('denied')
    expect(mocks.callTool).not.toHaveBeenCalled()
  })

  it('offers none while the web is off', () => {
    state.baseUrl = 'http://localhost:11434/v1'
    expect(ownToolNames()).toEqual([])
  })

  it('has safety rows that follow the server’s read-only hint', () => {
    expect(ownSafety(OWN_NAME)).toEqual({ reads: 'private', outside: true, leaves: true, changes: 'nothing' })
    state.list = [ownConnection(false)]
    expect(ownSafety(OWN_NAME)?.changes).toBe('lasting')
  })
})
