import { oriented_box, rect, wrap_angle, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { SolidKind, type Bay, type Solid } from "../../core/scene";
import { Vehicle, VEHICLES } from "../../core/vehicle";

export function kmh(value: number): number {
  return value / 3.6;
}

export const LANE = 3.5;
export const HALF = LANE;
export const PAVEMENT = 3;
// A turn's kerb is a quarter circle about the turn's own centre, so a car on the lane keeps its 0.85 m off it.
const FILLET = 5;
export const MOUTH = HALF + FILLET;
export const RING = 11.5;
export const ISLAND = 8;
export const RING_OUT = 15;
export const ROUND_MOUTH = 22;
const SPLAY = 0.62;
const SOLID_RUN = 15;
const LAYBY = 2.5;
const SAMPLE = 0.5;

export const NodeKind = { BEND: "bend", T: "t", CROSS: "cross", ROUNDABOUT: "roundabout", DRIVEWAY: "driveway" } as const;
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

export const ControlKind = { STOP: "stop", GIVE_WAY: "give-way", LIGHTS: "lights" } as const;
export type ControlKind = (typeof ControlKind)[keyof typeof ControlKind];

export const LaneKind = { ROAD: "road", LOT: "lot", TURN: "turn", RING: "ring", ENTRY: "entry", EXIT: "exit" } as const;
export type LaneKind = (typeof LaneKind)[keyof typeof LaneKind];

export const Turn = { STRAIGHT: "straight", LEFT: "left", RIGHT: "right" } as const;
export type Turn = (typeof Turn)[keyof typeof Turn];

export const Light = { GREEN: "green", AMBER: "amber", RED: "red" } as const;
export type Light = (typeof Light)[keyof typeof Light];

export const SignKind = { SPEED: "speed", GIVE_WAY: "give-way", STOP: "stop", NO_ENTRY: "no-entry", ONE_WAY: "one-way" } as const;
export type SignKind = (typeof SignKind)[keyof typeof SignKind];

export interface Node {
  id: string;
  at: Vec;
  kind: NodeKind;
}

export interface Control {
  kind: ControlKind;
  group?: number;
}

interface RoadDef {
  id: string;
  from: string;
  to: string;
  limit: number;
  one_way?: boolean;
  /** A parking strip beside the lanes: 1 on the right of from → to, −1 on the left. */
  layby?: { side: 1 | -1; from: number; to: number; cars: number[] };
}

export interface Road extends RoadDef {
  a: Vec;
  b: Vec;
  u: Vec;
  length: number;
}

export interface Lane {
  id: string;
  kind: LaneKind;
  road?: string;
  node?: string;
  to?: string;
  index?: number;
  points: Vec[];
  headings: number[];
  length: number;
  limit: number;
  next: string[];
  turn?: Turn;
  control?: Control;
}

export interface Sign {
  kind: SignKind;
  at: Vec;
  facing: number;
  value?: number;
}

export interface Line {
  a: Vec;
  b: Vec;
  solid: boolean;
}

export interface StopLine {
  a: Vec;
  b: Vec;
  kind: ControlKind;
  lane: string;
}

export interface LightPost {
  at: Vec;
  facing: number;
  group: number;
}

export interface Arrow {
  at: Vec;
  heading: number;
  turns: Turn[];
}

export interface Town {
  nodes: Record<string, Node>;
  roads: Record<string, Road>;
  lanes: Record<string, Lane>;
  bounds: Bounds;
  /** Asphalt that isn't a road or a junction: the lay-bys and the car park. */
  paved: Polygon[];
  lot: Polygon;
  bay: Bay;
  solids: Solid[];
  buildings: Polygon[];
  lines: Line[];
  stops: StopLine[];
  zebras: Polygon[];
  signs: Sign[];
  lights: LightPost[];
  arrows: Arrow[];
  bays: Polygon[];
}

const NODES: Node[] = [
  { id: "A", at: { x: 0, y: 0 }, kind: NodeKind.BEND },
  { id: "Q1", at: { x: 38, y: 0 }, kind: NodeKind.DRIVEWAY },
  { id: "Q2", at: { x: 100, y: 0 }, kind: NodeKind.DRIVEWAY },
  { id: "B", at: { x: 140, y: 0 }, kind: NodeKind.T },
  { id: "C", at: { x: 280, y: 0 }, kind: NodeKind.BEND },
  { id: "D", at: { x: 0, y: 100 }, kind: NodeKind.T },
  { id: "E", at: { x: 140, y: 100 }, kind: NodeKind.CROSS },
  { id: "F", at: { x: 280, y: 100 }, kind: NodeKind.ROUNDABOUT },
  { id: "G", at: { x: 400, y: 100 }, kind: NodeKind.BEND },
  { id: "H", at: { x: 0, y: 200 }, kind: NodeKind.BEND },
  { id: "I", at: { x: 140, y: 200 }, kind: NodeKind.T },
  { id: "J", at: { x: 280, y: 200 }, kind: NodeKind.T },
  { id: "K", at: { x: 400, y: 200 }, kind: NodeKind.BEND },
];

const TOWN_LIMIT = kmh(50);
const ZONE_LIMIT = kmh(30);
export const LOT_LIMIT = kmh(10);

const ROADS: RoadDef[] = [
  { id: "AQ1", from: "A", to: "Q1", limit: TOWN_LIMIT },
  { id: "Q1Q2", from: "Q1", to: "Q2", limit: TOWN_LIMIT },
  { id: "Q2B", from: "Q2", to: "B", limit: TOWN_LIMIT },
  { id: "BC", from: "B", to: "C", limit: TOWN_LIMIT },
  { id: "AD", from: "A", to: "D", limit: TOWN_LIMIT },
  { id: "DH", from: "D", to: "H", limit: TOWN_LIMIT },
  { id: "BE", from: "B", to: "E", limit: TOWN_LIMIT, one_way: true },
  { id: "DE", from: "D", to: "E", limit: TOWN_LIMIT, layby: { side: 1, from: 24, to: 112, cars: [26, 33, 46, 52, 78, 92, 104] } },
  { id: "EF", from: "E", to: "F", limit: TOWN_LIMIT },
  { id: "CF", from: "C", to: "F", limit: TOWN_LIMIT },
  { id: "FG", from: "F", to: "G", limit: TOWN_LIMIT },
  { id: "GK", from: "G", to: "K", limit: TOWN_LIMIT },
  { id: "EI", from: "E", to: "I", limit: TOWN_LIMIT },
  { id: "FJ", from: "F", to: "J", limit: TOWN_LIMIT },
  { id: "HI", from: "H", to: "I", limit: ZONE_LIMIT },
  { id: "IJ", from: "I", to: "J", limit: ZONE_LIMIT, layby: { side: -1, from: 20, to: 96, cars: [22, 30, 44, 72, 86] } },
  { id: "JK", from: "J", to: "K", limit: TOWN_LIMIT },
];

/** Keyed `{road}>{node}`: the control on that road's lanes as they reach the node. */
const CONTROLS: Record<string, Control> = {
  "DE>D": { kind: ControlKind.STOP },
  "BE>E": { kind: ControlKind.LIGHTS, group: 0 },
  "EI>E": { kind: ControlKind.LIGHTS, group: 0 },
  "DE>E": { kind: ControlKind.LIGHTS, group: 1 },
  "EF>E": { kind: ControlKind.LIGHTS, group: 1 },
  "CF>F": { kind: ControlKind.GIVE_WAY },
  "EF>F": { kind: ControlKind.GIVE_WAY },
  "FJ>F": { kind: ControlKind.GIVE_WAY },
  "FG>F": { kind: ControlKind.GIVE_WAY },
  "EI>I": { kind: ControlKind.GIVE_WAY },
  "FJ>J": { kind: ControlKind.GIVE_WAY },
  "LOT>Q1": { kind: ControlKind.GIVE_WAY },
};

export const LOT_ROAD = "LOT";
const LOT = { x0: 34, x1: 104, y0: -40, y1: -6.5 };
const LOT_IN = 100;
const LOT_OUT = 38;
const AISLE_NORTH = -35.5;
const AISLE_SOUTH = -13.5;
const ROW_NORTH = { y0: -29, y1: -23.5 };
const ROW_SOUTH = { y0: -23.5, y1: -18 };
const BAY_WIDTH = 2.7;
const BAYS_FROM = 42;
const BAY_COUNT = 20;
/** The bay the test parks in, counted from the west; the one behind it in the other row stays empty so it drives through. */
export const TARGET_BAY = 11;

const GREEN = 12;
const AMBER = 3;
const ALL_RED = 1;
export const LIGHT_CYCLE = 2 * (GREEN + AMBER + ALL_RED);

export function light_at(group: number, ms: number): Light {
  const t = (((ms / 1000 - group * (LIGHT_CYCLE / 2)) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  if (t < GREEN) return Light.GREEN;
  if (t < GREEN + AMBER) return Light.AMBER;
  return Light.RED;
}

export function until_green(group: number, ms: number): number {
  const t = (((ms / 1000 - group * (LIGHT_CYCLE / 2)) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  return t < GREEN ? 0 : LIGHT_CYCLE - t;
}

export function green_left(group: number, ms: number): number {
  const t = (((ms / 1000 - group * (LIGHT_CYCLE / 2)) % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE;
  return t < GREEN ? GREEN - t : 0;
}

const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (heading: number): Vec => ({ x: Math.cos(heading), y: Math.sin(heading) });
const right_of = (u: Vec): Vec => ({ x: -u.y, y: u.x });

function mouth(node: Node): number {
  return node.kind === NodeKind.ROUNDABOUT ? ROUND_MOUTH : MOUTH;
}

function resample(points: Vec[]): { points: Vec[]; headings: number[]; length: number } {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
  const length = cumulative[cumulative.length - 1];
  const count = Math.max(1, Math.round(length / SAMPLE));
  const out: Vec[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const s = (length * k) / count;
    while (j < points.length - 2 && cumulative[j + 1] < s) j++;
    const span = cumulative[j + 1] - cumulative[j] || 1;
    const t = Math.min(1, Math.max(0, (s - cumulative[j]) / span));
    out.push({ x: points[j].x + (points[j + 1].x - points[j].x) * t, y: points[j].y + (points[j + 1].y - points[j].y) * t });
  }
  const headings = out.map((_, i) => {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    return Math.atan2(b.y - a.y, b.x - a.x);
  });
  return { points: out, headings, length };
}

/** A smooth join of two poses: a cubic whose handles reach a little over half way to where the two headings cross. */
function join(from: Pose, to: Pose): Vec[] {
  const a = { x: from.x, y: from.y };
  const b = { x: to.x, y: to.y };
  const da = unit(from.heading);
  const db = unit(to.heading);
  const cross = da.x * db.y - da.y * db.x;
  let la = dist(a, b) / 3;
  let lb = la;
  if (Math.abs(cross) > 1e-3) {
    const d = sub(b, a);
    const t = (d.x * db.y - d.y * db.x) / cross;
    const s = (d.x * da.y - d.y * da.x) / cross;
    if (t > 0 && s > 0) {
      la = t * 0.5523;
      lb = s * 0.5523;
    }
  }
  const p1 = add(a, mul(da, la));
  const p2 = sub(b, mul(db, lb));
  const out: Vec[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y,
    });
  }
  return out;
}

function arc(centre: Vec, radius: number, from: number, to: number): Vec[] {
  const steps = Math.max(2, Math.ceil((Math.abs(to - from) * radius) / 0.25));
  const out: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps;
    out.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
  }
  return out;
}

export function turn_of(from: number, to: number): Turn {
  const delta = wrap_angle(to - from);
  if (Math.abs(delta) < 0.35) return Turn.STRAIGHT;
  return delta > 0 ? Turn.RIGHT : Turn.LEFT;
}

function make_lane(base: Omit<Lane, "points" | "headings" | "length">, raw: Vec[]): Lane {
  return { ...base, ...resample(raw) };
}

function lane_end_pose(lane: Lane): Pose {
  const last = lane.points.length - 1;
  return { ...lane.points[last], heading: lane.headings[last] };
}

function lane_start_pose(lane: Lane): Pose {
  return { ...lane.points[0], heading: lane.headings[0] };
}

function offsets(road: RoadDef): number[] {
  return road.one_way ? [LANE / 2, -LANE / 2] : [LANE / 2];
}

function road_lanes(road: Road): Lane[] {
  const ways = road.one_way ? [true] : [true, false];
  const lanes: Lane[] = [];
  for (const forward of ways) {
    const u = forward ? road.u : mul(road.u, -1);
    const start = forward ? road.a : road.b;
    const end = forward ? road.b : road.a;
    const to = forward ? road.to : road.from;
    offsets(road).forEach((offset, index) => {
      const side = mul(right_of(u), offset);
      lanes.push(
        make_lane(
          { id: `${road.id}>${to}:${index}`, kind: LaneKind.ROAD, road: road.id, to, index, limit: road.limit, next: [], control: CONTROLS[`${road.id}>${to}`] },
          [add(start, side), add(end, side)]
        )
      );
    });
  }
  return lanes;
}

// Up the east aisle, west along the north one, south into the bay and on through the empty one behind it, then west
// along the south aisle and down to the gate: all forward, so the proof drives it without reversing.
function lot_lane(): Lane {
  const bay_x = BAYS_FROM + BAY_WIDTH * (TARGET_BAY + 0.5);
  const corner = 6;
  const swing = 5;
  const points: Vec[] = [
    { x: LOT_IN, y: -MOUTH },
    ...arc({ x: LOT_IN - corner, y: AISLE_NORTH + corner }, corner, 0, -Math.PI / 2),
    ...arc({ x: bay_x + swing, y: AISLE_NORTH + swing }, swing, -Math.PI / 2, -Math.PI),
    ...arc({ x: bay_x - swing, y: AISLE_SOUTH - swing }, swing, 0, Math.PI / 2),
    ...arc({ x: LOT_OUT + swing, y: -MOUTH }, swing, -Math.PI / 2, -Math.PI),
  ];
  return make_lane({ id: `${LOT_ROAD}>Q1:0`, kind: LaneKind.LOT, road: LOT_ROAD, to: "Q1", index: 0, limit: LOT_LIMIT, next: [], control: CONTROLS["LOT>Q1"] }, points);
}

function arm_of(node: Node, lane_point: Vec): number {
  return Math.atan2(lane_point.y - node.at.y, lane_point.x - node.at.x);
}

/** Which movements a lane may make: on a two-lane approach the right lane doesn't turn left, nor the left lane right. */
function allowed(lane: Lane, turn: Turn, lanes_here: number): boolean {
  if (lanes_here < 2) return true;
  if (lane.index === 0) return turn !== Turn.LEFT;
  return turn !== Turn.RIGHT;
}

function junction_lanes(node: Node, incoming: Lane[], outgoing: Lane[]): Lane[] {
  const made: Lane[] = [];
  for (const from of incoming) {
    const end = lane_end_pose(from);
    const from_arm = Math.round(arm_of(node, end) / (Math.PI / 2));
    const siblings = incoming.filter((lane) => lane.road === from.road).length;
    for (const to of outgoing) {
      const start = lane_start_pose(to);
      if (Math.round(arm_of(node, start) / (Math.PI / 2)) === from_arm) continue;
      const turn = node.kind === NodeKind.BEND ? Turn.STRAIGHT : turn_of(end.heading, start.heading);
      if (!allowed(from, turn, siblings)) continue;
      const lane = make_lane(
        {
          id: `${node.id}:${from.id}>${to.id}`,
          kind: LaneKind.TURN,
          node: node.id,
          limit: Math.min(from.limit, to.limit),
          next: [to.id],
          turn: node.kind === NodeKind.BEND ? undefined : turn,
        },
        turn_of(end.heading, start.heading) === Turn.STRAIGHT ? [end, start] : join(end, start)
      );
      from.next.push(lane.id);
      made.push(lane);
    }
  }
  return made;
}

function roundabout_lanes(node: Node, incoming: Lane[], outgoing: Lane[]): Lane[] {
  interface Point {
    angle: number;
    entry?: Lane;
    exit?: Lane;
  }
  const points: Point[] = [];
  for (const lane of incoming) points.push({ angle: wrap_angle(arm_of(node, lane_end_pose(lane)) - SPLAY), entry: lane });
  for (const lane of outgoing) points.push({ angle: wrap_angle(arm_of(node, lane_start_pose(lane)) + SPLAY), exit: lane });
  // Right-hand traffic goes round anticlockwise as seen from above: down the screen angle, since y points down.
  points.sort((a, b) => b.angle - a.angle);
  const at = (angle: number): Pose => ({
    x: node.at.x + Math.cos(angle) * RING,
    y: node.at.y + Math.sin(angle) * RING,
    heading: angle - Math.PI / 2,
  });
  const limit = Math.min(...incoming.map((lane) => lane.limit));
  const ring: Lane[] = points.map((point, i) => {
    const next = points[(i + 1) % points.length];
    let to = next.angle;
    while (to >= point.angle) to -= Math.PI * 2;
    return make_lane({ id: `${node.id}:ring:${i}`, kind: LaneKind.RING, node: node.id, limit, next: [] }, arc(node.at, RING, point.angle, to));
  });
  const made: Lane[] = [...ring];
  points.forEach((point, i) => {
    const previous = ring[(i - 1 + points.length) % points.length];
    previous.next.push(ring[i].id);
    if (point.entry) {
      const lane = make_lane(
        { id: `${node.id}:in:${point.entry.id}`, kind: LaneKind.ENTRY, node: node.id, limit, next: [ring[i].id] },
        join(lane_end_pose(point.entry), at(point.angle))
      );
      point.entry.next.push(lane.id);
      made.push(lane);
    }
    if (point.exit) {
      const lane = make_lane(
        { id: `${node.id}:out:${point.exit.id}`, kind: LaneKind.EXIT, node: node.id, limit, next: [point.exit.id], turn: Turn.RIGHT },
        join(at(point.angle), lane_start_pose(point.exit))
      );
      previous.next.push(lane.id);
      made.push(lane);
    }
  });
  return made;
}

function road_box(road: Road, from_side: number, to_side: number): Polygon {
  const n = right_of(road.u);
  return [add(road.a, mul(n, from_side)), add(road.b, mul(n, from_side)), add(road.b, mul(n, to_side)), add(road.a, mul(n, to_side))];
}

function stretch(road: Road, from: number, to: number, side_from: number, side_to: number): Polygon {
  const n = right_of(road.u);
  const p = (along: number, side: number) => add(add(road.a, mul(road.u, along)), mul(n, side));
  return [p(from, side_from), p(to, side_from), p(to, side_to), p(from, side_to)];
}

function centre_lines(road: Road, nodes: Record<string, Node>): Line[] {
  const n = right_of(road.u);
  const offset = 0;
  const along = (s: number) => add(add(road.a, mul(road.u, s)), mul(n, offset));
  const solid_from = nodes[road.from].kind === NodeKind.BEND ? 0 : SOLID_RUN;
  const solid_to = nodes[road.to].kind === NodeKind.BEND ? 0 : SOLID_RUN;
  const lines: Line[] = [];
  // A one-way road's divider runs solid only into the junction its lanes are sorted for.
  const head = road.one_way ? 0 : solid_from;
  if (head > 0) lines.push({ a: along(0), b: along(head), solid: true });
  lines.push({ a: along(head), b: along(road.length - (road.one_way ? 20 : solid_to)), solid: false });
  if (road.one_way || solid_to > 0) lines.push({ a: along(road.length - (road.one_way ? 20 : solid_to)), b: along(road.length), solid: true });
  return lines;
}

function stop_line(lane: Lane, offset: number, across: [number, number]): StopLine {
  const end = lane_end_pose(lane);
  const n = right_of(unit(end.heading));
  const centre = add(end, mul(n, -offset));
  return { a: add(centre, mul(n, across[0])), b: add(centre, mul(n, across[1])), kind: lane.control!.kind, lane: lane.id };
}

function zebra(road: Road, at: number): Polygon {
  return stretch(road, at - 1.5, at + 1.5, -HALF, HALF);
}

function sign_post(lane: Lane, back: number, kind: SignKind, value?: number): Sign {
  const end = lane_end_pose(lane);
  const u = unit(end.heading);
  const at = add(add(end, mul(u, -back)), mul(right_of(u), HALF - LANE / 2 + 1.6));
  return { kind, at, facing: end.heading, value };
}

function start_sign(lane: Lane, ahead: number, kind: SignKind, value?: number): Sign {
  const start = lane_start_pose(lane);
  const u = unit(start.heading);
  const offset = (lane.index ?? 0) === 0 ? LANE / 2 : -LANE / 2;
  const at = add(add(start, mul(u, ahead)), mul(right_of(u), HALF - offset + 1.6));
  return { kind, at, facing: start.heading, value };
}

function lot_bays(): { bays: Polygon[]; target: Bay; cars: Solid[] } {
  const bays: Polygon[] = [];
  const cars: Solid[] = [];
  let target: Bay | null = null;
  const vehicles = [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.HATCH, Vehicle.PICKUP];
  for (const [row, facing] of [
    [ROW_NORTH, Math.PI / 2],
    [ROW_SOUTH, -Math.PI / 2],
  ] as const) {
    for (let i = 0; i < BAY_COUNT; i++) {
      const x0 = BAYS_FROM + BAY_WIDTH * i;
      const shape = rect(x0, row.y0, x0 + BAY_WIDTH, row.y1);
      bays.push(shape);
      if (i === TARGET_BAY) {
        if (row === ROW_NORTH) target = { shape, heading: Math.PI / 2, either: true };
        continue;
      }
      // Some bays stand empty, as in any car park; the target's neighbours are taken, as in a real test.
      if ((i * 7 + (row === ROW_NORTH ? 3 : 5)) % 5 === 0) continue;
      const vehicle = vehicles[(i + (row === ROW_NORTH ? 0 : 2)) % vehicles.length];
      const spec = VEHICLES[vehicle];
      const centre = { x: x0 + BAY_WIDTH / 2, y: (row.y0 + row.y1) / 2, heading: (i % 3 === 0 ? facing + Math.PI : facing) };
      cars.push({
        kind: SolidKind.CAR,
        shape: oriented_box(centre.x, centre.y, centre.heading, spec.length, spec.width),
        car: { pose: centre, length: spec.length, width: spec.width, paint: i + (row === ROW_NORTH ? 1 : 3), vehicle },
      });
    }
  }
  return { bays, target: target!, cars };
}

function layby_cars(road: Road): Solid[] {
  if (!road.layby) return [];
  const n = right_of(road.u);
  const heading = road.layby.side > 0 ? Math.atan2(road.u.y, road.u.x) : Math.atan2(-road.u.y, -road.u.x);
  const vehicles = [Vehicle.HATCH, Vehicle.VAN, Vehicle.CITY, Vehicle.SUV, Vehicle.HATCH, Vehicle.PICKUP, Vehicle.CITY];
  return road.layby.cars.map((along, i) => {
    const vehicle = vehicles[i % vehicles.length];
    const spec = VEHICLES[vehicle];
    const centre = add(add(road.a, mul(road.u, along)), mul(n, road.layby!.side * (HALF + LAYBY / 2)));
    const pose = { ...centre, heading };
    return {
      kind: SolidKind.CAR,
      shape: oriented_box(pose.x, pose.y, heading, spec.length, spec.width),
      car: { pose, length: spec.length, width: spec.width, paint: i + 2, vehicle },
    };
  });
}

function block(x0: number, y0: number, x1: number, y1: number): Polygon {
  return rect(x0, y0, x1, y1);
}

const BUILDINGS: Polygon[] = [
  block(34, -60, 104, -45),
  block(112, -34, 168, -10),
  block(176, -40, 268, -10),
  block(-34, -40, -10, -10),
  block(10, 10, 60, 40),
  block(10, 52, 60, 90),
  block(72, 10, 130, 90),
  block(150, 10, 210, 50),
  block(150, 60, 210, 90),
  block(220, 10, 255, 70),
  block(305, 10, 390, 60),
  block(318, 70, 390, 90),
  block(10, 112, 128, 150),
  block(10, 160, 60, 190),
  block(72, 160, 128, 190),
  block(150, 110, 200, 150),
  block(210, 110, 250, 150),
  block(150, 160, 270, 188),
  block(305, 125, 390, 190),
  block(-34, 110, -10, 190),
  block(410, 10, 432, 190),
  block(10, 210, 130, 232),
  block(150, 210, 270, 232),
  block(290, 210, 390, 232),
];

export function build_town(): Town {
  const nodes = Object.fromEntries(NODES.map((node) => [node.id, node]));
  const roads: Record<string, Road> = {};
  for (const def of ROADS) {
    const from = nodes[def.from];
    const to = nodes[def.to];
    const axis = sub(to.at, from.at);
    const length = Math.hypot(axis.x, axis.y);
    const u = mul(axis, 1 / length);
    const a = add(from.at, mul(u, mouth(from)));
    const b = sub(to.at, mul(u, mouth(to)));
    roads[def.id] = { ...def, a, b, u, length: dist(a, b) };
  }
  const lanes: Record<string, Lane> = {};
  for (const road of Object.values(roads)) for (const lane of road_lanes(road)) lanes[lane.id] = lane;
  const lot = lot_lane();
  lanes[lot.id] = lot;

  for (const node of NODES) {
    const incoming = Object.values(lanes).filter((lane) => lane.to === node.id);
    const outgoing = Object.values(lanes).filter((lane) => (lane.kind === LaneKind.ROAD || lane.kind === LaneKind.LOT) && lane.to !== node.id && dist(lane.points[0], node.at) < mouth(node) + 1);
    const made = node.kind === NodeKind.ROUNDABOUT ? roundabout_lanes(node, incoming, outgoing) : junction_lanes(node, incoming, outgoing);
    for (const lane of made) lanes[lane.id] = lane;
  }

  const lines: Line[] = [];
  const stops: StopLine[] = [];
  const paved: Polygon[] = [];
  const solids: Solid[] = [];
  for (const road of Object.values(roads)) {
    lines.push(...centre_lines(road, nodes));
    if (road.layby) {
      const side = road.layby.side;
      paved.push(stretch(road, road.layby.from, road.layby.to, side * HALF, side * (HALF + LAYBY)));
      solids.push(...layby_cars(road));
    }
  }
  for (const lane of Object.values(lanes)) {
    if (lane.kind !== LaneKind.ROAD && lane.kind !== LaneKind.LOT) continue;
    if (!lane.control) continue;
    if (lane.kind === LaneKind.LOT) {
      stops.push(stop_line(lane, 0, [-HALF, HALF]));
      continue;
    }
    const road = roads[lane.road!];
    if (road.one_way && lane.index !== 0) continue;
    stops.push(stop_line(lane, offsets(road)[0], road.one_way ? [-HALF, HALF] : [0, HALF]));
  }

  const lot_shape = rect(LOT.x0, LOT.y0, LOT.x1, LOT.y1);
  paved.push(lot_shape);
  const parking = lot_bays();
  solids.push(...parking.cars);
  solids.push(...BUILDINGS.map((shape) => ({ kind: SolidKind.WALL, shape })));

  const lane = (id: string) => lanes[id];
  const signs: Sign[] = [
    sign_post(lane("DE>D:0"), 1, SignKind.STOP),
    ...["CF>F:0", "EF>F:0", "FJ>F:0", "FG>F:0", "EI>I:0", "FJ>J:0"].map((id) => sign_post(lane(id), 1, SignKind.GIVE_WAY)),
    sign_post(lane(`${LOT_ROAD}>Q1:0`), 0.5, SignKind.GIVE_WAY),
    { kind: SignKind.NO_ENTRY, at: { x: 140 - HALF - 1.6, y: 100 - MOUTH + 1 }, facing: -Math.PI / 2 },
    { kind: SignKind.NO_ENTRY, at: { x: 140 + HALF + 1.6, y: 100 - MOUTH + 1 }, facing: -Math.PI / 2 },
    { kind: SignKind.ONE_WAY, at: { x: 140 - HALF - 1.6, y: MOUTH + 2 }, facing: Math.PI / 2 },
    { kind: SignKind.ONE_WAY, at: { x: 140 + HALF + 1.6, y: MOUTH + 2 }, facing: Math.PI / 2 },
    start_sign(lane("HI>I:0"), 4, SignKind.SPEED, 30),
    start_sign(lane("HI>H:0"), 4, SignKind.SPEED, 30),
    start_sign(lane("IJ>J:0"), 4, SignKind.SPEED, 30),
    start_sign(lane("IJ>I:0"), 4, SignKind.SPEED, 30),
    start_sign(lane("DH>D:0"), 4, SignKind.SPEED, 50),
    start_sign(lane("EI>E:0"), 4, SignKind.SPEED, 50),
    start_sign(lane("FJ>F:0"), 4, SignKind.SPEED, 50),
    start_sign(lane("JK>K:0"), 4, SignKind.SPEED, 50),
    start_sign(lane(`${LOT_ROAD}>Q1:0`), 3, SignKind.SPEED, 10),
  ];

  const lights: LightPost[] = [];
  for (const [id, control] of Object.entries(CONTROLS)) {
    if (control.kind !== ControlKind.LIGHTS) continue;
    const road = roads[id.split(">")[0]];
    const sample = lanes[`${id}:0`];
    const end = lane_end_pose(sample);
    const u = unit(end.heading);
    const offset = offsets(road)[0];
    const at = add(add(end, mul(u, -0.8)), mul(right_of(u), HALF - offset + 1.2));
    lights.push({ at, facing: end.heading, group: control.group ?? 0 });
  }

  const arrows: Arrow[] = [];
  for (const id of ["BE>E:0", "BE>E:1"]) {
    const approach = lanes[id];
    const turns = [...new Set(approach.next.map((next) => lanes[next].turn ?? Turn.STRAIGHT))];
    const end = lane_end_pose(approach);
    arrows.push({ at: add(end, mul(unit(end.heading), -8)), heading: end.heading, turns });
  }

  const zebras = [zebra(roads.DE, 62), zebra(roads.EI, 46), zebra(roads.IJ, 60)];
  const xs = BUILDINGS.flatMap((shape) => shape.map((p) => p.x));
  const ys = BUILDINGS.flatMap((shape) => shape.map((p) => p.y));
  const bounds = { x0: Math.min(...xs) - 4, y0: Math.min(...ys) - 4, x1: Math.max(...xs) + 4, y1: Math.max(...ys) + 4 };

  return { nodes, roads, lanes, bounds, paved, lot: lot_shape, bay: parking.target, solids, buildings: BUILDINGS, lines, stops, zebras, signs, lights, arrows, bays: parking.bays };
}

let cached: Town | null = null;

export function town(): Town {
  return (cached ??= build_town());
}

function in_junction(node: Node, p: Vec, arms: { n: boolean; e: boolean; s: boolean; w: boolean }): boolean {
  const dx = p.x - node.at.x;
  const dy = p.y - node.at.y;
  if (Math.abs(dx) > MOUTH || Math.abs(dy) > MOUTH) return false;
  const out_x = Math.abs(dx) > HALF;
  const out_y = Math.abs(dy) > HALF;
  if (!out_x && !out_y) return true;
  const side_x = dx > 0 ? arms.e : arms.w;
  const side_y = dy > 0 ? arms.s : arms.n;
  if (out_x && !out_y) return side_x;
  if (out_y && !out_x) return side_y;
  if (!side_x || !side_y) return false;
  return Math.hypot(Math.abs(dx) - MOUTH, Math.abs(dy) - MOUTH) >= FILLET;
}

const arms_cache = new WeakMap<Town, Record<string, { n: boolean; e: boolean; s: boolean; w: boolean }>>();

function node_arms(town: Town): Record<string, { n: boolean; e: boolean; s: boolean; w: boolean }> {
  let found = arms_cache.get(town);
  if (found) return found;
  found = {};
  for (const node of Object.values(town.nodes)) found[node.id] = { n: false, e: false, s: false, w: false };
  for (const road of Object.values(town.roads)) {
    for (const [id, toward] of [
      [road.from, road.u],
      [road.to, mul(road.u, -1)],
    ] as const) {
      const arms = found[id];
      if (Math.abs(toward.x) > Math.abs(toward.y)) arms[toward.x > 0 ? "e" : "w"] = true;
      else arms[toward.y > 0 ? "s" : "n"] = true;
    }
  }
  for (const id of ["Q1", "Q2"]) found[id].n = true;
  arms_cache.set(town, found);
  return found;
}

function inside_rect(p: Vec, shape: Polygon): boolean {
  let inside = true;
  for (let i = 0; i < shape.length && inside; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    inside = cross >= -1e-9;
  }
  if (inside) return true;
  inside = true;
  for (let i = 0; i < shape.length && inside; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    inside = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) <= 1e-9;
  }
  return inside;
}

function in_roundabout(node: Node, p: Vec): boolean {
  const dx = p.x - node.at.x;
  const dy = p.y - node.at.y;
  const r = Math.hypot(dx, dy);
  if (r < ISLAND) return false;
  if (r <= RING_OUT) return true;
  if (r > ROUND_MOUTH + 0.5) return false;
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (along < 10) continue;
    const room = along >= ROUND_MOUTH ? HALF : HALF + ((ROUND_MOUTH - along) / (ROUND_MOUTH - 12)) * 5.5;
    if (across <= Math.min(room, 9)) return true;
  }
  return false;
}

export function on_road(town: Town, p: Vec): boolean {
  for (const road of Object.values(town.roads)) {
    const d = sub(p, road.a);
    const along = d.x * road.u.x + d.y * road.u.y;
    if (along < -0.01 || along > road.length + 0.01) continue;
    const across = Math.abs(-d.x * road.u.y + d.y * road.u.x);
    if (across <= HALF) return true;
  }
  const arms = node_arms(town);
  for (const node of Object.values(town.nodes)) {
    if (node.kind === NodeKind.ROUNDABOUT) {
      if (in_roundabout(node, p)) return true;
    } else if (in_junction(node, p, arms[node.id])) return true;
  }
  return town.paved.some((shape) => inside_rect(p, shape));
}

export function road_shape(road: Road): Polygon {
  return road_box(road, -HALF, HALF);
}

export function pavement_shape(road: Road): Polygon {
  return road_box(road, -HALF - PAVEMENT, HALF + PAVEMENT);
}
