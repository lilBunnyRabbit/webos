import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games/time";
import { fly } from "./autopilot";
import { Status } from "./flight";
import { level_of, track } from "./levels";
import { DT, type Input } from "./plane";
import { PLANE_IDS, plane_coefficients, PlaneId } from "./planes";
import { create_round, step_round } from "./round";
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

test("the circuit needs the circuit: a hop and a stop on the runway doesn't finish it", () => {
  const c = plane_coefficients(PlaneId.TRAINER);
  const scene = level_of(PlaneId.TRAINER, 2).build();
  const braking: Input = { throttle: 0, stick: 0, trim: 0, flaps: 0, brake: 1, facing: 1, spoilers: 0, reverse: 0 };
  let state = create_round(scene, c, 0, 0);
  state = { ...state, flight: { ...state.flight, status: Status.FLYING, landings: 1, air_distance: 300 } };
  for (let t = 0; t < 3; t += DT) state = step_round(state, braking, c, DT);
  expect(state.flight.status).toBe(Status.FLYING);
  state = { ...state, flight: { ...state.flight, air_distance: scene.min_air } };
  for (let t = 0; t < 2; t += DT) state = step_round(state, braking, c, DT);
  expect(state.flight.status).toBe(Status.DONE);
});
