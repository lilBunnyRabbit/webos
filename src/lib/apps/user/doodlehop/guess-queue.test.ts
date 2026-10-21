import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GuessQueue } from "./guess-queue";

interface Pending {
  signal: AbortSignal;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

function setup() {
  const asked: Pending[] = [];
  const answers: string[] = [];
  const errors: unknown[] = [];
  const queue = new GuessQueue<string>({
    idle_ms: 700,
    ask: (signal) =>
      new Promise<string>((resolve, reject) => {
        asked.push({ signal, resolve, reject });
        signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    onanswer: (answer) => answers.push(answer),
    onerror: (reason) => errors.push(reason),
  });
  return { queue, asked, answers, errors };
}

function stroke(queue: GuessQueue<string>) {
  queue.pen(true);
  queue.pen(false);
  queue.changed();
}

describe("GuessQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("asks once the pen has rested", () => {
    const { queue, asked } = setup();
    stroke(queue);
    vi.advanceTimersByTime(699);
    expect(asked).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(asked).toHaveLength(1);
  });

  test("a new stroke restarts the wait, and a pen down holds it", () => {
    const { queue, asked } = setup();
    stroke(queue);
    vi.advanceTimersByTime(500);
    queue.pen(true);
    vi.advanceTimersByTime(2000);
    expect(asked).toHaveLength(0);
    queue.pen(false);
    queue.changed();
    vi.advanceTimersByTime(700);
    expect(asked).toHaveLength(1);
  });

  test("one question out at a time; strokes made meanwhile go into the next one", async () => {
    const { queue, asked, answers } = setup();
    stroke(queue);
    vi.advanceTimersByTime(700);
    stroke(queue);
    vi.advanceTimersByTime(700);
    stroke(queue);
    vi.advanceTimersByTime(700);
    expect(asked).toHaveLength(1);

    asked[0].resolve("first");
    await vi.runAllTimersAsync();
    expect(answers).toEqual(["first"]);
    expect(asked).toHaveLength(2);

    asked[1].resolve("second");
    await vi.runAllTimersAsync();
    expect(answers).toEqual(["first", "second"]);
    expect(asked).toHaveLength(2);
  });

  test("nothing new, nothing asked", async () => {
    const { queue, asked } = setup();
    stroke(queue);
    vi.advanceTimersByTime(700);
    asked[0].resolve("cat");
    await vi.runAllTimersAsync();
    expect(asked).toHaveLength(1);
  });

  test("undo drops the answer out and asks about what is left", async () => {
    const { queue, asked, answers, errors } = setup();
    stroke(queue);
    vi.advanceTimersByTime(700);
    queue.replaced();
    expect(asked[0].signal.aborted).toBe(true);
    await vi.runAllTimersAsync();
    expect(asked).toHaveLength(2);
    expect(answers).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("close waits for the answer out, which still counts, and asks nothing more", async () => {
    const { queue, asked, answers } = setup();
    stroke(queue);
    vi.advanceTimersByTime(700);
    stroke(queue);
    const closed = queue.close();
    asked[0].resolve("late");
    await closed;
    await vi.runAllTimersAsync();
    expect(answers).toEqual(["late"]);
    expect(asked).toHaveLength(1);
  });

  test("cancel drops the answer out", async () => {
    const { queue, asked, answers } = setup();
    stroke(queue);
    vi.advanceTimersByTime(700);
    queue.cancel();
    asked[0].resolve("ignored");
    await vi.runAllTimersAsync();
    expect(answers).toEqual([]);
  });

  test("a failed question reports its error", async () => {
    const { queue, asked, errors } = setup();
    stroke(queue);
    vi.advanceTimersByTime(700);
    asked[0].reject(new Error("no model"));
    await vi.runAllTimersAsync();
    expect(errors).toHaveLength(1);
  });
});
