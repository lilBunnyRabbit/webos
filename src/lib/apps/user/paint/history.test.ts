import { describe, expect, test } from "vitest";
import { can_redo, can_undo, create_history, current, push, redo, undo } from "./history";

const LIMITS = { max_entries: 10 };

describe("history", () => {
  test("starts with the initial entry and nothing to undo or redo", () => {
    const history = create_history("a");
    expect(current(history)).toBe("a");
    expect(can_undo(history)).toBe(false);
    expect(can_redo(history)).toBe(false);
  });

  test("undo and redo walk the entries", () => {
    let history = create_history("a");
    history = push(history, "b", LIMITS);
    history = push(history, "c", LIMITS);
    history = undo(history);
    expect(current(history)).toBe("b");
    history = undo(history);
    expect(current(history)).toBe("a");
    expect(undo(history)).toBe(history);
    history = redo(history);
    expect(current(history)).toBe("b");
  });

  test("pushing after an undo drops the redo branch", () => {
    let history = create_history("a");
    history = push(history, "b", LIMITS);
    history = undo(history);
    history = push(history, "c", LIMITS);
    expect(history.entries).toEqual(["a", "c"]);
    expect(can_redo(history)).toBe(false);
  });

  test("drops the oldest entries past max_entries", () => {
    let history = create_history(0);
    for (let i = 1; i <= 5; i++) history = push(history, i, { max_entries: 3 });
    expect(history.entries).toEqual([3, 4, 5]);
    expect(current(history)).toBe(5);
  });

  test("drops the oldest entries past max_bytes but keeps the newest", () => {
    const limits = { max_entries: 100, max_bytes: 10, size_of: (entry: number) => entry };
    let history = create_history(4);
    history = push(history, 4, limits);
    history = push(history, 4, limits);
    expect(history.entries).toEqual([4, 4]);

    history = push(history, 50, limits);
    expect(history.entries).toEqual([50]);
    expect(can_undo(history)).toBe(false);
  });

  test("does not mutate the previous history", () => {
    const before = create_history("a");
    const after = push(before, "b", LIMITS);
    expect(before.entries).toEqual(["a"]);
    expect(after.entries).toEqual(["a", "b"]);
  });
});
