import { describe, expect, test } from "vitest";
import { collide, obstacles } from "../../core/obstacles";
import { body_ends, create_car, Gear, Vehicle, VEHICLES, type Placement } from "../../core/vehicle";
import { build_deck, lane_centre, spawn_pose, type Cargo, type Deck } from "./deck";
import {
  advance,
  balance,
  balanced,
  BALANCE_LIMIT,
  change_gear,
  create_game,
  Fault,
  judge,
  level_round,
  LEVEL_COUNT,
  MAX_GAP,
  MIN_GAP,
  record,
  set_status,
  stars,
  Status,
  undo,
  unlocked,
  type GameState,
} from "./game";

const DEG = Math.PI / 180;

// The vehicle in `lane`, heading for the bow, its nose `gap` short of `ahead`, `side` off the lane's middle.
function in_lane(deck: Deck, vehicle: Cargo, lane: number, ahead: number, gap: number, side = 0, turn = 0): Placement {
  const spec = VEHICLES[vehicle];
  const nose = ahead - gap;
  return { x: nose - body_ends(spec).front, y: lane_centre(deck, lane) + side, heading: turn };
}

function driving(state: GameState, car: Placement): GameState {
  return { ...set_status(state, Status.DRIVING), car: { ...state.car, ...car, speed: 0, gear: Gear.DRIVE }, last_drive: Gear.DRIVE };
}

describe("the deck", () => {
  test("the same seed builds the same ferry", () => {
    expect(build_deck(42, 0.5, 5)).toEqual(build_deck(42, 0.5, 5));
  });

  test("its packing is balanced, inside the deck and touches nothing", () => {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      const { deck } = create_game(level_round(level));
      expect(deck.queue.length).toBe(level_round(level).count);
      const placed = deck.plan.map((slot, i) => ({ vehicle: deck.queue[i], car: slot.pose }));
      expect(Math.abs(balance(deck, placed))).toBeLessThanOrEqual(BALANCE_LIMIT);
      for (const [i, slot] of deck.plan.entries()) {
        const spec = VEHICLES[deck.queue[i]];
        expect(collide(slot.pose, obstacles({ solids: deck.solids }), spec)).toBeNull();
        expect(slot.pose.x + body_ends(spec).rear).toBeGreaterThan(1);
      }
    }
  });

  test("every vehicle comes onto the quay clear of everything, lined up with the ramp", () => {
    const deck = build_deck(7, 1, 6);
    for (const vehicle of deck.queue) {
      const pose = spawn_pose(deck, vehicle);
      expect(collide(pose, obstacles({ solids: deck.solids }), VEHICLES[vehicle])).toBeNull();
      expect(pose.y).toBeCloseTo(deck.width / 2);
    }
  });

  test("tighter levels have narrower lanes", () => {
    const easy = create_game(level_round(1)).deck;
    const hard = create_game(level_round(LEVEL_COUNT)).deck;
    expect(hard.lane_width).toBeLessThan(easy.lane_width);
  });
});

