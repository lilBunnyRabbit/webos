import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ticker } from "./ticker.svelte";

describe("Ticker", () => {
  let visible = $state(true);
  let interval = $state(60_000);
  let ticker: Ticker;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    visible = true;
    interval = 60_000;
    cleanup = $effect.root(() => {
      ticker = new Ticker(
        () => visible,
        () => interval
      );
    });
    flushSync();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ticks at the interval while visible", () => {
    vi.advanceTimersByTime(60_000);
    expect(ticker.now).toBe(60_000);
    vi.advanceTimersByTime(30_000);
    expect(ticker.now).toBe(60_000);
  });

  it("stops while hidden and catches up the moment it's visible again", () => {
    visible = false;
    flushSync();
    vi.advanceTimersByTime(180_000);
    expect(ticker.now).toBe(0);
    visible = true;
    flushSync();
    expect(ticker.now).toBe(180_000);
  });

  it("restarts at once when the interval changes", () => {
    vi.advanceTimersByTime(10_000);
    interval = 1000;
    flushSync();
    expect(ticker.now).toBe(10_000);
    vi.advanceTimersByTime(1000);
    expect(ticker.now).toBe(11_000);
  });
});
