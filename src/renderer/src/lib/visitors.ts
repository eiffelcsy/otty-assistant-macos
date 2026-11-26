import type { CoveTime } from "./cove";

/** The small visitors in the cove (D-84): each is one finite, stepped CSS animation. */
export type Visit = "dragonfly" | "birds" | "fireflies" | "fish" | "wind";

/** What each painting allows: birds and dragonflies by day, fireflies at golden hour and night. */
export const ALLOWED: Record<CoveTime, Visit[]> = {
  dawn: ["dragonfly", "birds", "fish", "wind"],
  day: ["dragonfly", "birds", "fish", "wind"],
  golden: ["birds", "fireflies", "fish", "wind"],
  night: ["fireflies", "fish", "wind"],
};

/** The next visit and how long to wait before it: 25 to 70 s, never the same visit twice in a row. */
export function nextVisit(
  time: CoveTime,
  last: Visit | null,
  rand: () => number,
): { visit: Visit; delay: number } {
  const all = ALLOWED[time];
  const pool = all.filter((v) => v !== last);
  const choices = pool.length ? pool : all;
  return {
    visit: choices[Math.floor(rand() * choices.length)],
    delay: 25_000 + rand() * 45_000,
  };
}

/** The reeds' gusts move the leaf 3 px right each time, to 12 px after four, then back to its start. */
export const leafShift = (gusts: number): number => (gusts % 5) * 3;
