import { app } from 'electron'

// Dev only, with OTTY_METRICS=1: what Otty costs while it sits on screen. Keep it inside the budget in NFR-3.

const EVERY_MS = 60_000

interface ProcessMetric {
  type: string
  name?: string
  cpu: { percentCPUUsage: number }
  memory: { workingSetSize: number }
}

/** One log line: the total, then each process, heaviest first. Memory is reported in KB. */
export function formatMetrics(metrics: ProcessMetric[]): string {
  const mb = (kb: number) => Math.round(kb / 1024)
  const cpu = metrics.reduce((sum, m) => sum + m.cpu.percentCPUUsage, 0)
  const memory = metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0)
  const parts = [...metrics]
    .sort((a, b) => b.memory.workingSetSize - a.memory.workingSetSize)
    .map((m) => `${m.name ?? m.type} ${m.cpu.percentCPUUsage.toFixed(2)}%/${mb(m.memory.workingSetSize)}MB`)
  return `[metrics] cpu ${cpu.toFixed(2)}% · memory ${mb(memory)} MB · ${parts.join(' · ')}`
}

export function startMetrics(): void {
  if (process.env.OTTY_METRICS !== '1') return
  setInterval(() => console.log(formatMetrics(app.getAppMetrics())), EVERY_MS).unref()
}
