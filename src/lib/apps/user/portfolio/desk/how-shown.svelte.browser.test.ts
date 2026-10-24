import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushSync } from "svelte";
import { HowShown, PEEK_DELAY } from "./how-shown.svelte";
import { PortfolioSession, TourState } from "./session.svelte";

const pointer = (pointerType: string) => ({ pointerType }) as PointerEvent;

function setup() {
  const session = new PortfolioSession(false);
  session.tour = TourState.DONE;
  let view!: HowShown;
  const stop = $effect.root(() => {
    view = new HowShown(session);
  });
  flushSync();
  return { session, view, stop };
}

describe("HowShown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("a sweep across the controls changes neither the page nor the logo", () => {
    const { session, view, stop } = setup();
    view.toggle("team");
    flushSync();
    for (const id of ["decisions", "lightest", "performance", "correct", "feel"]) {
      const handlers = view.peek(id);
      handlers.onpointerenter(pointer("mouse"));
      vi.advanceTimersByTime(60);
      handlers.onpointerleave();
    }
    vi.advanceTimersByTime(PEEK_DELAY * 2);
    expect(view.id).toBe("team");
    expect(session.peek).toBeNull();
    stop();
  });

  test("resting on one previews its glyph in the logo after the delay, without turning the page", () => {
    const { session, view, stop } = setup();
    view.toggle("team");
    flushSync();
    view.peek("feel").onpointerenter(pointer("mouse"));
    vi.advanceTimersByTime(PEEK_DELAY - 1);
    expect(session.peek).toBeNull();
    vi.advanceTimersByTime(1);
    expect(session.peek).toBe("feel");
    expect(view.id).toBe("team");
    view.peek("feel").onpointerleave();
    expect(session.peek).toBeNull();
    stop();
  });

  test("touch never previews; only a tap turns the page", () => {
    const { session, view, stop } = setup();
    view.peek("feel").onpointerenter(pointer("touch"));
    vi.advanceTimersByTime(PEEK_DELAY * 2);
    expect(session.peek).toBeNull();
    expect(view.id).toBeNull();
    view.toggle("feel");
    expect(view.id).toBe("feel");
    stop();
  });

  test("unpinning keeps the last page up; lighting another clears a stale preview", () => {
    const { session, view, stop } = setup();
    view.toggle("team");
    flushSync();
    view.toggle("team");
    flushSync();
    expect(session.lit).toBeNull();
    expect(view.id).toBe("team");
    session.peek = "decisions";
    view.light("feel");
    expect(session.peek).toBeNull();
    expect(view.id).toBe("feel");
    stop();
  });
});
