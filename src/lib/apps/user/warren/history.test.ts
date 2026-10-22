import { describe, expect, it } from "vitest";
import { SAMPLE, SAMPLE_V5 } from "./fixture";
import { DiffKind, diff_paragraphs, paragraphs_of, parse_snapshot_name, snapshot_name, to_thin, type Snapshot } from "./history";

const at = (year: number, month: number, day: number, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();
const snap = (time: number): Snapshot => ({ at: time, words: 1, name: snapshot_name(time, 1) });
const kept = (snapshots: Snapshot[], now: number) => {
  const dropped = new Set(to_thin(snapshots, now).map((item) => item.at));
  return snapshots.filter((item) => !dropped.has(item.at)).map((item) => item.at);
};

describe("snapshot names", () => {
  it("carry the time and the word count", () => {
    const name = snapshot_name(1792656000123, 1234);
    expect(name).toBe("1792656000123-1234.warren");
    expect(parse_snapshot_name(name)).toEqual({ at: 1792656000123, words: 1234, name });
    expect(parse_snapshot_name("notes.warren")).toBeNull();
    expect(parse_snapshot_name("1792656000123-12.json")).toBeNull();
  });
});

describe("thinning", () => {
  const now = at(2026, 10, 22, 18);

  it("keeps every snapshot from today", () => {
    const today = [at(2026, 10, 22, 0, 5), at(2026, 10, 22, 9), at(2026, 10, 22, 9, 5), at(2026, 10, 22, 17)].map(snap);
    expect(kept(today, now)).toEqual(today.map((item) => item.at));
  });

  it("keeps the newest of each day for 30 days", () => {
    const days = [at(2026, 10, 21, 9), at(2026, 10, 21, 16), at(2026, 10, 21, 23, 59), at(2026, 10, 1, 8), at(2026, 10, 1, 20)].map(snap);
    expect(kept(days, now)).toEqual([at(2026, 10, 21, 23, 59), at(2026, 10, 1, 20)]);
  });

  it("keeps the newest of each week after that, weeks starting on Monday", () => {
    // 2026-09-14 is a Monday; the 14th to the 20th is one week.
    const old = [at(2026, 9, 14, 9), at(2026, 9, 17, 9), at(2026, 9, 20, 22), at(2026, 9, 21, 8), at(2026, 6, 2)].map(snap);
    expect(kept(old, now)).toEqual([at(2026, 9, 20, 22), at(2026, 9, 21, 8), at(2026, 6, 2)]);
  });

  it("keeps a snapshot from the future", () => {
    const future = [at(2026, 10, 25), at(2026, 10, 25, 13)].map(snap);
    expect(to_thin(future, now)).toEqual([]);
  });

  it("is stable: thinning what's left drops nothing more", () => {
    const many = Array.from({ length: 400 }, (_, index) => snap(now - index * 7 * 60 * 60_000));
    const left = many.filter((item) => !to_thin(many, now).includes(item));
    expect(to_thin(left, now)).toEqual([]);
    expect(left.length).toBeLessThan(60);
  });
});

describe("paragraph diff", () => {
  it("marks added and removed paragraphs, a change as both", () => {
    const diff = diff_paragraphs(["Title", "One", "Two", "Three", "End"], ["Title", "One", "Two!", "Four", "End"]);
    expect(diff).toEqual([
      { kind: DiffKind.SAME, text: "Title" },
      { kind: DiffKind.SAME, text: "One" },
      { kind: DiffKind.REMOVED, text: "Two" },
      { kind: DiffKind.REMOVED, text: "Three" },
      { kind: DiffKind.ADDED, text: "Two!" },
      { kind: DiffKind.ADDED, text: "Four" },
      { kind: DiffKind.SAME, text: "End" },
    ]);
  });

  it("handles empty sides and moves", () => {
    expect(diff_paragraphs([], ["A"])).toEqual([{ kind: DiffKind.ADDED, text: "A" }]);
    expect(diff_paragraphs(["A"], [])).toEqual([{ kind: DiffKind.REMOVED, text: "A" }]);
    const moved = diff_paragraphs(["A", "B", "C"], ["C", "A", "B"]);
    expect(moved.filter((line) => line.kind === DiffKind.SAME).map((line) => line.text)).toEqual(["A", "B"]);
    expect(moved.filter((line) => line.kind !== DiffKind.SAME)).toHaveLength(2);
  });

  it("reads a document's paragraphs, table cells included", () => {
    expect(paragraphs_of(SAMPLE.editor)).toEqual(["Jane & Co <CV>", "A fast learner, very fast\nBreakfast fan.", "One", "Nested", "Two", "Dot"]);
    expect(paragraphs_of(SAMPLE_V5.editor)).toContain("Expert");
  });
});
