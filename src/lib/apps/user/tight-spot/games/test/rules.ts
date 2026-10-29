import type { Polygon, Vec } from "../../core/geometry";
import { Signal } from "../../core/signal";
import { body_centre, corners, type Car, type VehicleSpec } from "../../core/vehicle";
import { EventKind, type Located, type Route, type RouteEvent } from "./route";
import { ControlKind, LANE, LaneKind, light_at, Light, on_road, type Town } from "./town";

export const Severity = { MINOR: "minor", SERIOUS: "serious", DANGEROUS: "dangerous" } as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

export const FaultKind = {
  SPEED: "speed",
  SOLID_LINE: "solid-line",
  RED_LIGHT: "red-light",
  STOP_SIGN: "stop-sign",
  GIVE_WAY: "give-way",
  SIGNAL: "signal",
  WRONG_LANE: "wrong-lane",
  KERB: "kerb",
  LANE_POSITION: "lane-position",
  HESITATION: "hesitation",
  PARK: "park",
  PULL_UP: "pull-up",
  CONTACT: "contact",
  NO_ENTRY: "no-entry",
} as const;
export type FaultKind = (typeof FaultKind)[keyof typeof FaultKind];

export interface Fault {
  kind: FaultKind;
  severity: Severity;
  ms: number;
  at: Vec;
  note: string;
}

export const FAULT_INFO: Record<FaultKind, { title: string; why: string }> = {
  speed: { title: "Speed", why: "Keep to the limit on the signs: 50 in town, 30 by the school, 10 in the car park." },
  "solid-line": { title: "Road markings", why: "A solid line is not to be crossed: it guards the run-up to a junction or a lane you must stay in." },
  "red-light": { title: "Traffic lights", why: "On red you stop behind the line and wait for green; amber means stop if you safely can." },
  "stop-sign": { title: "Stop sign", why: "At a stop sign the wheels must come to a full stop at the line, even with nothing coming." },
  "give-way": { title: "Give way", why: "Slow right down at a give-way line so you could stop and look for traffic before you go." },
  signal: { title: "Signals", why: "Signal in good time before every turn and before pulling up, and never signal one way and go another." },
  "wrong-lane": { title: "Lane choice", why: "On a road with lane arrows, get into the lane for where you're going before the solid line." },
  kerb: { title: "Kerb", why: "Keep the wheels off the kerb: give corners room and watch the back wheels cut in." },
  "lane-position": { title: "Lane position", why: "Keep to the middle of your lane, on the right-hand side of the road." },
  hesitation: { title: "Hesitation", why: "When the way is clear, go: standing still without a reason holds everyone up." },
  park: { title: "Bay park", why: "Finish inside the bay lines, straight and roughly central." },
  "pull-up": { title: "Pulling up", why: "Pull up close to the right-hand kerb when the examiner asks, and stop there." },
  contact: { title: "Contact", why: "Hitting a parked car or a building ends the test." },
  "no-entry": { title: "No entry", why: "A red circle with a white bar means you may not drive in from this side." },
};

export const MAX_MINORS = 15;
const SPEED_GRACE = 1000;
const LANE_TOLERANCE = 1.1;
const LANE_GRACE = 2000;
const WRONG_SIDE_GRACE = 800;
const STOPPED = 0.3;
const HESITATE = 4000;
const HESITATE_AT_LINE = 6000;
const APPROACH_ZONE = 6;
const STOP_SPEED = 0.3;
const GIVE_WAY_SPEED = 4.5;
const SIGNAL_WINDOW = 6000;
const SIGNAL_NEEDED = 700;

export interface SignalSpan {
  side: Signal;
  from: number;
  to: number | null;
}

export interface Watch {
  over_since: number | null;
  speeding: 0 | 1 | 2;
  on_line: boolean;
  kerb: 0 | 1 | 2;
  off_since: number | null;
  wrong_since: number | null;
  lane_flagged: 0 | 1 | 2;
  stopped_since: number | null;
  hesitated: boolean;
  approach_min: number;
  moved: boolean;
  signals: SignalSpan[];
}

export const FRESH_WATCH: Watch = {
  over_since: null,
  speeding: 0,
  on_line: false,
  kerb: 0,
  off_since: null,
  wrong_since: null,
  lane_flagged: 0,
  stopped_since: null,
  hesitated: false,
  approach_min: Infinity,
  moved: false,
  signals: [],
};

