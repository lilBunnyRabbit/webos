import { describe, expect, it } from "vitest";
import { can_redo, can_undo, create_history, current, push, redo, undo } from "./history";

describe("history", () => {
  it("undoes, redoes and drops the redo branch on a new entry", () => {
    let history = push(push(create_history(0), 1), 2);
    history = undo(undo(history));
    expect(current(history)).toBe(0);
    expect(can_undo(history)).toBe(false);
    history = redo(history);
    expect(current(history)).toBe(1);
    history = push(history, 5);
    expect(history.entries).toEqual([0, 1, 5]);
    expect(can_redo(history)).toBe(false);
  });

  it("keeps the newest entries", () => {
    let history = create_history(0);
    for (let i = 1; i <= 5; i++) history = push(history, i, 3);
    expect(history.entries).toEqual([3, 4, 5]);
  });
});
