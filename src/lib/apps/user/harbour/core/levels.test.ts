import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games/time";
import { prove } from "./autopilot";
import { BOAT_IDS, boat_coefficients, SPECS } from "./boats";
import { LEVELS } from "./levels";
import { chart, daily_ref, RoundKind } from "./rounds";

describe.each(BOAT_IDS)("every level is proven for the %s", (id) => {
  const c = boat_coefficients(id);

  test.each(LEVELS.map((level) => [level.id, level] as const))("level %i: room, a path in, and the autopilot docks", (_, level) => {
    const proof = prove(level.build(SPECS[id]), c);
    expect(proof.reason).toBeUndefined();
    expect(proof.ok).toBe(true);
  });

  test("random seeds chart to a proven layout with a par", () => {
    for (const seed of [11, 12]) expect(chart({ kind: RoundKind.RANDOM, boat: id, seed }).par).toBeGreaterThan(0);
  });
});

test("the daily is the same for everyone and proven", () => {
  const day = "2026-11-06";
  const ref = daily_ref(day, daily_seed(day, "harbour"));
  expect(daily_ref(day, daily_seed(day, "harbour"))).toEqual(ref);
  expect(chart(ref).par).toBeGreaterThan(0);
});
