import { z } from "zod";
import { inside_convex } from "../../core/collision";
import type { Vec } from "../../core/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { fit, MAX_ANGLE } from "../../core/precision";
import { Signal } from "../../core/signal";
import { angle_between } from "../../core/geometry";
import { bodies, body_centre, create_car, Gear, HATCHBACK, headings, shift, step, type Car, type Input, type VehicleSpec } from "../../core/vehicle";
import { limit_at, locate, route_of, type Located, type Route, type RouteId } from "./route";
import { FaultKind, FRESH_WATCH, judge, passes, Severity, signalled, tally, type Fault, type Tally, type Watch } from "./rules";
import { HALF, LANE, town, type Town } from "./town";

// The stock hatchback tops out at 30 km/h, under every limit in town.
export const SPEC: VehicleSpec = { ...HATCHBACK, max_forward: 20 };

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Outcome = { PASS: "pass", FAIL: "fail", STOPPED: "stopped" } as const;
export type Outcome = (typeof Outcome)[keyof typeof Outcome];

const OFF_ROUTE = 6.5;
const OFF_GRACE = 600;
const LEAD_TIME = 6;
const LEAD_MIN = 35;
const KERB_GAP = 0.6;
const PARK_MINOR = 50;
const PULL_UP_SIGNAL = 12000;

export interface Spoken {
  text: string;
  ms: number;
}

export interface Park {
  score: number;
}

export interface End {
  outcome: Outcome;
  reason: string;
}

export interface GameState {
  route_id: RouteId;
  route: Route;
  car: Car;
  status: Status;
  ms: number;
  at: Located;
  watch: Watch;
  faults: Fault[];
  signal: Signal;
  next_prompt: number;
  spoken: Spoken | null;
  park: Park | null;
  off_since: number | null;
  contact: { at: Vec; ms: number } | null;
  end: End | null;
}

