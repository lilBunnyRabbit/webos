import { describe, expect, test } from "vitest";
import {
  CounterSort,
  CountersFileSchema,
  create_counter,
  duration_parts,
  live_parts,
  elapsed_of,
  format_duration,
  from_datetime_local,
  heatmap_of,
  is_record,
  remove_run,
  rename,
  reset,
  resolve_counter,
  set_start,
  sort_counters,
  start,
  stats_of,
  stop,
  to_datetime_local,
  update_counter,
  type Counter,
} from "./counters";

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

function counter(overrides: Partial<Counter> = {}): Counter {
  return { id: "a", name: "Coffee", created_at: 0, current_start: 0, runs: [], ...overrides };
}

describe("format_duration", () => {
  test.each([
    [0, "0 s"],
    [-5 * S, "0 s"],
    [42 * S, "42 s"],
    [12 * M + 5 * S, "12 m 05 s"],
    [4 * H + 7 * M + 30 * S, "4 h 07 m"],
    [3 * D + 4 * H + 59 * M, "3 d 4 h"],
    [2 * D, "2 d"],
    [400 * D, "1 y 35 d"],
    [365 * D, "1 y"],
  ])("%d ms → %s", (ms, text) => expect(format_duration(ms)).toBe(text));
});

describe("duration_parts", () => {
  test("splits value and unit, padding the minor unit only under a day", () => {
    expect(duration_parts(3 * D + 4 * H)).toEqual([
      { value: "3", unit: "d" },
      { value: "4", unit: "h" },
    ]);
    expect(duration_parts(2 * H + 5 * M)).toEqual([
      { value: "2", unit: "h" },
      { value: "05", unit: "m" },
    ]);
  });
});

describe("runs", () => {
  test("create starts running now with a trimmed name", () => {
    expect(create_counter("  Last coffee ", 100, "x")).toEqual({
      id: "x",
      name: "Last coffee",
      created_at: 100,
      current_start: 100,
      runs: [],
    });
  });

  test("reset logs the run and starts again", () => {
    const next = reset(counter({ current_start: 10 }), 50);
    expect(next.runs).toEqual([{ started_at: 10, ended_at: 50 }]);
    expect(next.current_start).toBe(50);
  });

  test("reset on a stopped counter only starts it", () => {
    expect(reset(counter({ current_start: null }), 50)).toMatchObject({ current_start: 50, runs: [] });
  });

  test("stop logs the run, start resumes", () => {
    const stopped = stop(counter({ current_start: 10 }), 50);
    expect(stopped).toMatchObject({ current_start: null, runs: [{ started_at: 10, ended_at: 50 }] });
    expect(elapsed_of(stopped, 99)).toBe(0);
    expect(start(stopped, 70).current_start).toBe(70);
  });

  test("set_start clamps between the last run and now", () => {
    const c = counter({ current_start: 50, runs: [{ started_at: 0, ended_at: 40 }] });
    expect(set_start(c, 45, 100).current_start).toBe(45);
    expect(set_start(c, 10, 100).current_start).toBe(40);
    expect(set_start(c, 500, 100).current_start).toBe(100);
    expect(set_start(c, NaN, 100)).toBe(c);
  });

  test("removing the newest run undoes the reset", () => {
    const c = reset(reset(counter({ current_start: 0 }), 10), 30);
    expect(remove_run(c, 1)).toMatchObject({ current_start: 10, runs: [{ started_at: 0, ended_at: 10 }] });
  });

  test("removing the newest run of a stopped counter resumes it", () => {
    const c = stop(counter({ current_start: 5 }), 20);
    expect(remove_run(c, 0)).toMatchObject({ current_start: 5, runs: [] });
  });

  test("removing an older run keeps the current one", () => {
    const c = reset(reset(counter({ current_start: 0 }), 10), 30);
    expect(remove_run(c, 0)).toMatchObject({ current_start: 30, runs: [{ started_at: 10, ended_at: 30 }] });
    expect(remove_run(c, 9)).toBe(c);
  });

  test("removing the newest run after its start was edited keeps the edit", () => {
    const c = set_start(reset(counter({ current_start: 0 }), 10), 20, 50);
    expect(remove_run(c, 0).current_start).toBe(20);
  });

  test("rename ignores blank names", () => {
    expect(rename(counter(), "  Tea ").name).toBe("Tea");
    expect(rename(counter(), "  ").name).toBe("Coffee");
  });
});

