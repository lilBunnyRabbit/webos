import { describe, expect, test } from "vitest";
import { default_params, record, type Definition } from "../../engine/definition";
import os, { type Process, type Schedule } from "./index";

const run = <R>(id: string, input: unknown, params: Record<string, number | string> = {}) => {
  const definition = os[id] as Definition<unknown, R>;
  const recording = record(definition, input, { ...default_params(definition.params), ...params });
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const PROCESSES: Process[] = [
  { name: "A", arrival: 0, burst: 6, priority: 3 },
  { name: "B", arrival: 1, burst: 3, priority: 1 },
  { name: "C", arrival: 2, burst: 8, priority: 4 },
  { name: "D", arrival: 3, burst: 2, priority: 2 },
];

describe("CPU scheduling", () => {
  test("FCFS runs in arrival order", () => {
    const { finish, waiting } = run<Schedule>("cpu-scheduling", PROCESSES, { policy: "fcfs" });
    expect(finish).toEqual({ A: 6, B: 9, C: 17, D: 19 });
    expect(waiting).toEqual({ A: 0, B: 5, C: 7, D: 14 });
  });

  test("SJF picks the shortest waiting job", () => {
    expect(run<Schedule>("cpu-scheduling", PROCESSES, { policy: "sjf" }).finish).toEqual({ A: 6, D: 8, B: 11, C: 19 });
  });

  test("priority picks the lowest number", () => {
    expect(run<Schedule>("cpu-scheduling", PROCESSES, { policy: "priority" }).finish).toEqual({ A: 6, B: 9, D: 11, C: 19 });
  });

  test("every policy runs each process exactly its burst and never before it arrives", () => {
    for (const policy of ["fcfs", "sjf", "priority", "rr"]) {
      for (let round = 0; round < 20; round++) {
        const list = "ABCDE".split("").map((name, i) => ({ name, arrival: i === 0 ? 0 : Math.floor(Math.random() * 8), burst: 1 + Math.floor(Math.random() * 6), priority: Math.floor(Math.random() * 5) }));
        const { timeline, finish } = run<Schedule>("cpu-scheduling", list, { policy, quantum: 2 });
        for (const p of list) {
          expect(timeline.filter((who) => who === p.name)).toHaveLength(p.burst);
          expect(timeline.indexOf(p.name)).toBeGreaterThanOrEqual(p.arrival);
          expect(finish[p.name]).toBe(timeline.lastIndexOf(p.name) + 1);
        }
      }
    }
  });

  test("round robin interleaves", () => {
    const { timeline } = run<Schedule>("cpu-scheduling", [{ name: "A", arrival: 0, burst: 4, priority: 0 }, { name: "B", arrival: 0, burst: 4, priority: 0 }], { policy: "rr", quantum: 1 });
    expect(timeline.join("")).toBe("ABABABAB");
  });
});

describe("page replacement", () => {
  const refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];

  test("textbook fault counts with 3 frames", () => {
    expect(run<{ faults: number }>("page-replacement", refs, { policy: "fifo", frames: 3 }).faults).toBe(15);
    expect(run<{ faults: number }>("page-replacement", refs, { policy: "lru", frames: 3 }).faults).toBe(12);
    expect(run<{ faults: number }>("page-replacement", refs, { policy: "optimal", frames: 3 }).faults).toBe(9);
  });

  test("Optimal never faults more than the others", () => {
    for (let round = 0; round < 40; round++) {
      const list = Array.from({ length: 20 }, () => Math.floor(Math.random() * 7));
      const frames = 2 + Math.floor(Math.random() * 3);
      const best = run<{ faults: number }>("page-replacement", list, { policy: "optimal", frames }).faults;
      for (const policy of ["fifo", "lru", "clock"]) expect(run<{ faults: number }>("page-replacement", list, { policy, frames }).faults).toBeGreaterThanOrEqual(best);
    }
  });
});

describe("producer–consumer", () => {
  test("never consumes more than was produced, and blocks at the edges", () => {
    const result = run<{ produced: number; consumed: number; blocked: number }>("producer-consumer", ["c", "p", "p", "p", "p", "p"], { size: 3 });
    expect(result).toEqual({ produced: 4, consumed: 1, blocked: 2 });
  });

  test("random schedules keep the counts consistent", () => {
    for (let round = 0; round < 40; round++) {
      const ops = Array.from({ length: 20 }, () => (Math.random() < 0.5 ? "p" : "c"));
      const size = 2 + Math.floor(Math.random() * 4);
      const { produced, consumed } = run<{ produced: number; consumed: number }>("producer-consumer", ops, { size });
      expect(consumed).toBeLessThanOrEqual(produced);
      expect(produced - consumed).toBeLessThanOrEqual(size);
    }
  });
});

describe("samples run", () => {
  for (const [id, definition] of Object.entries(os)) {
    test(id, () => {
      for (const input of [definition.input.sample, ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
