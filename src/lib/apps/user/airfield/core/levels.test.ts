import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games/time";
import { fly } from "./autopilot";
import { track } from "./levels";
import { PLANE_IDS, plane_coefficients } from "./planes";
import { chart, daily_ref, RoundKind } from "./rounds";

describe.each(PLANE_IDS)("the %s track is proven", (id) => {
  const c = plane_coefficients(id);

  test.each(track(id).map((level) => [level.n, level] as const))("level %i: the autopilot flies it to the end", (_, level) => {
    const proof = fly(level.build(), c);
    expect(proof.reason).toBeUndefined();
    expect(proof.ok).toBe(true);
  });

  test("a random seed charts to a proven landing with a par", () => {
    expect(chart({ kind: RoundKind.RANDOM, plane: id, seed: 11 }).par).toBeGreaterThan(0);
  });
});

test("the daily is the same for everyone and proven", () => {
  const day = "2026-11-07";
  const ref = daily_ref(day, daily_seed(day, "airfield"));
  expect(daily_ref(day, daily_seed(day, "airfield"))).toEqual(ref);
  expect(chart(ref).par).toBeGreaterThan(0);
});