describe("stats", () => {
  test("none without runs", () => expect(stats_of([])).toBeNull());

  test("count, total, average, shortest, longest", () => {
    expect(
      stats_of([
        { started_at: 0, ended_at: 10 },
        { started_at: 10, ended_at: 40 },
      ])
    ).toEqual({ count: 2, total: 40, average: 20, shortest: 10, longest: 30 });
  });

  test("a record needs a finished run to beat", () => {
    expect(is_record(counter({ current_start: 0 }), 100)).toBe(false);
    const c = counter({ current_start: 50, runs: [{ started_at: 0, ended_at: 50 }] });
    expect(is_record(c, 90)).toBe(false);
    expect(is_record(c, 101)).toBe(true);
  });

  test("heatmap counts resets by weekday and hour", () => {
    const monday_9 = new Date(2026, 9, 12, 9, 30).getTime();
    const grid = heatmap_of([
      { started_at: 0, ended_at: monday_9 },
      { started_at: 0, ended_at: monday_9 + M },
    ]);
    expect(grid[0][9]).toBe(2);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(2);
  });
});

describe("sort", () => {
  const old = counter({ id: "old", name: "b", created_at: 1, current_start: 10 });
  const fresh = counter({ id: "fresh", name: "a", created_at: 2, current_start: 90 });
  const stopped = counter({
    id: "stopped",
    name: "c",
    created_at: 3,
    current_start: null,
    runs: [{ started_at: 0, ended_at: 95 }],
  });
  const ids = (sort: CounterSort) => sort_counters([fresh, stopped, old], sort).map((c) => c.id);

  test("longest running first, stopped last", () =>
    expect(ids(CounterSort.LONGEST)).toEqual(["old", "fresh", "stopped"]));
  test("most recent first, stopped last", () => expect(ids(CounterSort.RECENT)).toEqual(["fresh", "old", "stopped"]));
  test("by name", () => expect(ids(CounterSort.NAME)).toEqual(["fresh", "old", "stopped"]));
  test("newest created first", () => expect(ids(CounterSort.CREATED)).toEqual(["stopped", "fresh", "old"]));
});

describe("file", () => {
  test("update_counter changes only the matching counter", () => {
    const file = { version: 1 as const, counters: [counter(), counter({ id: "b" })] };
    const next = update_counter(file, "b", (c) => rename(c, "Tea"));
    expect(next.counters.map((c) => c.name)).toEqual(["Coffee", "Tea"]);
    expect(next.counters[0]).toBe(file.counters[0]);
  });

  test("schema accepts the empty file and rejects junk", () => {
    expect(CountersFileSchema.safeParse({ version: 1, counters: [counter()] }).success).toBe(true);
    expect(CountersFileSchema.safeParse({ version: 2, counters: [] }).success).toBe(false);
  });

  test("datetime-local round trip to the minute", () => {
    const at = new Date(2026, 9, 14, 8, 5).getTime();
    expect(to_datetime_local(at)).toBe("2026-10-14T08:05");
    expect(from_datetime_local(to_datetime_local(at))).toBe(at);
    expect(from_datetime_local("")).toBeNaN();
  });
});

describe("resolve_counter", () => {
  const counters = [create_counter("Last coffee", 0, "ab12"), create_counter("Last cigarette", 0, "ab99"), create_counter("Gym", 0, "cd34")];

  test("by id prefix, exact name or name prefix", () => {
    expect(resolve_counter(counters, "cd")).toBe(counters[2]);
    expect(resolve_counter(counters, "last COFFEE")).toBe(counters[0]);
    expect(resolve_counter(counters, "last ci")).toBe(counters[1]);
    expect(resolve_counter(counters, "coff")).toBe(counters[0]);
  });

  test("ambiguous and missing read as errors", () => {
    expect(resolve_counter(counters, "ab")).toBe('"ab" matches Last coffee, Last cigarette');
    expect(resolve_counter(counters, "last")).toBe('"last" matches Last coffee, Last cigarette');
    expect(resolve_counter(counters, "tea")).toBe('no counter "tea"');
  });
});

describe("live_parts", () => {
  test("shows every unit down to seconds, padding all but the first", () => {
    const parts = (ms: number) => live_parts(ms).map((part) => part.value + part.unit).join(" ");
    expect(parts(3 * D + 4 * H + 5 * 60_000 + 6_000)).toBe("3d 04h 05m 06s");
    expect(parts(3 * D)).toBe("3d 00h 00m 00s");
    expect(parts(42_000)).toBe("42s");
    expect(parts(0)).toBe("0s");
  });
});
