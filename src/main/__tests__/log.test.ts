import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { diagnosticsReport } from '../diagnostics'

let dir = ''
const { warn, error } = console

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'otty-log-'))
  vi.resetModules()
  console.warn = vi.fn()
  console.error = vi.fn()
})

afterEach(() => {
  console.warn = warn
  console.error = error
})

const log = () => import('../log')

describe('the log (D-50)', () => {
  it('masks a key, takes out the home folder and cuts a long line', async () => {
    const { logLine } = await log()
    const line = logLine('error', ['Request failed', new Error(`bad key sk-test1234567890abcdefgh in ${homedir()}/Library/x`)], new Date(0))
    expect(line).toMatch(/^1970-01-01T00:00:00.000Z error Request failed/)
    expect(line).not.toContain('sk-test1234567890abcdefgh')
    expect(line).not.toContain(homedir())
    expect(logLine('warn', ['x'.repeat(5_000)]).length).toBeLessThan(360)
    expect(logLine('warn', ['one\ntwo'])).toMatch(/one two\n$/)
    expect(logLine('error', ['fetch failed for https://gpu.home.lan:8080/v1/chat?q=x, stopped'])).toMatch(/for <address> stopped/)
  })

  it('tees main’s warnings and errors into otty.log, still printing them', async () => {
    const { startLog, lastLines } = await log()
    const printed = console.error
    startLog(dir, '9.9.9')
    console.error('Could not open what left the Mac', new Error('locked'))
    console.warn('Refused chat:send: not from the page itself')
    expect(printed).toHaveBeenCalledOnce()
    const lines = lastLines(10)
    expect(lines[0]).toMatch(/info Otty 9\.9\.9 started$/)
    expect(lines[1]).toMatch(/error Could not open what left the Mac Error: locked/)
    expect(lines[2]).toMatch(/warn Refused chat:send/)
    expect(lastLines(1)).toEqual([lines[2]])
  })

  it('keeps one older file once it passes 1 MB', async () => {
    writeFileSync(join(dir, 'otty.log'), 'x'.repeat(1_100_000))
    const { startLog } = await log()
    startLog(dir, '1.0.0')
    expect(readFileSync(join(dir, 'otty.1.log'), 'utf8')).toHaveLength(1_100_000)
    expect(readFileSync(join(dir, 'otty.log'), 'utf8')).toMatch(/started\n$/)
  })

  it('never breaks Otty when the folder can’t be made', async () => {
    const { startLog, lastLines } = await log()
    writeFileSync(join(dir, 'file'), '')
    expect(() => startLog(join(dir, 'file', 'logs'), '1.0.0')).not.toThrow()
    expect(lastLines(5)).toEqual([])
    expect(existsSync(join(dir, 'file', 'logs'))).toBe(false)
  })
})

describe('Copy diagnostics (D-50)', () => {
  it('reports facts about the Mac and Otty, and the log’s last lines', () => {
    const report = diagnosticsReport({
      version: '0.6.0',
      macOS: '26.1',
      arch: 'arm64',
      installed: true,
      inApplications: false,
      service: 'your AI service',
      model: 'llama',
      web: 'lookup',
      accessibility: true,
      screen: false,
      paused: false,
      log: ['2026-11-18T09:00:00.000Z info Otty 0.6.0 started'],
      hide: []
    })
    expect(report).toContain('Otty 0.6.0 · macOS 26.1 · arm64')
    expect(report).toContain('in Applications: no')
    expect(report).toContain('Screen Recording: no')
    expect(report).toContain('Last 1 log line:')
    expect(report).toMatch(/started$/)
  })

  it('never names a custom service’s host, wherever the log mentions it', () => {
    const facts = { version: '0.6.0', macOS: '26.1', arch: 'arm64', installed: true, inApplications: true, service: 'your AI service', model: 'llama', web: 'lookup', accessibility: true, screen: true, paused: false }
    const report = diagnosticsReport({ ...facts, log: ['x error getaddrinfo ENOTFOUND gpu.home.lan'], hide: ['gpu.home.lan'] })
    expect(report).not.toContain('gpu.home.lan')
    expect(report).toContain('ENOTFOUND your service')
    expect(diagnosticsReport({ ...facts, log: ['plain'], hide: [''] })).toMatch(/plain$/)
  })
})
