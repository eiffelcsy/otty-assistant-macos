import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getAppMetrics: () => [] } }))
const { formatMetrics, startMetrics } = await import('../metrics')

const metric = (type: string, cpu: number, kb: number) => ({ type, cpu: { percentCPUUsage: cpu }, memory: { workingSetSize: kb } })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('formatMetrics', () => {
  it('adds up the total and lists the heaviest process first', () => {
    const line = formatMetrics([metric('GPU', 0.1, 51_200), metric('Browser', 0.25, 102_400)])
    expect(line).toBe('[metrics] cpu 0.35% · memory 150 MB · Browser 0.25%/100MB · GPU 0.10%/50MB')
  })
})

describe('startMetrics', () => {
  it('does nothing unless asked', () => {
    vi.useFakeTimers()
    vi.stubEnv('OTTY_METRICS', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    startMetrics()
    vi.advanceTimersByTime(180_000)
    expect(log).not.toHaveBeenCalled()
  })

  it('logs once a minute when asked', () => {
    vi.useFakeTimers()
    vi.stubEnv('OTTY_METRICS', '1')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    startMetrics()
    vi.advanceTimersByTime(120_000)
    expect(log).toHaveBeenCalledTimes(2)
  })
})