export function log_signal(spans: SignalSpan[], side: Signal, ms: number): SignalSpan[] {
  const open = spans.at(-1);
  if ((open?.to === null ? open.side : Signal.NONE) === side) return spans;
  const closed = open && open.to === null ? [...spans.slice(0, -1), { ...open, to: ms }] : spans;
  const kept = closed.filter((span) => span.to === null || span.to > ms - SIGNAL_WINDOW * 3);
  return side === Signal.NONE ? kept : [...kept, { side, from: ms, to: null }];
}

/** How long that side has shown over the window before `ms`: enough of it counts, even if the stalk has since cancelled. */
export function signalled(spans: readonly SignalSpan[], side: Signal, ms: number, window = SIGNAL_WINDOW): boolean {
  let total = 0;
  for (const span of spans) {
    if (span.side !== side) continue;
    total += Math.max(0, Math.min(span.to ?? ms, ms) - Math.max(span.from, ms - window));
  }
  return total >= SIGNAL_NEEDED;
}

function segments_cross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const cross = (o: Vec, p: Vec, q: Vec) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function touches_line(body: Polygon, a: Vec, b: Vec): boolean {
  for (let i = 0; i < body.length; i++) if (segments_cross(body[i], body[(i + 1) % body.length], a, b)) return true;
  return false;
}

export interface View {
  town: Town;
  route: Route;
  spec: VehicleSpec;
  car: Car;
  at: Located;
  before: Located;
  ms: number;
  signal: Signal;
  /** Asked to pull up and in the stretch for it: the car is meant to leave its lane for the kerb and stop. */
  pulling_up: boolean;
}

export interface Judged {
  watch: Watch;
  faults: Fault[];
}

function fault(kind: FaultKind, severity: Severity, view: View, note: string): Fault {
  return { kind, severity, ms: view.ms, at: body_centre(view.car, view.spec), note };
}

function lane_kind(view: View): LaneKind {
  return view.town.lanes[view.route.lanes[view.at.index]].kind;
}

function check_speed(watch: Watch, view: View, out: Fault[]): Watch {
  const limit = view.town.lanes[view.route.lanes[view.at.index]].limit;
  const v = Math.abs(view.car.speed);
  if (v <= limit + Math.max(1, limit * 0.1)) return v <= limit ? { ...watch, over_since: null, speeding: 0 } : watch;
  const since = watch.over_since ?? view.ms;
  let speeding = watch.speeding;
  const kmh = Math.round(limit * 3.6);
  if (speeding < 2 && v > limit * 1.3 + 1 && view.ms - since >= SPEED_GRACE / 2) {
    out.push(fault(FaultKind.SPEED, Severity.SERIOUS, view, `Well over the ${kmh} limit (${Math.round(v * 3.6)} km/h)`));
    speeding = 2;
  } else if (speeding < 1 && view.ms - since >= SPEED_GRACE) {
    out.push(fault(FaultKind.SPEED, Severity.MINOR, view, `Over the ${kmh} limit (${Math.round(v * 3.6)} km/h)`));
    speeding = 1;
  }
  return { ...watch, over_since: since, speeding };
}

function check_lines(watch: Watch, view: View, out: Fault[]): Watch {
  const body = corners(view.car, view.spec);
  const centre = body_centre(view.car, view.spec);
  const near = view.town.lines.filter((line) => line.solid && Math.min(Math.hypot(line.a.x - centre.x, line.a.y - centre.y), Math.hypot(line.b.x - centre.x, line.b.y - centre.y)) < 25);
  const touching = near.some((line) => touches_line(body, line.a, line.b));
  if (touching && !watch.on_line) out.push(fault(FaultKind.SOLID_LINE, Severity.MINOR, view, "Crossed a solid line"));
  return touching === watch.on_line ? watch : { ...watch, on_line: touching };
}

