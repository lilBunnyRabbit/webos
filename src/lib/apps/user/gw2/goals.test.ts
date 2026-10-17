import { describe, expect, it } from "vitest";
import { character_slots, clamp_target, goal_progress, GoalsSchema, order_goals, owned_ids, tally, type Holding } from "./goals";

const ECTO = 19721;
const MITHRIL = 19700;

const holdings: Holding[] = [
  { label: "Bank", counts: tally([{ id: ECTO, count: 250 }, null, { id: ECTO, count: 30 }]) },
  { label: "Materials", counts: tally([{ id: MITHRIL, count: 1000 }, { id: ECTO, count: 0 }]) },
  {
    label: "Aria",
    counts: tally(character_slots({ name: "Aria", bags: [null, { inventory: [{ id: ECTO, count: 20 }, null] }] })),
  },
];

describe("tally", () => {
  it("sums stacks per item and skips empty slots", () => {
    expect([...holdings[0].counts]).toEqual([[ECTO, 280]]);
    expect(holdings[1].counts.has(ECTO)).toBe(false);
  });

  it("reads every bag of a character, empty bags included", () => {
    expect(character_slots({ name: "x" })).toEqual([]);
    expect(holdings[2].counts.get(ECTO)).toBe(20);
  });
});

describe("goal_progress", () => {
  it("adds up every place and lists only those holding some", () => {
    const progress = goal_progress(holdings, { item_id: ECTO, target: 250 });
    expect(progress.owned).toBe(300);
    expect(progress.done).toBe(true);
    expect(progress.fraction).toBe(1);
    expect(progress.sources).toEqual([
      { label: "Bank", count: 280 },
      { label: "Aria", count: 20 },
    ]);
  });

  it("reports nothing owned", () => {
    expect(goal_progress(holdings, { item_id: 1, target: 10 })).toEqual({ owned: 0, fraction: 0, done: false, sources: [] });
  });
});

it("collects every owned item id", () => {
  expect(owned_ids(holdings)).toEqual(new Set([ECTO, MITHRIL]));
});

it("clamps targets to whole positive numbers", () => {
  expect(clamp_target(0)).toBe(1);
  expect(clamp_target(12.6)).toBe(13);
  expect(clamp_target(Number.NaN)).toBe(1);
  expect(clamp_target(1e9)).toBe(1_000_000);
});

it("puts unfinished goals first, closest to done on top", () => {
  const entry = (name: string, fraction: number) => ({ name, progress: { owned: 0, fraction, done: fraction >= 1, sources: [] } });
  const order = order_goals([entry("done", 1), entry("low", 0.1), entry("high", 0.9)]).map((goal) => goal.name);
  expect(order).toEqual(["high", "low", "done"]);
});

it("rejects stored goals of the wrong shape", () => {
  expect(GoalsSchema.safeParse([{ id: "a", item_id: ECTO, name: "Ecto", icon: "", target: 0 }]).success).toBe(false);
  expect(GoalsSchema.safeParse([{ id: "a", item_id: ECTO, name: "Ecto", icon: "", target: 5 }]).success).toBe(true);
});
