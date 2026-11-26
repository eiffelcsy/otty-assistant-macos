// @vitest-environment jsdom
// D-84: the cove's visitors: one timer, only while the window is awake, visible and not reduced, one at a time.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// React only listens for animationend when the browser has AnimationEvent, which jsdom doesn't (set before React loads).
vi.hoisted(() => {
  (window as unknown as { AnimationEvent: unknown }).AnimationEvent = Event;
});
import { Cove } from "../Cove";
import { coveTime } from "../../lib/cove";
import { ALLOWED } from "../../lib/visitors";

const visits = (root: HTMLElement) => root.querySelectorAll(".cove__visit");
const tick = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};
/** An animationend from `el` with a name, as the browser sends it (jsdom has no AnimationEvent). */
const animationEnd = (el: Element, animationName: string) => {
  const ev = new Event("animationend", { bubbles: true });
  Object.defineProperty(ev, "animationName", { value: animationName });
  act(() => {
    el.dispatchEvent(ev);
  });
};
const motion = (reduce: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
  motion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.asleep;
  delete (window as { matchMedia?: unknown }).matchMedia;
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

describe("the cove visitors (D-84)", () => {
  it("shows one of the time of day’s visits after 25 s, on the full cove", () => {
    const { container } = render(<Cove mode="full" />);
    expect(visits(container).length).toBe(0);
    tick(25_000);
    const shown = visits(container);
    expect(shown.length).toBe(1);
    expect(shown[0].className).toContain(
      `cove__visit--${ALLOWED[coveTime(new Date())][0]}`,
    );
  });

  it("shows no visit while the window sleeps, the page is hidden, or reduced motion is on", () => {
    const { container, unmount } = render(<Cove mode="full" />);
    document.documentElement.dataset.asleep = "";
    tick(140_000);
    expect(visits(container).length).toBe(0);
    unmount();

    delete document.documentElement.dataset.asleep;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    const hidden = render(<Cove mode="full" />);
    tick(140_000);
    expect(visits(hidden.container).length).toBe(0);
    hidden.unmount();

    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    motion(true);
    const reduced = render(<Cove mode="full" />);
    tick(140_000);
    expect(visits(reduced.container).length).toBe(0);
  });

  it("never shows two visits at once", () => {
    const { container } = render(<Cove mode="full" />);
    tick(25_000);
    tick(25_000);
    expect(visits(container).length).toBe(1);
  });

  it("removes the visit when its own life ends, not a child animation", () => {
    const { container } = render(<Cove mode="full" />);
    tick(25_000);
    const [visit] = visits(container);
    animationEnd(visit, "cove-dragonfly-ltr");
    expect(visits(container).length).toBe(1);
    animationEnd(visit, "cove-visit-life");
    expect(visits(container).length).toBe(0);
  });

  it("does not visit the wash band", () => {
    const { container } = render(<Cove mode="wash" />);
    tick(140_000);
    expect(visits(container).length).toBe(0);
  });
});