function check_kerb(watch: Watch, view: View, out: Fault[]): Watch {
  const body = corners(view.car, view.spec);
  const off = body.filter((corner) => !on_road(view.town, corner)).length;
  const mounted = off > 0 && !on_road(view.town, body_centre(view.car, view.spec));
  const level = mounted ? 2 : off > 0 ? 1 : 0;
  if (level === 0) return watch.kerb === 0 ? watch : { ...watch, kerb: 0 };
  if (level > watch.kerb) {
    out.push(level === 2 ? fault(FaultKind.KERB, Severity.SERIOUS, view, "Drove up onto the pavement") : fault(FaultKind.KERB, Severity.MINOR, view, "Touched the kerb"));
    return { ...watch, kerb: level };
  }
  return watch;
}

function check_lane(watch: Watch, view: View, out: Fault[]): Watch {
  if (view.pulling_up || lane_kind(view) !== LaneKind.ROAD) return watch.off_since === null && watch.wrong_since === null ? watch : { ...watch, off_since: null, wrong_since: null };
  const lane = view.town.lanes[view.route.lanes[view.at.index]];
  const road = view.town.roads[lane.road!];
  const lateral = view.at.lateral;
  const siblings = road.one_way ? [0, lane.index === 0 ? -LANE : LANE] : [0];
  const off = !siblings.some((offset) => Math.abs(lateral - offset) <= LANE_TOLERANCE);
  const wrong = !road.one_way && lateral < -LANE / 2;
  let next = watch;
  if (wrong) {
    const since = watch.wrong_since ?? view.ms;
    next = { ...next, wrong_since: since };
    if (watch.lane_flagged < 2 && view.ms - since >= WRONG_SIDE_GRACE) {
      out.push(fault(FaultKind.LANE_POSITION, Severity.SERIOUS, view, "Drove on the wrong side of the road"));
      next = { ...next, lane_flagged: 2 };
    }
  } else if (watch.wrong_since !== null) next = { ...next, wrong_since: null };
  if (off) {
    const since = watch.off_since ?? view.ms;
    next = { ...next, off_since: since };
    if (next.lane_flagged < 1 && view.ms - since >= LANE_GRACE) {
      out.push(fault(FaultKind.LANE_POSITION, Severity.MINOR, view, "Drifted out of the lane"));
      next = { ...next, lane_flagged: 1 };
    }
  } else if (watch.off_since !== null || watch.lane_flagged !== 0) next = { ...next, off_since: null, lane_flagged: wrong ? next.lane_flagged : 0 };
  return next;
}

function next_approach(view: View): RouteEvent | null {
  return view.route.events.find((event) => event.kind === EventKind.APPROACH && event.s > view.at.s) ?? null;
}

function check_hesitation(watch: Watch, view: View, out: Fault[]): Watch {
  const v = Math.abs(view.car.speed);
  if (v >= STOPPED) {
    if (watch.stopped_since === null && watch.moved) return watch;
    return { ...watch, stopped_since: null, hesitated: false, moved: watch.moved || v > 1 };
  }
  const in_lot = lane_kind(view) === LaneKind.LOT;
  if (!watch.moved || in_lot || view.pulling_up) return watch.stopped_since === null ? watch : { ...watch, stopped_since: null };
  const ahead = next_approach(view);
  const near = ahead && ahead.s - view.at.s < 12 ? ahead : null;
  if (near?.control?.kind === ControlKind.LIGHTS && light_at(near.control.group ?? 0, view.ms) !== Light.GREEN) return { ...watch, stopped_since: view.ms };
  const since = watch.stopped_since ?? view.ms;
  const allowed = near?.control ? HESITATE_AT_LINE : HESITATE;
  if (!watch.hesitated && view.ms - since >= allowed) {
    out.push(fault(FaultKind.HESITATION, Severity.MINOR, view, near?.control ? "Waited at the line with the way clear" : "Stopped in the road for no reason"));
    return { ...watch, stopped_since: since, hesitated: true };
  }
  return watch.stopped_since === since ? watch : { ...watch, stopped_since: since };
}

function side_name(side: Signal): string {
  return side === Signal.LEFT ? "left" : "right";
}

