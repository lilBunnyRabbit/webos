import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ticker } from "./ticker.svelte";

describe("Ticker", () => {
  let visible = $state(true);
  let interval = $state(60_000);
  let seen = 0;
  let cleanup: () => void;

  function watch(ticker: Ticker, record: (now: number) => void): () => void {
    return $effect.root(() => {
      $effect(() => record(ticker.now));
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    visible = true;
    interval = 60_000;
    const ticker = new Ticker(
      () => visible,
      () => interval
    );
    cleanup = watch(ticker, (now) => (seen = now));
    flushSync();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ticks at the interval while visible", () => {
    vi.advanceTimersByTime(60_000);
    flushSync();
    expect(seen).toBe(60_000);
    vi.advanceTimersByTime(30_000);
    flushSync();
    expect(seen).toBe(60_000);
  });

  it("stops while hidden and catches up the moment it's visible again", () => {
    visible = false;
    flushSync();
    vi.advanceTimersByTime(180_000);
    flushSync();
    expect(seen).toBe(0);
    visible = true;
    flushSync();
    expect(seen).toBe(180_000);
  });

  it("switches at once when the interval changes", () => {
    vi.advanceTimersByTime(10_000);
    interval = 1000;
    flushSync();
    expect(seen).toBe(10_000);
    vi.advanceTimersByTime(1000);
    flushSync();
    expect(seen).toBe(11_000);
  });

  it("ticks on wall-clock boundaries, shared by every ticker with the same interval", () => {
    cleanup();
    vi.setSystemTime(1_300);
    let a = 0;
    let b = 0;
    const stop_a = watch(new Ticker(() => true, 1000), (now) => (a = now));
    vi.advanceTimersByTime(400);
    const stop_b = watch(new Ticker(() => true, 1000), (now) => (b = now));
    flushSync();
    vi.advanceTimersByTime(300);
    flushSync();
    expect(a).toBe(2000);
    expect(b).toBe(2000);
    stop_a();
    stop_b();
    cleanup = () => {};
  });
});
