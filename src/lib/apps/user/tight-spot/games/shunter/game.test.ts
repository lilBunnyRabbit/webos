import { describe, expect, test } from "vitest";
import { overlaps } from "$kit/games/play2d/collision";
import { coupler, create_car, Gear, SHUNTER, YARD_LINKS, type Car } from "../../core/vehicle";
import { build_yard, UnitKind } from "./freight";
import { advance, can_drop, contact, create_game, drop_unit, par_moves, set_status, standing_shapes, stars, Status, type GameState } from "./game";
import { job_round, level_round, LEVEL_COUNT, unlocked } from "./levels";

const DT = 1 / 120;

/** The shunter facing away from the task's trailer, its coupler `gap` short of the kingpin, backing. */
function lined_up(state: GameState, gap: number, side = 0): GameState {
  const stand = state.stands[state.yard.tasks[state.current].unit]!;
  const heading = stand.trailers[0].heading;
  const link = stand.links[0];
  const across = { x: -Math.sin(heading) * side, y: Math.cos(heading) * side };
  const x = stand.hinge.x + across.x + Math.cos(heading) * (gap + link.hitch);
  const y = stand.hinge.y + across.y + Math.sin(heading) * (gap + link.hitch);
  return set_status({ ...state, car: create_car({ x, y, heading }, Gear.REVERSE, SHUNTER) }, Status.DRIVING);
}

function back(state: GameState, seconds: number): GameState {
  let next = state;
  for (let i = 0; i < seconds / DT; i++) next = advance(next, { steer: 0, throttle: 0.3, brake: 0 }, DT);
  return next;
}

describe("the yard", () => {
  test("is the same from the same seed, every task's chain in its own slot and every target free", () => {
    const order = { semis: 3, dollies: 1, doubles: 1 };
    const a = build_yard(77, 0.6, order);
    expect(build_yard(77, 0.6, order)).toEqual(a);
    expect(a.tasks.map((task) => a.units[task.unit].kind)).toEqual([UnitKind.SEMI, UnitKind.SEMI, UnitKind.SEMI, expect.any(String), expect.any(String)]);
    for (const task of a.tasks) {
      const boxes = standing_shapes(a.units[task.unit].stand).boxes;
      expect(boxes.flat().every((p) => p.x > 0 && p.x < a.width && p.y > 0 && p.y < a.height)).toBe(true);
      for (const unit of a.units) expect(standing_shapes(unit.stand).boxes.some((box) => overlaps(box, task.to.shape))).toBe(false);
    }
  });

  test("every level starts clear and the ladder opens in order", () => {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      const state = create_game(level_round(level));
      expect(contact(state.yard, state.stands, state.car, state.spec), `level ${level}`).toBeNull();
    }
    expect(unlocked({})).toBe(1);
    expect(unlocked({ 1: 2, 2: 1 })).toBe(3);
  });
});

describe("coupling and dropping", () => {
  const start = create_game(level_round(1));

  test("backing square under the kingpin latches it", () => {
    const coupled = back(lined_up(start, 0.6), 2);
    expect(coupled.coupled).toBe(start.yard.tasks[0].unit);
    expect(coupled.spec.hitches).toEqual([YARD_LINKS.semi]);
    expect(coupled.bumps).toBe(0);
  });

  test("off to the side it slides on under the front and stops at the landing legs", () => {
    const missed = back(lined_up(start, 0.6, 0.4), 4);
    expect(missed.coupled).toBeNull();
    expect(missed.bumps).toBe(1);
    const stand = missed.stands[missed.yard.tasks[0].unit]!;
    const reached = coupler(missed.car, missed.spec, stand.links[0]);
    expect(Math.hypot(reached.x - stand.hinge.x, reached.y - stand.hinge.y)).toBeGreaterThan(0.5);
  });

  test("the drop is live only inside the target, and the last one ends the job", () => {
    const coupled = back(lined_up(start, 0.6), 2);
    expect(can_drop({ ...coupled, car: { ...coupled.car, speed: 0 } as Car })).toBe(false);
    expect(drop_unit(coupled)).toBe(coupled);
  });
});

describe("scoring", () => {
  test("par moves count four drives a backed trailer and two a pulled one, plus one each to line up", () => {
    expect(par_moves({ order: { semis: 1, dollies: 0, doubles: 0 } })).toBe(4);
    expect(par_moves({ order: { semis: 2, dollies: 1, doubles: 1 } })).toBe(15);
  });

  test("a star for the job, one for the moves, one for the par time", () => {
    const round = job_round(1, 5);
    const done = { status: Status.DONE, round, moves: 4, ms: 50_000 };
    expect(stars(done, 60_000)).toBe(3);
    expect(stars({ ...done, moves: 9 }, 60_000)).toBe(2);
    expect(stars({ ...done, ms: 70_000 }, null)).toBe(2);
    expect(stars({ ...done, status: Status.DRIVING }, 60_000)).toBe(0);
  });
});
