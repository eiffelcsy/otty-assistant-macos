import type { JobStatus } from './types'

// D-43: every move a job's status may make, in one table. Only `JobRunner` changes a status, through `change()`,
// which refuses anything not listed here. Staying in the same status isn't a move.
export const MOVES: Record<JobStatus, readonly JobStatus[]> = {
  // Due: runs, or asks first when it was due long ago.
  scheduled: ['queued', 'paused'],
  // Starts, or can't (web off, the month's limit), or is stopped before it starts.
  queued: ['working', 'paused', 'failed'],
  // Asks about an address, loses its connection, finishes, fails or is stopped.
  working: ['waiting', 'paused', 'done', 'failed'],
  // Allow or Don't Allow, or stopped.
  waiting: ['queued', 'failed'],
  // Keep going, or stopped.
  paused: ['queued', 'failed'],
  // Try again.
  failed: ['queued'],
  done: []
}

export function assertMove(from: JobStatus, to: JobStatus): void {
  if (from !== to && !MOVES[from].includes(to)) throw new Error(`A job can't go from ${from} to ${to}.`)
}
