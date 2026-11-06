import { describe, expect, test } from "vitest";
import { create_boat, hull } from "./boat";
import { boat_coefficients, BoatId, SPECS } from "./boats";
import { grade, Grade } from "./contact";
import { LEVELS } from "./levels";
import { better } from "./progress";
import { advance, create_game, docked_now, result, Status, type GameState } from "./round";

const DT = 1 / 120;
const c = boat_coefficients(BoatId.YACHT);

function sit(state: GameState, seconds: number): GameState {
  for (let t = 0; t < seconds; t += DT) state = advance(state, { lever: 0, wheel: 0 }, c, DT);
  return state;
}

describe("docked rule", () => {
  const scene = LEVELS[1].build(SPECS[BoatId.YACHT]);
  const [a, b] = scene.berth!.bay.shape;
  const head = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const pose = (heading: number) => ({ x: head.x, y: head.y + SPECS[BoatId.YACHT].length / 2 + 0.2, heading });

  test("stopped in the box and square for a second: the lines go on", () => {
    const state = sit({ ...create_game(scene), status: Status.SAILING, boat: create_boat(pose(-Math.PI / 2)) }, 3);
    expect(state.status).toBe(Status.DONE);
    expect(state.precision).toBeGreaterThan(80);
  });

  test("not when turned more than 8° or still moving", () => {
    const turned = create_boat(pose(-Math.PI / 2 + 0.15));
    expect(docked_now(turned, hull(turned, c.spec), scene.berth!)).toBeNull();
    const moving = { ...create_boat(pose(-Math.PI / 2)), vy: -0.12 };
    expect(docked_now(moving, hull(moving, c.spec), scene.berth!)).toBeNull();
  });
});

test("touches are graded by approach speed, half the limits without fenders", () => {
  expect(grade(0.1, true)).toBe(Grade.KISS);
  expect(grade(0.3, true)).toBe(Grade.BUMP);
  expect(grade(0.6, true)).toBe(Grade.HARD);
  expect(grade(0.1, false)).toBe(Grade.BUMP);
  expect(grade(0.3, false)).toBe(Grade.HARD);
});

test("stars and bests", () => {
  const state = { ...create_game(LEVELS[0].build(SPECS[BoatId.RIB])), time: 30, precision: 96 };
  expect(result(state, 40_000)).toMatchObject({ stars: 3, perfect: true });
  expect(result({ ...state, touches: [{ solid: 0, speed: 0.3, grade: Grade.BUMP, at: { x: 0, y: 0 }, fendered: true }] }, 20_000).stars).toBe(1);
  const first = better(undefined, { stars: 2, ms: 50_000, perfect: true }).best;
  expect(better(first, { stars: 2, ms: 60_000, perfect: false })).toMatchObject({ improved: false, best: { ms: 50_000 } });
  expect(better(first, { stars: 3, ms: 70_000, perfect: false })).toMatchObject({ improved: true, best: { stars: 3, perfect: true } });
});