export function create_game(route_id: RouteId): GameState {
  const route = route_of(town(), route_id, SPEC);
  const car = create_car(route.start, Gear.PARK, SPEC);
  return {
    route_id,
    route,
    car,
    status: Status.READY,
    ms: 0,
    at: locate(route, route.start, 0),
    watch: FRESH_WATCH,
    faults: [],
    signal: Signal.NONE,
    next_prompt: 0,
    spoken: null,
    park: null,
    off_since: null,
    contact: null,
    end: null,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  if (state.status === status) return state;
  const next = { ...state, status };
  return status === Status.DRIVING ? speak(next) : next;
}

export function in_lot(state: Pick<GameState, "route" | "at">): boolean {
  return state.at.s >= state.route.lot.from - 1 && state.at.s <= state.route.lot.to + 1;
}

/** Asked to pull up: from then on the car may leave its lane for the kerb, and P ends the test. */
export function pulling_up(state: Pick<GameState, "route" | "next_prompt">): boolean {
  return state.next_prompt >= state.route.prompts.length;
}

export function counts(state: Pick<GameState, "faults">): Tally {
  return tally(state.faults);
}

function finish(state: GameState, faults: Fault[], stopped?: string): GameState {
  const all = [...state.faults, ...faults];
  const outcome = stopped ? Outcome.STOPPED : passes(tally(all)) ? Outcome.PASS : Outcome.FAIL;
  const reason = stopped ?? (outcome === Outcome.PASS ? "You passed." : "Too many faults to pass.");
  return { ...state, faults: all, status: Status.DONE, end: { outcome, reason } };
}

function speak(state: GameState): GameState {
  const prompt = state.route.prompts[state.next_prompt];
  if (!prompt || (prompt.after_park && !state.park)) return state;
  const lead = Math.max(LEAD_MIN, Math.abs(state.car.speed) * LEAD_TIME);
  if (prompt.s > 0 && state.at.s < prompt.s - lead) return state;
  if (prompt.after !== undefined && state.at.s < prompt.after) return state;
  return { ...state, next_prompt: state.next_prompt + 1, spoken: { text: prompt.text, ms: state.ms } };
}

function lot_range(route: Route): [number, number] {
  const from = route.ss.findIndex((s) => s >= route.lot.from);
  const to = route.ss.findIndex((s) => s >= route.lot.to);
  return [Math.max(0, from - 20), to < 0 ? route.points.length - 1 : to + 20];
}

function relocate(state: GameState, car: Car): Located {
  const centre = { x: car.x, y: car.y };
  if (!in_lot(state)) return locate(state.route, centre, state.at.index);
  const [from, to] = lot_range(state.route);
  let best = locate(state.route, centre, from);
  for (let i = from; i <= to; i += 100) {
    const found = locate(state.route, centre, i);
    if (Math.abs(found.lateral) < Math.abs(best.lateral) - 1e-9) best = found;
  }
  return best;
}

function wrong_way_in(town: Town, car: Car): boolean {
  const road = town.roads.BE;
  const d = { x: car.x - road.a.x, y: car.y - road.a.y };
  const along = d.x * road.u.x + d.y * road.u.y;
  const across = Math.abs(-d.x * road.u.y + d.y * road.u.x);
  return along >= -2 && along <= road.length + 2 && across <= HALF && angle_between(car.heading, Math.atan2(-road.u.y, -road.u.x)) < Math.PI / 3;
}

export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = SPEC): GameState {
  if (state.status !== Status.DRIVING) return state;
  const t = town();
  const signal = input.signal ?? Signal.NONE;
  const ms = state.ms + dt * 1000;
  const car = step(state.car, input, dt, spec);
  const hit = collide(car, obstacles(t), SPEC);
  if (hit) {
    const stopped = { ...state.car, speed: 0 };
    const fault: Fault = { kind: FaultKind.CONTACT, severity: Severity.DANGEROUS, ms, at: hit.at, note: hit.solid.car ? "Hit a parked car" : "Hit a building" };
    return finish({ ...state, car: stopped, ms, signal, contact: { at: hit.at, ms } }, [fault], "The examiner stopped the test.");
  }
  const at = relocate(state, car);
  let next: GameState = { ...state, car, ms, at, signal };
  const lot = in_lot(next);
  const off = lot ? Math.abs(at.lateral) > 40 : Math.abs(at.lateral) > OFF_ROUTE;
  if (off) {
    const since = state.off_since ?? ms;
    if (ms - since >= OFF_GRACE) {
      const extra: Fault[] = wrong_way_in(t, car)
        ? [{ kind: FaultKind.NO_ENTRY, severity: Severity.SERIOUS, ms, at: body_centre(car, SPEC), note: "Drove into the one-way street the wrong way" }]
        : [];
      return finish({ ...next, off_since: since }, extra, "You left the route, so the examiner stopped the test.");
    }
    next = { ...next, off_since: since };
  } else if (state.off_since !== null) next = { ...next, off_since: null };

  const judged = judge(state.watch, { town: t, route: state.route, spec: SPEC, car, at, before: state.at, ms, signal, pulling_up: pulling_up(next), prompted: prompted(state) });
  const faults: Fault[] = [...judged.faults];
  if (!state.park && state.at.s <= state.route.lot.to && at.s > state.route.lot.to) {
    faults.push({ kind: FaultKind.PARK, severity: Severity.SERIOUS, ms, at: body_centre(car, SPEC), note: "Drove out of the car park without parking" });
  }
  next = { ...next, watch: judged.watch, faults: faults.length > 0 ? [...state.faults, ...faults] : state.faults };
  if (at.s > state.route.length - 1) {
    return finish(next, [{ kind: FaultKind.PULL_UP, severity: Severity.SERIOUS, ms, at: body_centre(car, SPEC), note: "Didn't pull up when asked" }]);
  }
  return speak(next);
}