function crossed(view: View, event: RouteEvent, watch: Watch, out: Fault[]) {
  const spans = watch.signals;
  if (event.kind === EventKind.RING_EXIT) {
    if (!signalled(spans, Signal.RIGHT, view.ms)) out.push(fault(FaultKind.SIGNAL, Severity.MINOR, view, "No signal leaving the roundabout"));
    return;
  }
  const control = event.control;
  if (control?.kind === ControlKind.LIGHTS && light_at(control.group ?? 0, view.ms) === Light.RED) {
    out.push(fault(FaultKind.RED_LIGHT, Severity.SERIOUS, view, "Crossed the stop line on red"));
  }
  if (control?.kind === ControlKind.STOP && watch.approach_min > STOP_SPEED) out.push(fault(FaultKind.STOP_SIGN, Severity.SERIOUS, view, "Didn't stop at the stop line"));
  if (control?.kind === ControlKind.GIVE_WAY && watch.approach_min > GIVE_WAY_SPEED) out.push(fault(FaultKind.GIVE_WAY, Severity.MINOR, view, "Too fast at the give-way line to look"));
  const lane = view.town.lanes[event.lane];
  const road = lane.road ? view.town.roads[lane.road] : null;
  if (road?.one_way) {
    const lateral = view.at.lateral;
    const other = lane.index === 0 ? -LANE : LANE;
    if (Math.abs(lateral - other) < Math.abs(lateral)) out.push(fault(FaultKind.WRONG_LANE, Severity.MINOR, view, "In the wrong lane for the turn"));
  }
  if (!event.junction) return;
  if (event.signal !== Signal.NONE) {
    if (signalled(spans, event.signal, view.ms)) return;
    const other = event.signal === Signal.LEFT ? Signal.RIGHT : Signal.LEFT;
    out.push(
      fault(FaultKind.SIGNAL, Severity.MINOR, view, signalled(spans, other, view.ms) ? `Signalled ${side_name(other)}, turned ${side_name(event.signal)}` : `No signal before turning ${side_name(event.signal)}`)
    );
  } else if (view.signal !== Signal.NONE) out.push(fault(FaultKind.SIGNAL, Severity.MINOR, view, `Signalled ${side_name(view.signal)} going straight on`));
}

/** One step's checks, pure: the watch carries what spans steps (how long over the limit, already flagged, the signal's history). */
export function judge(watch: Watch, view: View): Judged {
  const out: Fault[] = [];
  let next: Watch = { ...watch, signals: log_signal(watch.signals, view.signal, view.ms) };
  next = check_speed(next, view, out);
  next = check_lines(next, view, out);
  next = check_kerb(next, view, out);
  next = check_lane(next, view, out);
  next = check_hesitation(next, view, out);
  const forward = view.at.s - view.before.s;
  if (forward > 0 && forward < 5) {
    for (const event of view.route.events) {
      if (event.s <= view.before.s || event.s > view.at.s) continue;
      crossed(view, event, next, out);
      if (event.kind === EventKind.APPROACH) next = { ...next, approach_min: Infinity };
    }
  }
  const ahead = next_approach(view);
  if (ahead && ahead.s - view.at.s <= APPROACH_ZONE) next = { ...next, approach_min: Math.min(next.approach_min, Math.abs(view.car.speed)) };
  return { watch: next, faults: out };
}

export interface Tally {
  minors: number;
  serious: number;
  dangerous: number;
}

export function tally(faults: readonly Fault[]): Tally {
  return {
    minors: faults.filter((each) => each.severity === Severity.MINOR).length,
    serious: faults.filter((each) => each.severity === Severity.SERIOUS).length,
    dangerous: faults.filter((each) => each.severity === Severity.DANGEROUS).length,
  };
}

export function passes(counts: Tally): boolean {
  return counts.minors <= MAX_MINORS && counts.serious === 0 && counts.dangerous === 0;
}

export interface SheetRow {
  kind: FaultKind;
  severity: Severity;
  count: number;
  notes: string[];
}

export function sheet(faults: readonly Fault[]): SheetRow[] {
  const rows = new Map<string, SheetRow>();
  for (const each of faults) {
    const key = `${each.kind}/${each.severity}`;
    const row = rows.get(key) ?? { kind: each.kind, severity: each.severity, count: 0, notes: [] };
    row.count++;
    if (!row.notes.includes(each.note)) row.notes.push(each.note);
    rows.set(key, row);
  }
  const rank = { dangerous: 0, serious: 1, minor: 2 };
  return [...rows.values()].sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);
}
