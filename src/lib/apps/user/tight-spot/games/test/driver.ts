import { NO_SIGNAL, Signal, signal_after, toggle_signal, type SignalState } from "../../core/signal";
import { Gear, max_steer, steer_base, without_creep, type Input } from "../../core/vehicle";
import { advance, change_gear, create_game, current_limit, set_status, SPEC, Status, type GameState } from "./game";
import { EventKind, type Route, type RouteId } from "./route";
import { ControlKind, green_left, until_green } from "./town";

// The proof driver, for tests only: a careful learner who follows the route's line by pure pursuit, keeps under the
// limits, slows for bends, stops where the rules say and signals in good time. Options make it get one thing wrong.

export interface DriverOptions {
  pace?: number;
  signals?: boolean;
  stop_signs?: boolean;
  rush?: { from: number; to: number; speed: number };
  shift?: { from: number; to: number; by: number };
  until?: number;
}

const DT = 1 / 120;
const MOVING = without_creep(SPEC);
const LIMIT_MS = 6 * 60 * 1000;
const DECEL = 2.2;
const A_DRIVER = 2.2;
const SIGNAL_AHEAD = 40;
const EXIT_AHEAD = 25;
const PARK_WAIT = 1000;
const STOP_WAIT = 1500;
const RAMP = 8;

function lerp_offset(options: DriverOptions, route: Route, s: number): number {
  let offset = 0;
  const pull = route.pull_up.from;
  if (s > pull) offset += Math.min(1, (s - pull) / 15) * 0.45;
  const shift = options.shift;
  if (shift && s > shift.from - RAMP && s < shift.to + RAMP) {
    const t = Math.min(1, (s - (shift.from - RAMP)) / RAMP, (shift.to + RAMP - s) / RAMP);
    offset += shift.by * Math.max(0, t);
  }
  return offset;
}

