import { describe, expect, test } from "vitest";
import { centroid, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { overlaps } from "$kit/games/play2d/collision";
import { collide, obstacles } from "../../core/obstacles";
import type { Bay } from "../../core/scene";
import { bodies, create_car, Gear, pose_from_centre, Vehicle, VEHICLES, type Input } from "../../core/vehicle";
import {
  advance,
  bays_for,
  can_leave,
  better,
  can_fetch,
  change_gear,
  create_game,
  data_schema,
  DENT_COST,
  EMPTY_DATA,
  ENDLESS,
  fetch,
  JobKind,
  leave,
  parked_in,
  QUEUE_LIMIT,
  record,
  schedule,
  shift_stars,
  start,
  Status,
  take,
  tick,
  tip_for,
  waiting,
  walk_ms,
  type Customer,
  type GameState,
  type Shift,
} from "./game";
import { has_floors, LEVELS, level_shift, type ShiftLevel } from "./levels";
import { arrival_pose, build_street, overview, overview_focus, queue_poses } from "./street";

const CUSTOMERS: readonly Customer[] = [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.PICKUP, Vehicle.VAN, Vehicle.BUS];
const GAS: Input = { steer: 0, throttle: 1, brake: 0 };

function centred(bay: Bay, vehicle: Customer): Pose {
  return pose_from_centre({ ...centroid(bay.shape), heading: bay.heading }, VEHICLES[vehicle]);
}

function put(state: GameState, pose: Pose): GameState {
  const vehicle = state.job!.ticket.vehicle;
  return { ...state, car: create_car(pose, Gear.DRIVE, VEHICLES[vehicle]), last_drive: Gear.DRIVE };
}

function free_bays(state: GameState, vehicle: Customer): Bay[] {
  const taken = new Set(state.tickets.map((ticket) => ticket.bay));
  return bays_for(state.street, vehicle).filter((bay) => !taken.has(bay) && parked_in(centred(bay, vehicle), bay, VEHICLES[vehicle]));
}

describe("street", () => {
  test("every customer car pulls up clear of the street, and fits a bay and the box by the stand", () => {
    for (const seed of [1, 2, 3]) {
      const street = build_street(seed);
      const near = obstacles(street.world);
      for (const vehicle of CUSTOMERS) {
        const spec = VEHICLES[vehicle];
        expect(collide(arrival_pose(vehicle), near, spec), `${seed} ${vehicle}`).toBeNull();
        expect(parked_in(centred(street.returns, vehicle), street.returns, spec)).toBe(true);
        const bays = bays_for(street, vehicle).filter((bay) => parked_in(centred(bay, vehicle), bay, spec) && !collide(centred(bay, vehicle), near, spec));
        expect(bays.length, `${seed} ${vehicle}`).toBeGreaterThan(vehicle === Vehicle.BUS ? 0 : 12);
      }
    }
  });
});

describe("schedule", () => {
  test("is pure, starts with a car waiting and comes faster later", () => {
    expect(schedule(5)).toEqual(schedule(5));
    expect(schedule(5)).not.toEqual(schedule(6));
    const list = schedule(5);
    expect(list[0].at).toBe(0);
    const gap = (from: number) => (list[from + 10].at - list[from].at) / 10;
    expect(gap(30)).toBeLessThan(gap(0));
  });

  test("now and then the bus, never two close together", () => {
    const buses = schedule(11, { ...ENDLESS, arrivals: 200 }).flatMap((arrival, i) => (arrival.vehicle === Vehicle.BUS ? [i] : []));
    expect(buses.length).toBeGreaterThan(2);
    buses.slice(1).forEach((at, i) => expect(at - buses[i]).toBeGreaterThanOrEqual(8));
  });
});

describe("a shift", () => {
  test("take, park, fetch and hand back pays a tip", () => {
    let state = start(create_game({ seed: 3 }));
    expect(state.queue).toHaveLength(1);
    state = take(state);
    expect(state.status).toBe(Status.DRIVING);
    const vehicle = state.job!.ticket.vehicle;
    expect(change_gear(state, Gear.PARK)).toBe(state);
    const bay = free_bays(state, vehicle)[0];
    const parked = change_gear(put(state, centred(bay, vehicle)), Gear.PARK);
    expect(parked.status).toBe(Status.STAND);
    const ticket = parked.tickets[0];
    expect(ticket.precision).toBeGreaterThan(90);
    expect(parked.ms).toBeGreaterThan(state.ms);

    const back = tick(parked, ticket.back);
    expect(can_fetch(back)).toBe(true);
    const driving = fetch(back);
    expect(driving.job?.kind).toBe(JobKind.RETURN);
    expect(driving.ms).toBeGreaterThan(back.ms);
    const home = change_gear(put(driving, centred(driving.street.returns, vehicle)), Gear.PARK);
    expect(home.status).toBe(Status.STAND);
    expect(home.handed).toBe(1);
    expect(home.score).toBe(tip_for({ ...ticket, dented: false }, driving.ms));
    expect(home.tickets).toHaveLength(0);
  });

  test("a contact is one dent: the car stops, the tip is gone, the shift goes on", () => {
    let state = take(start(create_game({ seed: 3 })));
    state = change_gear(state, Gear.DRIVE);
    const pose = state.car;
    let dents = 0;
    for (let i = 0; i < 120 * 40 && state.status === Status.DRIVING; i++) {
      state = advance(state, GAS, 1 / 120);
      dents = state.dents;
      if (state.touched) break;
    }
    expect(dents).toBe(1);
    const stuck = state.car;
    for (let i = 0; i < 60; i++) state = advance(state, GAS, 1 / 120);
    expect(state.dents).toBe(1);
    expect(state.score).toBe(-DENT_COST);
    expect(state.status).toBe(Status.DRIVING);
    expect(state.job!.ticket.dented).toBe(true);
    expect(Math.abs(state.car.y - stuck.y)).toBeLessThan(0.1);
    expect(state.car.y).toBeLessThan(pose.y);
    expect(tip_for(state.job!.ticket, 0)).toBe(0);
  });

  test("a waiting car under the car in hand is left out, and back once it's clear", () => {
    let state = take(start(create_game({ seed: 3 })));
    const mine = state.job!.ticket.vehicle;
    const next = state.schedule[1].vehicle;
    state = { ...put(state, queue_poses([next], mine)[0]!), held: true };
    const before = state.scene.solids.length;
    state = tick(state, state.schedule[1].at);
    expect(state.queue).toEqual([1]);
    expect(state.out).toEqual([1]);
    expect(state.scene.solids).toHaveLength(before);
    state = advance(put(state, arrival_pose(mine)), { steer: 0, throttle: 0, brake: 1 }, 1 / 120);
    expect(state.held).toBe(true);
    expect(state.out).toEqual([]);
    expect(state.scene.solids.length).toBeGreaterThan(before);
  });

  test("a car arriving while the valet stands in the way to the box waits off the street, then pulls up behind", () => {
    let state = take(start(create_game({ seed: 3 })));
    const mine = state.job!.ticket.vehicle;
    const spec = VEHICLES[mine];
    // Crossing the queue's lane a few metres behind the stand, on the way across to the box.
    state = put(state, { x: 18, y: queue_poses([mine], null)[0]!.y + 9, heading: Math.PI });
    const before = state.scene.solids.length;
    for (const at of [state.schedule[1].at, state.schedule[2].at]) {
      state = tick(state, at);
      state = advance(state, { steer: 0, throttle: 0, brake: 1 }, 1 / 120);
      expect(state.dents).toBe(0);
      expect(state.scene.solids).toHaveLength(before);
      const queued = state.scene.solids.slice(state.street.world.solids.length);
      expect(queued.some((solid) => bodies(state.car, spec).some((body) => overlaps(body, solid.shape)))).toBe(false);
    }
    expect(state.out).toEqual([1, 2]);
    state = advance(put(state, centred(state.street.returns, mine)), { steer: 0, throttle: 0, brake: 1 }, 1 / 120);
    expect(state.out).toEqual([]);
    expect(state.scene.solids.length).toBeGreaterThan(before);
  });

  test("a waiting car stays where it pulled up, however close the valet drives", () => {
    let state = take(start(create_game({ seed: 3 })));
    const mine = state.job!.ticket.vehicle;
    state = advance(put(state, centred(state.street.returns, mine)), { steer: 0, throttle: 0, brake: 1 }, 1 / 120);
    state = put(state, { x: 18, y: 10, heading: -Math.PI / 2 });
    state = tick(state, state.schedule[1].at);
    state = advance(state, { steer: 0, throttle: 0, brake: 1 }, 1 / 120);
    const standing = state.lined;
    expect(standing).toHaveLength(1);
    state = advance(put(state, { ...standing[0].pose, x: standing[0].pose.x - 3.6 }), { steer: 0, throttle: 0, brake: 1 }, 1 / 120);
    expect(state.lined).toEqual(standing);
    expect(state.out).toEqual([]);
  });

  test("cars standing in the queue stay on the street when the valet pulls sideways out of the lane", () => {
    const BRAKE: Input = { steer: 0, throttle: 0, brake: 1 };
    let state = take(start(create_game({ seed: 3 })));
    const mine = state.job!.ticket.vehicle;
    const spec = VEHICLES[mine];
    state = tick(advance(state, BRAKE, 1 / 120), state.schedule[2].at);
    state = advance(state, BRAKE, 1 / 120);
    expect(state.lined.map((each) => each.index)).toEqual([1, 2]);
    const solids = state.scene.solids.length;
    state = advance(put(state, { ...arrival_pose(mine), x: 14.6 }), BRAKE, 1 / 120);
    expect(state.held).toBe(false);
    expect(state.out).toEqual([]);
    expect(state.lined.map((each) => each.index)).toEqual([1, 2]);
    expect(state.scene.solids).toHaveLength(solids);
    const queued = state.scene.solids.slice(state.street.world.solids.length);
    expect(queued.some((solid) => bodies(state.car, spec).some((body) => overlaps(body, solid.shape)))).toBe(false);
    expect(state.dents).toBe(0);
  });

  test("a fetched car left in a bay is parked again, its owner still waiting, and the valet takes the next car", () => {
    let state = start(create_game({ seed: 3 }));
    state = take(state);
    const vehicle = state.job!.ticket.vehicle;
    const [first, second] = free_bays(state, vehicle);
    state = change_gear(put(state, centred(first, vehicle)), Gear.PARK);
    const ticket = state.tickets[0];
    state = fetch(tick(state, ticket.back));
    expect(state.job?.kind).toBe(JobKind.RETURN);
    expect(can_leave(state)).toBe(false);
    state = change_gear(put(state, centred(second, vehicle)), Gear.PARK);
    expect(state.status).toBe(Status.DRIVING);
    expect(can_leave(state)).toBe(true);
    const served = state.served;
    const left = leave(state);
    expect(left.status).toBe(Status.STAND);
    expect(left.served).toBe(served);
    expect(left.handed).toBe(0);
    expect(left.tickets[0].bay).toBe(second);
    expect(left.tickets[0].back).toBe(ticket.back);
    expect(waiting(left).map((each) => each.id)).toEqual([ticket.id]);
    expect(left.ms).toBeGreaterThan(state.ms);

    expect(left.queue.length).toBeGreaterThan(0);
    const next = take(left);
    expect(next.job?.kind).toBe(JobKind.PARK);
    expect(next.job?.ticket.id).toBe(left.queue[0]);
    expect(collide(next.car, obstacles(next.scene), VEHICLES[next.job!.ticket.vehicle])).toBeNull();

    const again = fetch(left);
    expect(again.job?.kind).toBe(JobKind.RETURN);
    expect(again.job?.ticket.id).toBe(ticket.id);
    expect(again.car.x).toBeCloseTo(left.tickets[0].parked!.x);
  });

  test("a dent starts the clean run again", () => {
    let state = change_gear(take(start(create_game({ seed: 3 }))), Gear.DRIVE);
    state = { ...state, clean: 5 };
    for (let i = 0; i < 120 * 40 && !state.touched; i++) state = advance(state, GAS, 1 / 120);
    expect(state.dents).toBe(1);
    expect(state.clean).toBe(0);
  });

  test("an equal score ranks the shorter shift first, like Game Hub", () => {
    const run = { score: 40, ms: 300_000, handed: 4, dents: 0 };
    expect(better(run, { ...run, ms: 200_000 })).toBe(true);
    expect(better(run, { ...run, ms: 400_000 })).toBe(false);
    expect(better(run, { ...run, score: 41, ms: 400_000 })).toBe(true);
  });

  test("a quick return tips more, a precise park adds to it, the bus doubles it", () => {
    const ticket = { vehicle: Vehicle.HATCH, back: 0, precision: 100, dented: false } as const;
    expect(tip_for(ticket, 0)).toBe(25);
    expect(tip_for(ticket, 30_000)).toBe(20);
    expect(tip_for(ticket, 120_000)).toBe(15);
    expect(tip_for({ ...ticket, precision: 0 }, 120_000)).toBe(10);
    expect(tip_for({ ...ticket, vehicle: Vehicle.BUS }, 0)).toBe(50);
  });

  test("the fourth car waiting ends the shift", () => {
    const state = start(create_game({ seed: 8 }));
    const over = tick(state, state.schedule[QUEUE_LIMIT - 1].at);
    expect(over.status).toBe(Status.OVER);
    expect(over.queue).toHaveLength(QUEUE_LIMIT);
    expect(tick(state, state.schedule[QUEUE_LIMIT - 1].at - 1).status).toBe(Status.STAND);
  });
});

// A valet at par: 3 m/s along the roads plus 10 s to get into a bay, the nearest free bay every time, the queue
// first once two wait. It should hold the stand for five minutes.
const PAR_SPEED = 3;
const MANOEUVRE = 10_000;

function drive_ms(a: Vec, b: Vec): number {
  return ((Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / PAR_SPEED) * 1000 + MANOEUVRE;
}

function par_shift(shift: Shift, until = Infinity): { state: GameState; most: number } {
  let state = start(create_game(shift));
  let most = 0;
  while (state.status !== Status.OVER && state.ms < until) {
    most = Math.max(most, state.queue.length);
    const owners = waiting(state);
    if (owners.length && (state.queue.length < 2 || !state.queue.length)) {
      state = fetch(state);
      if (state.status !== Status.STAND && state.status !== Status.DRIVING) break;
      if (state.status !== Status.DRIVING) continue;
      const vehicle = state.job!.ticket.vehicle;
      const from = { x: state.car.x, y: state.car.y };
      state = tick(state, state.ms + drive_ms(from, centroid(state.street.returns.shape)));
      if (state.status === Status.OVER) break;
      state = change_gear(put(state, centred(state.street.returns, vehicle)), Gear.PARK);
    } else if (state.queue.length) {
      state = take(state);
      const vehicle = state.job!.ticket.vehicle;
      const from = { x: state.car.x, y: state.car.y };
      const bay = free_bays(state, vehicle).sort((a, b) => drive_ms(from, centroid(a.shape)) - drive_ms(from, centroid(b.shape)))[0];
      expect(bay, `seed ${shift.seed}: a free bay for the ${vehicle}`).toBeDefined();
      state = tick(state, state.ms + drive_ms(from, centroid(bay.shape)));
      if (state.status === Status.OVER) break;
      state = change_gear(put(state, centred(bay, vehicle)), Gear.PARK);
    } else state = tick(state, state.ms + 1000);
  }
  return { state, most };
}

describe("par valet", () => {
  test.each([1, 2, 3])("keeps the queue under the limit for five minutes on seed %i", (seed) => {
    const { state, most } = par_shift({ seed }, 300_000);
    expect(state.status, `seed ${seed}: ended at ${Math.round(state.ms / 1000)} s`).not.toBe(Status.OVER);
    expect(most).toBeLessThan(QUEUE_LIMIT);
    expect(state.handed).toBeGreaterThan(0);
  });

  test.each(LEVELS.map((level, i) => [i + 1, level.name] as const))("holds level %i (%s) to three stars, and on two other streets to the target", (level) => {
    const goals = LEVELS[level - 1];
    const { state } = par_shift(level_shift(level));
    expect(state.finished, `level ${level}: ended at ${Math.round(state.ms / 1000)} s with ${state.handed} handed back`).toBe(true);
    expect(shift_stars(state, goals), `level ${level}: ${state.score} pts`).toBe(3);
    for (const seed of [5, 6]) {
      const other = par_shift({ ...level_shift(level), seed }).state;
      expect(shift_stars(other, goals), `level ${level} seed ${seed}: ${other.score} pts, finished ${other.finished}`).toBeGreaterThan(0);
    }
  });
});

describe("levels", () => {
  test("bring in the bus, the garage floors and a rush hour as they go, and grow", () => {
    const first = (has: (level: ShiftLevel) => boolean) => LEVELS.findIndex(has) + 1;
    expect(LEVELS[0].rules.bus).toBeNull();
    expect(LEVELS[0].garage).toBe(false);
    expect(first((level) => level.rules.bus !== null)).toBeGreaterThan(1);
    expect(first((level) => level.garage)).toBeGreaterThan(first((level) => level.rules.bus !== null));
    expect(first((level) => level.rules.rush !== undefined)).toBeGreaterThan(first((level) => level.garage));
    expect(LEVELS.at(-1)!.rules.arrivals).toBeGreaterThan(LEVELS[0].rules.arrivals * 3);
    LEVELS.forEach((level) => expect(level.high).toBeGreaterThan(level.target));
  });

  test("each level's street has garage floors exactly when the level brings them in, and its schedule the buses it names", () => {
    LEVELS.forEach((level, i) => {
      const shift = level_shift(i + 1);
      expect(has_floors(shift.seed), level.name).toBe(level.garage);
      const buses = schedule(shift.seed, level.rules).flatMap((arrival, at) => (arrival.vehicle === Vehicle.BUS ? [at] : []));
      expect(buses, level.name).toEqual(level.rules.bus && "at" in level.rules.bus ? [...level.rules.bus.at] : []);
    });
  });

  test("a rush brings its cars closer together", () => {
    const rules = LEVELS.find((level) => level.rules.rush)!.rules;
    const list = schedule(9, rules);
    const gaps = list.slice(1).map((arrival, i) => arrival.at - list[i].at);
    const { from, count, gap } = rules.rush!;
    for (let i = from; i < from + count; i++) expect(gaps[i - 1]).toBeLessThanOrEqual(gap * 1.3);
  });

  test("the endless shift keeps its arrivals: the same seed gives the same cars as before levels", () => {
    expect(schedule(5, ENDLESS)).toEqual(schedule(5));
    expect(ENDLESS.arrivals).toBe(300);
  });

  test("a level ends when the last car is handed back; stars for the target, the higher one and no dents", () => {
    const goals = { target: 50, high: 80 };
    const done = { finished: true, dents: 0 };
    expect(shift_stars({ ...done, score: 49 }, goals)).toBe(0);
    expect(shift_stars({ ...done, score: 50, dents: 1 }, goals)).toBe(1);
    expect(shift_stars({ ...done, score: 50 }, goals)).toBe(2);
    expect(shift_stars({ ...done, score: 80, dents: 2 }, goals)).toBe(2);
    expect(shift_stars({ ...done, score: 80 }, goals)).toBe(3);
    expect(shift_stars({ finished: false, score: 200, dents: 0 }, goals)).toBe(0);
  });

  test("a level's best keeps more stars first, and its stars open the next", () => {
    const shift = level_shift(1);
    const one = record(EMPTY_DATA, shift, { score: 90, ms: 1000, handed: 4, dents: 1, stars: 2 });
    expect(one.data.levels).toEqual({ 1: 2 });
    const two = record(one.data, shift, { score: 60, ms: 1000, handed: 4, dents: 0, stars: 3 });
    expect(two.improved).toBe(true);
    expect(two.data.best["level:1"].stars).toBe(3);
    expect(record(two.data, { seed: 1 }, { score: 10, ms: 1, handed: 1, dents: 0 }).data.levels).toEqual({ 1: 3 });
    expect(data_schema.parse({ best: {} })).toEqual(EMPTY_DATA);
  });
});

describe("overview", () => {
  // Seed 6 lays a garage floor west of the street and one east of it.
  const world = build_street(6).world;
  const STREET = { x0: -32, y0: -32, x1: 64, y1: 64 };

  test("fits the street, and a floor only when a customer car is parked on it", () => {
    expect(overview(world, [])).toEqual({ street: STREET, wanted: STREET });
    expect(overview(world, [{ x: 80, y: -16 }]).wanted).toEqual({ ...STREET, x1: 96 });
  });

  test("leans toward a wanted floor only as far as keeps the street whole", () => {
    const view = overview(world, [{ x: 80, y: -16 }]);
    expect(overview_focus(view, 48, 48)).toEqual({ x: 16, y: 16 });
    expect(overview_focus(view, 60, 48).x).toBe(28);
    expect(overview_focus(view, 100, 48).x).toBe(32);
  });
});
