import { describe, expect, it, vi } from "vitest";
import { EMPTY_REGISTRY, parse_registry, serialize_registry, type Registry } from "./persistence";
import type { Job } from "./type";

const alarm: Job = {
  id: "clock:wake",
  app: "clock",
  title: "Wake up",
  at: { date: "2026-10-22", time: "07:00", tz: "Europe/Ljubljana" },
  repeat: { every: "week", days: [1, 2, 3, 4, 5], skip: ["2026-12-25"] },
  armed: true,
  armed_at: 1,
  last_fired: 2,
  missed_at: 3,
  actions: [
    { label: "Snooze", command: "alarm snooze wake" },
    { label: "Stop", command: "alarm stop wake" },
  ],
  open: { app: "clock", props: { tab: "alarms" } },
  kind: "alarm",
};

const text = (jobs: unknown[], extra: object = {}) => JSON.stringify({ version: 1, jobs, ...extra });

describe("parse_registry", () => {
  it("round-trips a registry", () => {
    const registry: Registry = { version: 1, jobs: [alarm, { id: "x:t", app: "x", title: "T", at: { epoch: 5 }, armed: false, kind: "timer", silent: true }] };
    expect(parse_registry(serialize_registry(registry))).toEqual(registry);
  });

  it("reads a lead time, and a job without one as before", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reminder = { id: "calendar:reminder-1", app: "calendar", title: "Rent", at: { date: "2026-10-31", time: "10:00", tz: "UTC" }, repeat: { every: "month", day: 31 }, before: 1440, armed: true, kind: "reminder" };
    expect(parse_registry(text([reminder, alarm])).jobs).toEqual([reminder, alarm]);
    expect(parse_registry(text([{ ...reminder, before: -5 }, { ...reminder, id: "calendar:reminder-2", before: 1.5 }])).jobs).toEqual([]);
  });

  it("starts empty from no file, broken JSON or another version", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parse_registry(null)).toEqual(EMPTY_REGISTRY);
    expect(parse_registry("{")).toEqual(EMPTY_REGISTRY);
    expect(parse_registry(JSON.stringify({ version: 2, jobs: [] }))).toEqual(EMPTY_REGISTRY);
    expect(parse_registry(null)).not.toBe(EMPTY_REGISTRY);
  });

  it("drops only the job that fails the schema", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = [
      { ...alarm, id: "other:wake" },
      { ...alarm, id: "clock:" },
      { ...alarm, id: "clock:tz", at: { date: "2026-10-22", time: "07:00", tz: "Mars/Olympus" } },
      { ...alarm, id: "clock:day", at: { date: "2026-02-30", time: "07:00", tz: "UTC" } },
      { ...alarm, id: "clock:time", at: { date: "2026-02-03", time: "7:00", tz: "UTC" } },
      { ...alarm, id: "clock:epoch-repeat", at: { epoch: 5 } },
      { ...alarm, id: "clock:actions", actions: [...alarm.actions!, { label: "More", command: "x" }] },
      { ...alarm, id: "clock:month", repeat: { every: "month", day: 32 } },
      { ...alarm, id: "clock:interval", repeat: { every: "day", interval: 0 } },
      { ...alarm, id: "clock:week", repeat: { every: "week", days: [7] } },
      { ...alarm, id: "clock:kind", kind: "nag" },
      { ...alarm, id: "clock:until", repeat: { every: "day", until: "soon" } },
      { ...alarm, id: "clock:silent", silent: "yes" },
    ];
    expect(parse_registry(text([...bad, alarm])).jobs).toEqual([alarm]);
  });

  it("keeps the first of two jobs with one id", () => {
    expect(parse_registry(text([alarm, { ...alarm, title: "Second" }])).jobs.map((job) => job.title)).toEqual(["Wake up"]);
  });

  it("ignores fields it doesn't know, like an old migrated marker", () => {
    expect(parse_registry(text([alarm], { migrated: { clock: true } }))).toEqual({ version: 1, jobs: [alarm] });
  });
});