function sample_at(route: Route, s: number): number {
  let lo = 0;
  let hi = route.ss.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.ss[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function curve_speed(route: Route, from: number, to: number, s_now: number): number {
  let cap = Infinity;
  for (let i = sample_at(route, from); i < route.ss.length - 4 && route.ss[i] < to; i += 2) {
    const turn = Math.abs(((route.headings[i + 4] - route.headings[Math.max(0, i - 4)] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    const length = route.ss[i + 4] - route.ss[Math.max(0, i - 4)] || 1;
    const k = turn / length;
    if (k < 1e-3) continue;
    const safe = Math.sqrt(A_DRIVER / k);
    cap = Math.min(cap, Math.sqrt(safe * safe + 2 * DECEL * Math.max(0, route.ss[i] - s_now)));
  }
  return cap;
}

export interface Drive {
  state: GameState;
}

export function drive_route(id: RouteId, options: DriverOptions = {}): Drive {
  const pace = options.pace ?? 0.8;
  let state = set_status(create_game(id), Status.DRIVING);
  state = change_gear(state, Gear.DRIVE);
  const route = state.route;
  const lock = max_steer(SPEC);
  let stalk: SignalState = NO_SIGNAL;
  const cleared = new Set<number>();
  const waited = new Map<number, number>();
  let parked_at: number | null = null;

  while (state.status === Status.DRIVING && state.ms < LIMIT_MS) {
    const s = state.at.s;
    if (options.until !== undefined && s >= options.until) break;
    const v = Math.abs(state.car.speed);

    let target = current_limit(state) * pace;
    target = Math.min(target, curve_speed(route, s, s + 12 + (v * v) / (2 * DECEL), s));
    for (let i = sample_at(route, s); i < route.ss.length && route.ss[i] < s + 60; i += 10) {
      const limit = current_limit({ route, at: { index: i, s: route.ss[i], lateral: 0 } }) * pace;
      target = Math.min(target, Math.sqrt(limit * limit + 2 * DECEL * Math.max(0, route.ss[i] - s - 8)));
    }
    if (options.rush && s >= options.rush.from && s <= options.rush.to) target = options.rush.speed;

    let stop_at: number | null = null;
    route.events.forEach((event, k) => {
      if (event.kind !== EventKind.APPROACH || event.s <= s - 0.5 || cleared.has(k) || event.s - s > 120) return;
      const kind = event.control?.kind;
      if (kind === ControlKind.STOP && options.stop_signs !== false) {
        const since = waited.get(k);
        if (since !== undefined && state.ms - since >= STOP_WAIT) cleared.add(k);
        else {
          stop_at ??= event.s - 1;
          if (v < 0.05 && event.s - s < 2.5 && since === undefined) waited.set(k, state.ms);
        }
      } else if (kind === ControlKind.LIGHTS) {
        const group = event.control!.group ?? 0;
        const eta = (event.s - s) / Math.max(v, 4) + 1.5;
        if (green_left(group, state.ms) > eta) cleared.add(k);
        else if (until_green(group, state.ms) === 0 && v > 6 && event.s - s < 15) cleared.add(k);
        else stop_at ??= event.s - 1.5;
      } else if (kind === ControlKind.GIVE_WAY) {
        target = Math.min(target, Math.sqrt(9 + 2 * DECEL * Math.max(0, event.s - s - 1)));
      }
    });
    if (!state.park && s < route.lot.stop + 0.5) stop_at ??= route.lot.stop;
    if (parked_at !== null && state.ms - parked_at < PARK_WAIT) stop_at = s;
    if (state.next_prompt >= route.prompts.length) stop_at ??= route.pull_up.from + 25;
    if (stop_at !== null) {
      const room = stop_at - s;
      target = Math.min(target, room < 0.3 ? 0 : Math.sqrt(2 * DECEL * (room - 0.3)) + 0.3);
    }

    if (!state.park && v < 0.05 && Math.abs(s - route.lot.stop) < 0.8) {
      state = change_gear(state, Gear.PARK);
      parked_at = state.ms;
      continue;
    }
    if (parked_at !== null && state.car.gear === Gear.PARK && state.ms - parked_at >= PARK_WAIT) {
      state = change_gear(state, Gear.DRIVE);
    }
    if (state.next_prompt >= route.prompts.length && v < 0.05 && Math.abs(s - (route.pull_up.from + 25)) < 1) {
      state = change_gear(state, Gear.PARK);
      break;
    }

    const err = target - v;
    const throttle = err > 0 ? Math.min(1, err * 1.2) : 0;
    const brake = target < 0.05 ? 1 : err < 0 ? Math.min(1, -err * 0.9) : 0;

    const ahead = Math.min(9, Math.max(2.6, 2 + 0.5 * v));
    const goal_s = s + ahead;
    const i = sample_at(route, goal_s);
    const p = route.points[i];
    const h = route.headings[i];
    const offset = lerp_offset(options, route, goal_s);
    const goal = { x: p.x - Math.sin(h) * offset, y: p.y + Math.cos(h) * offset };
    const alpha = Math.atan2(goal.y - state.car.y, goal.x - state.car.x) - state.car.heading;
    const distance = Math.max(1, Math.hypot(goal.x - state.car.x, goal.y - state.car.y));
    const curvature = (2 * Math.sin(alpha)) / distance;
    const wheel = Math.max(-1, Math.min(1, Math.atan(curvature * steer_base(SPEC)) / lock));

    let want: Signal = Signal.NONE;
    if (options.signals !== false) {
      for (const event of route.events) {
        if (event.s <= s || event.signal === Signal.NONE) continue;
        const reach = event.kind === EventKind.RING_EXIT ? EXIT_AHEAD : SIGNAL_AHEAD;
        if (event.s - s <= reach) {
          want = event.signal;
          break;
        }
      }
      if (state.next_prompt >= route.prompts.length && s > route.pull_up.from - 5) want = Signal.RIGHT;
    }
    stalk = signal_after(stalk, state.car.steer / lock);
    if (stalk.side !== want) stalk = toggle_signal(stalk, want === Signal.NONE ? stalk.side : want);

    const input: Input = { steer: wheel, throttle, brake, signal: stalk.side };
    state = advance(state, input, DT, MOVING);
  }
  return { state };
}
