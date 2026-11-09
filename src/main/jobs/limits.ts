// The first supervisor, in plain code (AUTONOMY idea 10). It reads what a job does and can only ever end its tools
// early, so fooling it gets you a job stopped for no reason, never a safeguard removed.

export interface Limits {
  rounds: number
  lookups: number
  workMs: number
  sameCall: number
  /** Dropped connections in a row before pausing, with the wait before each retry. */
  retryMs: readonly number[]
  /** No word from the model for this long counts as a dropped connection. */
  idleMs: number
  /** Left this long, a job asks before spending again. */
  staleMs: number
  /** Jobs waiting their turn. */
  queue: number
}

export const LIMITS: Limits = {
  rounds: 24,
  lookups: 30,
  workMs: 15 * 60_000,
  sameCall: 3,
  idleMs: 90_000,
  retryMs: [5_000, 20_000, 60_000],
  staleMs: 24 * 3_600_000,
  queue: 5
}

export type LimitReached = 'rounds' | 'lookups' | 'time' | 'repeat'

export class Supervisor {
  reached: LimitReached | null = null
  private calls = new Map<string, number>()

  constructor(
    private counts: { rounds: number; lookups: number; workedMs: number },
    private limits: Pick<Limits, 'rounds' | 'lookups' | 'workMs' | 'sameCall'> = LIMITS
  ) {
    this.check()
  }

  private check(): void {
    if (this.reached) return
    if (this.counts.rounds >= this.limits.rounds) this.reached = 'rounds'
    else if (this.counts.lookups >= this.limits.lookups) this.reached = 'lookups'
    else if (this.counts.workedMs >= this.limits.workMs) this.reached = 'time'
  }

  /** Call after any count changes. */
  update(counts: { rounds: number; lookups: number; workedMs: number }): void {
    this.counts = counts
    this.check()
  }

  /** The same call with the same arguments, again and again, is a job going nowhere. */
  sawCall(name: string, args: string): void {
    const key = `${name} ${args}`
    const n = (this.calls.get(key) ?? 0) + 1
    this.calls.set(key, n)
    if (n >= this.limits.sameCall) this.reached ??= 'repeat'
  }
}