export function bay_park(car: Car, town_: Town): Park | null {
  const bay = town_.bay;
  const inside = bodies(car, SPEC).every((body) => body.every((corner) => inside_convex(corner, bay.shape)));
  const straight = headings(car, SPEC).every((heading) => {
    const off = angle_between(heading, bay.heading);
    return Math.min(off, Math.PI - off) <= MAX_ANGLE;
  });
  if (!inside || !straight) return null;
  return { score: Math.round(fit(bodies(car, SPEC).flat(), headings(car, SPEC), bay).score) };
}

function overlaps_bay(car: Car, town_: Town): boolean {
  return bodies(car, SPEC).some((body) => body.some((corner) => inside_convex(corner, town_.bay.shape)));
}

/** Kerb gap on the right: the route's line is the lane's middle, so the kerb is half a lane to its right. */
export function kerb_gap(at: Located): number {
  return HALF - LANE / 2 - (at.lateral + SPEC.width / 2);
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, SPEC);
  if (car === state.car) return state;
  const next = { ...state, car };
  if (gear !== Gear.PARK) return next;
  const centre = body_centre(car, SPEC);
  if (in_lot(state) && !state.park && overlaps_bay(car, town())) {
    const park = bay_park(car, town());
    const fault: Fault | null = !park
      ? { kind: FaultKind.PARK, severity: Severity.SERIOUS, ms: state.ms, at: centre, note: "Finished over the bay lines or crooked" }
      : park.score < PARK_MINOR
        ? { kind: FaultKind.PARK, severity: Severity.MINOR, ms: state.ms, at: centre, note: `Not central in the bay (${park.score}%)` }
        : null;
    return speak({ ...next, park: park ?? { score: 0 }, faults: fault ? [...state.faults, fault] : state.faults });
  }
  if (pulling_up(state)) {
    const faults: Fault[] = [];
    if (kerb_gap(state.at) > KERB_GAP) faults.push({ kind: FaultKind.PULL_UP, severity: Severity.MINOR, ms: state.ms, at: centre, note: "Pulled up too far from the kerb" });
    if (!signalled(state.watch.signals, Signal.RIGHT, state.ms, PULL_UP_SIGNAL)) faults.push({ kind: FaultKind.SIGNAL, severity: Severity.MINOR, ms: state.ms, at: centre, note: "No signal before pulling up" });
    return finish(next, faults);
  }
  return next;
}

export function current_limit(state: Pick<GameState, "route" | "at">): number {
  return limit_at(state.route, state.at.s);
}

/** The side of the turn the examiner last asked for, until the car gets there. */
export function prompted(state: Pick<GameState, "route" | "at" | "next_prompt">): Signal {
  const prompt = state.route.prompts[state.next_prompt - 1];
  return prompt && prompt.s > state.at.s ? prompt.signal : Signal.NONE;
}

export function clock_text(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export const result_schema = z.object({
  passed: z.boolean(),
  minors: z.number().int().min(0),
  serious: z.number().int().min(0),
  dangerous: z.number().int().min(0),
  ms: z.number().min(0),
});
export type Result = z.infer<typeof result_schema>;

export const data_schema = z.object({ best: z.record(z.string(), result_schema) });
export type TestData = z.infer<typeof data_schema>;
export const EMPTY_DATA: TestData = { best: {} };

export function result_of(state: GameState): Result | null {
  if (!state.end || state.end.outcome === Outcome.STOPPED) return null;
  const counted = tally(state.faults);
  return { passed: state.end.outcome === Outcome.PASS, ...counted, ms: Math.round(state.ms) };
}

export function better(a: Result, b: Result): boolean {
  if (a.passed !== b.passed) return a.passed;
  const heavy = a.serious + a.dangerous - (b.serious + b.dangerous);
  if (heavy !== 0) return heavy < 0;
  if (a.minors !== b.minors) return a.minors < b.minors;
  return a.ms < b.ms;
}

export function record(data: TestData, route: RouteId, result: Result): { data: TestData; improved: boolean; first: boolean } {
  const old = data.best[route];
  const improved = !old || better(result, old);
  return { data: improved ? { best: { ...data.best, [route]: result } } : data, improved, first: old === undefined };
}
