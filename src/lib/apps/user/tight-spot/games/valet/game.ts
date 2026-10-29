import { z } from "zod";
import { create_rng } from "$lib/core/utils/random";
import { inside_convex, overlaps } from "../../core/collision";
import { angle_between, clamp, lerp, type Vec } from "../../core/geometry";
import { collide, obstacles, type Scene } from "../../core/obstacles";
import { fit, MAX_ANGLE } from "../../core/precision";
import { SolidKind, type Bay, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";
import {
  bodies,
  body_centre,
  create_car,
  Gear,
  headings,
  shift,
  step,
  Vehicle,
  VEHICLE_NAMES,
  VEHICLES,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import { ARRIVAL_LANE, arrival_pose, build_street, distance, queue_poses, STAND, type Street } from "./street";

export const Status = {
  READY: "ready",
  STAND: "stand",
  DRIVING: "driving",
  PAUSED: "paused",
  OVER: "over",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const JobKind = { PARK: "park", RETURN: "return" } as const;
export type JobKind = (typeof JobKind)[keyof typeof JobKind];

export const QUEUE_LIMIT = 4;
export const WALK_SPEED = 2.5;
export const DENT_COST = 5;
const CLEAR = 0.3;
export const BASE_TIP = 10;
export const QUICK_TIP = 10;
export const PRECISE_TIP = 5;
export const QUICK_WINDOW = 60_000;
const BUS_FACTOR = 2;
const SCHEDULE = 300;
const START_GAP = 60_000;
const MIN_GAP = 24_000;
const RAMP = 12;
const PAINTS = 5;

export type Customer = typeof Vehicle.HATCH | typeof Vehicle.VAN | typeof Vehicle.PICKUP | typeof Vehicle.CITY | typeof Vehicle.SUV | typeof Vehicle.BUS;
const CARS: readonly [Customer, number][] = [
  [Vehicle.HATCH, 3],
  [Vehicle.CITY, 2],
  [Vehicle.SUV, 2],
  [Vehicle.PICKUP, 1.5],
  [Vehicle.VAN, 1.5],
];
const BUS_CHANCE = 0.14;
const BUS_EVERY = 8;
const BUS_FROM = 4;

export interface Arrival {
  at: number;
  vehicle: Customer;
  stay: number;
  paint: number;
}

export interface Shift {
  seed: number;
  daily?: string;
}

export interface Ticket {
  id: number;
  vehicle: Customer;
  paint: number;
  taken: number;
  back: number;
  parked: Placement | null;
  bay: Bay | null;
  precision: number | null;
  dented: boolean;
  solids: Solid[];
}

export interface Job {
  kind: JobKind;
  ticket: Ticket;
}

export interface Tip {
  amount: number;
  vehicle: Customer;
  at: number;
}

export interface GameState {
  shift: Shift;
  street: Street;
  schedule: readonly Arrival[];
  next: number;
  queue: readonly number[];
  tickets: readonly Ticket[];
  job: Job | null;
  car: Car;
  scene: Scene;
  /** The car in hand is in the queue's lane, so the queue waits a place back. */
  held: boolean;
  status: Status;
  resume: Status;
  ms: number;
  score: number;
  tips: number;
  dents: number;
  handed: number;
  clean: number;
  /** Where the car stood at its last dent: pressing on, or nudging back less than `CLEAR`, is the same contact. */
  touched: Vec | null;
  contact: Vec | null;
  contact_ms: number;
  last_drive: Gear | null;
  walk: { ms: number; at: number } | null;
  tip: Tip | null;
  served: number;
}

function pick_car(roll: number): Customer {
  const total = CARS.reduce((sum, [, weight]) => sum + weight, 0);
  let left = roll * total;
  for (const [vehicle, weight] of CARS) {
    left -= weight;
    if (left < 0) return vehicle;
  }
  return Vehicle.HATCH;
}

/** Pure: the same seed always gives the same cars at the same times, faster and faster. The first is waiting at the start. */
export function schedule(seed: number, count = SCHEDULE): Arrival[] {
  const rng = create_rng(hash(seed, 0x7a1e));
  const list: Arrival[] = [];
  let at = 0;
  let last_bus = -BUS_EVERY;
  for (let i = 0; i < count; i++) {
    if (i > 0) at += Math.round(lerp(START_GAP, MIN_GAP, Math.min(1, i / RAMP)) * (0.7 + 0.6 * rng()));
    const bus = i >= BUS_FROM && i - last_bus >= BUS_EVERY && rng() < BUS_CHANCE;
    if (bus) last_bus = i;
    const vehicle = bus ? Vehicle.BUS : pick_car(rng());
    const stay = Math.round(bus ? lerp(50_000, 80_000, rng()) : lerp(70_000, 150_000, rng()));
    list.push({ at, vehicle, stay, paint: Math.floor(rng() * PAINTS) });
  }
  return list;
}

export function spec_of(state: Pick<GameState, "job">): VehicleSpec {
  return VEHICLES[state.job?.ticket.vehicle ?? Vehicle.HATCH];
}

export function vehicle_name(vehicle: Customer): string {
  return VEHICLE_NAMES[vehicle];
}

const SHORT: Record<Customer, string> = { hatch: "Hatch", van: "Van", pickup: "Pickup", city: "City", suv: "SUV", bus: "Bus" };

export function short_name(vehicle: Customer): string {
  return SHORT[vehicle];
}

/** For the middle of a sentence: "the van", but "the SUV". */
export function vehicle_noun(vehicle: Customer): string {
  const name = VEHICLE_NAMES[vehicle];
  return name === name.toUpperCase() ? name : name.toLowerCase();
}

export function queued(state: Pick<GameState, "queue" | "schedule">): Customer[] {
  return state.queue.map((index) => state.schedule[index].vehicle);
}

function queue_solids(state: GameState): Solid[] {
  const vehicles = queued(state);
  const poses = queue_poses(vehicles, state.held && state.job ? state.job.ticket.vehicle : null);
  const mine = state.status === Status.DRIVING || state.status === Status.PAUSED ? bodies(state.car, spec_of(state)) : [];
  const items: Solid[] = [];
  poses.forEach((pose, i) => {
    if (!pose) return;
    const index = state.queue[i];
    const solids = car_solids(vehicles[i], pose, state.schedule[index].paint);
    if (solids.some((solid) => mine.some((body) => overlaps(body, solid.shape)))) return;
    items.push(...solids);
  });
  return items;
}

export function car_solids(vehicle: Customer, car: Placement, paint: number): Solid[] {
  const spec = VEHICLES[vehicle];
  const centre = body_centre(car, spec);
  return bodies(car, spec).map((shape) => ({
    kind: SolidKind.CAR,
    shape,
    car: { pose: { ...centre, heading: car.heading }, length: spec.length, width: spec.width, paint, vehicle },
  }));
}

/** One scene object per change, so the obstacle cache holds between them. */
function with_scene(state: GameState): GameState {
  const parked = state.tickets.flatMap((ticket) => ticket.solids);
  return { ...state, scene: { solids: [...state.street.world.solids, ...parked, ...queue_solids(state)] } };
}

function in_lane(car: Placement, spec: VehicleSpec): boolean {
  return bodies(car, spec).some((body) => overlaps(body, ARRIVAL_LANE));
}

/** Moves the clock on, letting in every car due; the fourth waiting ends the shift when it pulls up. */
export function tick(state: GameState, to: number): GameState {
  let next = state.next;
  const queue = [...state.queue];
  while (next < state.schedule.length && state.schedule[next].at <= to) {
    queue.push(next);
    const at = state.schedule[next].at;
    next++;
    if (queue.length >= QUEUE_LIMIT) return with_scene({ ...state, next, queue, ms: Math.max(state.ms, at), status: Status.OVER, resume: Status.OVER });
  }
  const changed = next !== state.next;
  const moved = { ...state, next, queue, ms: to };
  return changed ? with_scene(moved) : moved;
}

export function create_game(shift: Shift): GameState {
  const street = build_street(shift.seed);
  const state: GameState = {
    shift,
    street,
    schedule: schedule(shift.seed),
    next: 0,
    queue: [],
    tickets: [],
    job: null,
    car: create_car(street.world.start, Gear.PARK),
    scene: { solids: street.world.solids },
    held: false,
    status: Status.READY,
    resume: Status.STAND,
    ms: 0,
    score: 0,
    tips: 0,
    dents: 0,
    handed: 0,
    clean: 0,
    touched: null,
    contact: null,
    contact_ms: 0,
    last_drive: null,
    walk: null,
    tip: null,
    served: 0,
  };
  return tick(state, 0);
}

export function start(state: GameState): GameState {
  if (state.status === Status.READY) return { ...state, status: Status.STAND };
  if (state.status === Status.PAUSED) return { ...state, status: state.resume };
  return state;
}

export function pause(state: GameState): GameState {
  if (state.status !== Status.DRIVING && state.status !== Status.STAND) return state;
  return { ...state, status: Status.PAUSED, resume: state.status };
}

export function waiting(state: Pick<GameState, "tickets" | "ms" | "job">): Ticket[] {
  return state.tickets.filter((ticket) => ticket.parked && ticket.back <= state.ms && ticket !== state.job?.ticket).sort((a, b) => a.back - b.back);
}

export function can_take(state: GameState): boolean {
  return state.status === Status.STAND && state.queue.length > 0;
}

export function can_fetch(state: GameState): boolean {
  return state.status === Status.STAND && waiting(state).length > 0;
}

function begin(state: GameState, ticket: Ticket, kind: JobKind, car: Car): GameState {
  const spec = VEHICLES[ticket.vehicle];
  return with_scene({
    ...state,
    job: { kind, ticket },
    car,
    held: in_lane(car, spec),
    status: Status.DRIVING,
    resume: Status.DRIVING,
    touched: null,
    last_drive: null,
    walk: null,
  });
}

export function take(state: GameState): GameState {
  if (!can_take(state)) return state;
  const index = state.queue[0];
  const arrival = state.schedule[index];
  const ticket: Ticket = {
    id: index,
    vehicle: arrival.vehicle,
    paint: arrival.paint,
    taken: state.ms,
    back: state.ms + arrival.stay,
    parked: null,
    bay: null,
    precision: null,
    dented: false,
    solids: [],
  };
  const car = create_car(arrival_pose(arrival.vehicle), Gear.PARK, VEHICLES[arrival.vehicle]);
  return begin({ ...state, queue: state.queue.slice(1), tickets: [...state.tickets, ticket] }, ticket, JobKind.PARK, car);
}

export function walk_ms(from: Vec): number {
  return Math.round((distance(from, STAND) / WALK_SPEED) * 1000);
}

/** The valet walks to the car of the owner who has waited longest, then drives it. The walk can end the shift. */
export function fetch(state: GameState): GameState {
  if (!can_fetch(state)) return state;
  const ticket = waiting(state)[0];
  const parked = ticket.parked!;
  const walk = walk_ms(body_centre(parked, VEHICLES[ticket.vehicle]));
  const walked = tick(state, state.ms + walk);
  if (walked.status === Status.OVER) return walked;
  const out: Ticket = { ...ticket, solids: [] };
  const tickets = walked.tickets.map((each) => (each === ticket ? out : each));
  const car = create_car({ x: parked.x, y: parked.y, heading: parked.heading }, Gear.PARK, VEHICLES[ticket.vehicle]);
  return begin({ ...walked, tickets, walk: { ms: walk, at: walked.ms } }, out, JobKind.RETURN, car);
}

function lined_up(heading: number, bay: Bay): boolean {
  const off = angle_between(heading, bay.heading);
  return off <= MAX_ANGLE || (bay.either && Math.PI - off <= MAX_ANGLE);
}

function inside(car: Placement, bay: Bay, spec: VehicleSpec): boolean {
  return bodies(car, spec).every((body) => body.every((corner) => inside_convex(corner, bay.shape)));
}

export function parked_in(car: Placement, bay: Bay, spec: VehicleSpec): boolean {
  return inside(car, bay, spec) && headings(car, spec).every((heading) => lined_up(heading, bay));
}

export function bays_for(street: Street, vehicle: Customer): Bay[] {
  return vehicle === Vehicle.BUS ? street.coach : street.bays;
}

export function bay_for(state: GameState): Bay | null {
  if (!state.job) return null;
  const spec = spec_of(state);
  return bays_for(state.street, state.job.ticket.vehicle).find((bay) => parked_in(state.car, bay, spec)) ?? null;
}

export function hint(state: GameState): string | null {
  if (state.status !== Status.DRIVING || !state.job || state.car.gear !== Gear.PARK || state.last_drive === null) return null;
  const spec = spec_of(state);
  if (state.job.kind === JobKind.RETURN) {
    if (!inside(state.car, state.street.returns, spec)) return "Bring it to the box by the stand";
    return "Straighten up in the box";
  }
  if (inside(state.car, state.street.returns, spec)) return "Park it in a bay, not at the stand";
  const bay = bays_for(state.street, state.job.ticket.vehicle).find((each) => inside(state.car, each, spec));
  if (!bay) return state.job.ticket.vehicle === Vehicle.BUS ? "The bus goes in a coach bay up the north road" : "Not in a bay";
  const angle = Math.max(...headings(state.car, spec).map((heading) => Math.min(angle_between(heading, bay.heading), Math.PI - angle_between(heading, bay.heading))));
  return `Not straight: ${((angle * 180) / Math.PI).toFixed(1)}° off`;
}

export function tip_for(ticket: Pick<Ticket, "vehicle" | "back" | "precision" | "dented">, at: number): number {
  if (ticket.dented) return 0;
  const quick = QUICK_TIP * clamp(1 - Math.max(0, at - ticket.back) / QUICK_WINDOW, 0, 1);
  const precise = PRECISE_TIP * ((ticket.precision ?? 0) / 100);
  const factor = ticket.vehicle === Vehicle.BUS ? BUS_FACTOR : 1;
  return Math.round((BASE_TIP + quick + precise) * factor);
}

function park(state: GameState, bay: Bay): GameState {
  const job = state.job!;
  const spec = spec_of(state);
  const placed: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading, steer: state.car.steer };
  const precision = fit(bodies(placed, spec).flat(), headings(placed, spec), bay).score;
  const ticket: Ticket = { ...job.ticket, parked: placed, bay, precision, solids: car_solids(job.ticket.vehicle, placed, job.ticket.paint) };
  const tickets = state.tickets.map((each) => (each === job.ticket ? ticket : each));
  const walk = walk_ms(body_centre(placed, spec));
  const parked = with_scene({ ...state, tickets, job: null, held: false, status: Status.STAND, resume: Status.STAND, served: state.served + 1 });
  const walked = tick(parked, state.ms + walk);
  return walked.status === Status.OVER ? walked : { ...walked, walk: { ms: walk, at: walked.ms } };
}

function hand_back(state: GameState): GameState {
  const ticket = state.job!.ticket;
  const amount = tip_for(ticket, state.ms);
  return with_scene({
    ...state,
    tickets: state.tickets.filter((each) => each !== ticket),
    job: null,
    held: false,
    status: Status.STAND,
    resume: Status.STAND,
    score: state.score + amount,
    tips: state.tips + amount,
    handed: state.handed + 1,
    clean: state.clean + (ticket.dented ? 0 : 1),
    tip: { amount, vehicle: ticket.vehicle, at: state.ms },
    walk: null,
  });
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING || !state.job) return state;
  const car = shift(state.car, gear, spec_of(state));
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const next: GameState = { ...state, car, last_drive: drives ? gear : state.last_drive };
  if (gear !== Gear.PARK || state.last_drive === null) return next;
  if (state.job.kind === JobKind.RETURN) return parked_in(car, state.street.returns, spec_of(state)) ? hand_back(next) : next;
  const bay = bay_for(next);
  return bay ? park(next, bay) : next;
}

/**
 * Contact is a dent, not the end: the car stops short of what it touched, the score drops and the car in hand loses
 * its tip. Pressing on against the same thing is one dent. `spec` is passed in so Creep can swap its variant in.
 */
export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = spec_of(state)): GameState {
  if (state.status !== Status.DRIVING && state.status !== Status.STAND) return state;
  if (state.status === Status.STAND || !state.job) return tick(state, state.ms + dt * 1000);
  const moved = step(state.car, input, dt, spec);
  const hit = collide(moved, obstacles(state.scene), spec);
  let next: GameState;
  if (hit) {
    const was = state.car;
    const car: Car = { ...moved, x: was.x, y: was.y, heading: was.heading, trailers: was.trailers, steer: was.steer, speed: 0 };
    const fresh = !state.touched;
    const ticket = fresh ? { ...state.job.ticket, dented: true } : state.job.ticket;
    next = {
      ...state,
      car,
      touched: fresh ? { x: was.x, y: was.y } : state.touched,
      contact: hit.at,
      contact_ms: fresh ? state.ms : state.contact_ms,
      ...(fresh
        ? {
            dents: state.dents + 1,
            score: state.score - DENT_COST,
            job: { ...state.job, ticket },
            tickets: state.tickets.map((each) => (each === state.job!.ticket ? ticket : each)),
          }
        : {}),
    };
  } else {
    const away = state.touched && distance(moved, state.touched) > CLEAR;
    next = { ...state, car: moved, touched: away ? null : state.touched };
  }
  const held = in_lane(next.car, spec);
  if (held !== next.held) next = with_scene({ ...next, held });
  return tick(next, state.ms + dt * 1000);
}