describe("stowing", () => {
  const state = create_game(level_round(4));
  const { deck } = state;
  const first = deck.queue[0];
  const spec = VEHICLES[first];

  test("0.3 to 1 m short of the bow, centred and straight, stows", () => {
    for (const gap of [MIN_GAP + 0.01, 0.6, MAX_GAP - 0.01]) {
      expect(judge(deck, [], in_lane(deck, first, 0, deck.length, gap), spec).fault).toBeNull();
    }
    expect(judge(deck, [], in_lane(deck, first, 0, deck.length, MIN_GAP - 0.02), spec).fault).toBe(Fault.CLOSE);
    expect(judge(deck, [], in_lane(deck, first, 0, deck.length, MAX_GAP + 0.02), spec).fault).toBe(Fault.FAR);
  });

  test("off the lane's middle, crooked, across a line or off the deck it doesn't", () => {
    expect(judge(deck, [], in_lane(deck, first, 1, deck.length, 0.6, 0.3), spec).fault).toBe(Fault.OFF_CENTRE);
    expect(judge(deck, [], in_lane(deck, first, 1, deck.length, 0.6, 0, 6 * DEG), spec).fault).toBe(Fault.CROOKED);
    expect(judge(deck, [], in_lane(deck, first, 1, deck.length, 0.6, deck.lane_width / 2), spec).fault).toBe(Fault.ACROSS);
    expect(judge(deck, [], spawn_pose(deck, first), spec).fault).toBe(Fault.OFF_DECK);
  });

  test("P stows it, the next comes onto the quay, and the gap is measured to it", () => {
    const parked = change_gear(driving(state, in_lane(deck, first, 0, deck.length, 0.5)), Gear.PARK);
    expect(parked.stowed).toHaveLength(1);
    expect(parked.current).toBe(1);
    expect(parked.car).toMatchObject(spawn_pose(deck, deck.queue[1]));
    const behind = in_lane(deck, deck.queue[1], 0, deck.length - 0.5 - spec.length, 0.4);
    const verdict = judge(deck, parked.stowed, behind, VEHICLES[deck.queue[1]]);
    expect(verdict.fault).toBeNull();
    expect(verdict.gap).toBeCloseTo(0.4);
  });

  test("P before a drive or in the wrong place only parks", () => {
    const fresh = { ...set_status(state, Status.DRIVING), car: { ...state.car, ...in_lane(deck, first, 0, deck.length, 0.5) } };
    expect(change_gear(fresh, Gear.PARK).stowed).toHaveLength(0);
    expect(change_gear(driving(state, in_lane(deck, first, 0, deck.length, 2)), Gear.PARK).stowed).toHaveLength(0);
  });

  test("undo takes the last one back to the quay and keeps the clock", () => {
    const parked = { ...change_gear(driving(state, in_lane(deck, first, 0, deck.length, 0.5)), Gear.PARK), ms: 9000 };
    const back = undo(parked);
    expect(back.stowed).toHaveLength(0);
    expect(back.current).toBe(0);
    expect(back.car).toEqual(create_car(spawn_pose(deck, first), Gear.PARK, spec));
    expect(back.scene).toBe(state.scene);
    expect(back.ms).toBe(9000);
    expect(back.undos).toBe(1);
    expect(undo(back)).toBe(back);
  });

  test("touching anything ends the sailing", () => {
    const at = in_lane(deck, first, 0, deck.length, 0.02);
    const moving = { ...driving(state, at), car: { ...driving(state, at).car, speed: 1, throttle: 1 } };
    const next = advance(moving, { steer: 0, throttle: 1, brake: 0 }, 0.1);
    expect(next.status).toBe(Status.CRASHED);
    expect(next.hit?.what).toBe("the ship's side");
  });
});

describe("scoring", () => {
  const state = create_game(level_round(1));
  const { deck } = state;

  test("balance is the load's moment as a share of the most it could be", () => {
    expect(balance(deck, [])).toBe(0);
    const port = [{ vehicle: Vehicle.HATCH as Cargo, car: { x: 10, y: 0, heading: 0 } }];
    expect(balance(deck, port)).toBeCloseTo(-1);
    const level = [
      { vehicle: Vehicle.VAN as Cargo, car: { x: 10, y: lane_centre(deck, 0), heading: 0 } },
      { vehicle: Vehicle.VAN as Cargo, car: { x: 10, y: lane_centre(deck, deck.lanes - 1), heading: 0 } },
    ];
    expect(balanced(balance(deck, level))).toBe(true);
  });

  test("stars: all aboard, the balance, the par time", () => {
    const level = [{ vehicle: Vehicle.HATCH as Cargo, car: { x: 10, y: deck.width / 2, heading: 0 } }];
    const listing = [{ vehicle: Vehicle.HATCH as Cargo, car: { x: 10, y: lane_centre(deck, 0), heading: 0 } }];
    const done = (stowed: typeof level, ms: number) => ({ status: Status.DONE, deck, stowed: stowed.map((each) => ({ ...each, lane: 0, gap: 0.5, solids: [] })), ms });
    expect(stars(done(level, 50_000), 60_000)).toBe(3);
    expect(stars(done(level, 70_000), 60_000)).toBe(2);
    expect(stars(done(listing, 50_000), 60_000)).toBe(2);
    expect(stars(done(listing, 50_000), null)).toBe(1);
    expect(stars({ ...done(level, 1), status: Status.CRASHED }, 60_000)).toBe(0);
  });

  test("bests keep more stars, then the quicker; levels keep their most stars and open the next", () => {
    const round = level_round(3);
    let data = record({ bests: {}, levels: {} }, round, { stars: 2, ms: 40_000 }).data;
    const again = record(data, round, { stars: 1, ms: 20_000 });
    expect(again.improved).toBe(false);
    data = record(again.data, round, { stars: 2, ms: 30_000 }).data;
    expect(data.bests["level:3"]).toEqual({ stars: 2, ms: 30_000 });
    expect(data.levels[3]).toBe(2);
    expect(unlocked(data.levels)).toBe(4);
  });
});
