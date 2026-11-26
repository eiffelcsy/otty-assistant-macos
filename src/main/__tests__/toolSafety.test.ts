import { describe, expect, it, vi } from 'vitest'

let baseUrl = 'https://api.deepseek.com'
vi.mock('electron', () => ({ clipboard: {}, shell: {}, ClipboardItem: class {} }))
vi.mock('../settings', () => ({ isDev: () => true, getApiKey: () => 'key', getStored: () => ({ baseUrl, model: 'claude-sonnet-5-5', apiFormat: baseUrl.includes('anthropic') ? 'anthropic' : 'auto', learn: true }), getConnections: () => [] }))
const { toolDefs } = await import('../tools')
const { CHAT_TOOLS, claimOnce, JOB_TOOLS, needsOnce, OUTSIDE_TOOLS, ruleOfTwo, SAFETY } = await import('../toolSafety')

const CONNECTION_TOOLS = ['calendar_events', 'calendar_free', 'reminders_due', 'canvas_due', 'canvas_announcements', 'notion_search', 'notion_page']

/** Every tool the model can be offered, whichever service is in use. */
function offered(): Set<string> {
  const all = new Set<string>()
  for (const url of ['https://api.deepseek.com', 'https://api.anthropic.com', 'https://api.openai.com/v1']) {
    baseUrl = url
    for (const d of toolDefs(CHAT_TOOLS)) all.add(d.function.name)
  }
  baseUrl = 'https://api.deepseek.com'
  return all
}

describe('tool safety labels', () => {
  it('labels every tool the model can be offered, and nothing else', () => {
    // Connection tools are offered only with a connection saved (D-54), and none is in these tests.
    expect([...offered()].sort()).toEqual(Object.keys(SAFETY).filter((n) => !CONNECTION_TOOLS.includes(n)).sort())
  })

  it('works out the lists from the table, and they match what Otty has always done', () => {
    expect([...OUTSIDE_TOOLS].sort()).toEqual(['calendar_events', 'calendar_free', 'canvas_announcements', 'canvas_due', 'notion_page', 'notion_search', 'read_page', 'reminders_due', 'search_web'])
    expect([...JOB_TOOLS].sort()).toEqual(['read_page', 'search_web'])
  })

  it('keeps anything that changes something out of a job', () => {
    for (const name of JOB_TOOLS) expect(SAFETY[name as keyof typeof SAFETY].changes).toBe('nothing')
    for (const name of ['open_url', 'create_reminder', 'copy_to_clipboard', 'remember', 'start_job']) expect(JOB_TOOLS.has(name)).toBe(false)
  })
})

describe('the Rule of Two', () => {
  it('allows the tools a job has', () => {
    expect(() => ruleOfTwo(JOB_TOOLS)).not.toThrow()
  })

  it('allows a chat turn’s whole set, which the user watches, only without private reading', () => {
    const connections = new Set(CONNECTION_TOOLS)
    expect(() => ruleOfTwo(Object.keys(SAFETY).filter((n) => !connections.has(n)))).not.toThrow()
  })

  // D-54: connection tools read private data and outside words at once, so they live only in a chat, where needsCard shows what leaves.
  it('keeps connection tools out of jobs: with them the set has all three legs', () => {
    expect(() => ruleOfTwo(Object.keys(SAFETY))).toThrow()
    for (const name of CONNECTION_TOOLS) expect(JOB_TOOLS.has(name)).toBe(false)
  })

  it('throws when private data, outside words and a way out meet', () => {
    expect(() => ruleOfTwo(JOB_TOOLS, true)).toThrow(/two of those/)
  })

  it('throws for a tool with no label', () => {
    expect(() => ruleOfTwo(['search_web', 'mystery'])).toThrow(/no safety label/)
  })
})

describe('once only', () => {
  it('lets a call through once and refuses it again', () => {
    const seen = new Set<string>()
    expect(claimOnce(seen, 'job1', 'call1')).toBe(true)
    expect(claimOnce(seen, 'job1', 'call1')).toBe(false)
    expect(claimOnce(seen, 'job1', 'call2')).toBe(true)
    expect(claimOnce(seen, 'job2', 'call1')).toBe(true)
  })

  it('asks for it only on tools that change something', () => {
    expect(needsOnce('create_reminder')).toBe(true)
    expect(needsOnce('search_web')).toBe(false)
    expect(needsOnce('unlabelled')).toBe(true)
  })
})