export function dented(state: GameState): boolean {
  return state.contact !== null && state.ms - state.contact_ms < 1200;
}

/** The final score, never below zero, so a bad shift ranks under a good one rather than off the board. */
export function final_score(state: Pick<GameState, "score">): number {
  return Math.max(0, state.score);
}

export const result_schema = z.object({
  score: z.number().int().nonnegative(),
  ms: z.number().nonnegative(),
  handed: z.number().int().nonnegative(),
  dents: z.number().int().nonnegative(),
});
export type Result = z.infer<typeof result_schema>;
export const data_schema = z.object({ best: z.record(z.string(), result_schema) });
export type ValetData = z.infer<typeof data_schema>;
export const EMPTY_DATA: ValetData = { best: {} };

export function shift_key(shift: Shift): string {
  return shift.daily ? `daily:${shift.daily}` : "shifts";
}

export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.score !== a.score ? b.score > a.score : b.ms > a.ms;
}

export interface Recorded {
  data: ValetData;
  improved: boolean;
  first: boolean;
}

export function record(data: ValetData, shift: Shift, result: Result): Recorded {
  const key = shift_key(shift);
  const old = data.best[key];
  const improved = better(old, result);
  return { data: improved ? { best: { ...data.best, [key]: result } } : data, improved, first: old === undefined };
}

export function result_of(state: GameState): Result {
  return { score: final_score(state), ms: Math.round(state.ms), handed: state.handed, dents: state.dents };
}

export function countdown(ticket: Ticket, ms: number): number {
  return ticket.back - ms;
}
