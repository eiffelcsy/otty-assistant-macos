// D-84: the cove's visitors are chosen by the time of day, wait 25 to 70 s, and never repeat in a row.
import { describe, expect, it } from "vitest";
import { ALLOWED, leafShift, nextVisit, type Visit } from "../visitors";
import type { CoveTime } from "../cove";

const TIMES: CoveTime[] = ["dawn", "day", "golden", "night"];

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function chain(time: CoveTime, rand: () => number, n = 200) {
  const out: { visit: Visit; delay: number }[] = [];
  let last: Visit | null = null;
  for (let i = 0; i < n; i++) {
    const next = nextVisit(time, last, rand);
    out.push(next);
    last = next.visit;
  }
  return out;
}

describe("the cove visitors (D-84)", () => {
  it("only picks what the time of day allows", () => {
    expect(ALLOWED.dawn).not.toContain("fireflies");
    expect(ALLOWED.night).not.toContain("birds");
    expect(ALLOWED.night).not.toContain("dragonfly");
    expect(ALLOWED.golden).toContain("fireflies");
    for (const time of TIMES) {
      for (const { visit } of chain(time, Math.random))
        expect(ALLOWED[time]).toContain(visit);
      for (const { visit } of chain(time, seeded(7)))
        expect(ALLOWED[time]).toContain(visit);
    }
  });

  it("waits between 25 s and 70 s", () => {
    for (const { delay } of chain("day", Math.random)) {
      expect(delay).toBeGreaterThanOrEqual(25_000);
      expect(delay).toBeLessThanOrEqual(70_000);
    }
    // the bounds themselves, from a generator that returns each end
    expect(nextVisit("day", null, () => 0).delay).toBe(25_000);
    expect(nextVisit("day", null, () => 0.999999).delay).toBeLessThan(70_000);
  });

  it("never shows the same visit twice in a row, with Math.random or a seeded generator", () => {
    for (const time of TIMES) {
      for (const rand of [Math.random, seeded(42)]) {
        const visits = chain(time, rand).map((x) => x.visit);
        for (let i = 1; i < visits.length; i++)
          expect(visits[i]).not.toBe(visits[i - 1]);
      }
    }
  });

  it("still picks something when the last visit was the only one allowed", () => {
    expect(nextVisit("night", "fireflies", () => 0).visit).toBe("fish");
    expect(nextVisit("night", "fish", () => 0).visit).toBe("fireflies");
  });
});

describe("the leaf (D-84, decision 3)", () => {
  it("moves 3 px per gust to 12 px after four, then wraps back to its start", () => {
    expect([0, 1, 2, 3, 4].map(leafShift)).toEqual([0, 3, 6, 9, 12]);
    expect(leafShift(5)).toBe(0);
    expect(leafShift(9)).toBe(12);
  });
});
