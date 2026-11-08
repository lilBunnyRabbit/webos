import { angle_between, wrap_angle, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { obstacles } from "../../core/obstacles";
import { inflate, plan, type Move } from "../../core/planner";
import { DriveKind, Gear, top_speed, travel, type Input, type Placement } from "../../core/vehicle";
import { Axis, Cut, each_cell, Pattern, type Grid } from "./coverage";
import { deck_corners } from "./deck";
import { advance, can_finish, change_gear, create_game, finish, measure, pattern_of, rig_of, set_status, Status, tidy, type GameState, type Round } from "./game";
import { in_the_way } from "./reach";

// Test only. A driver mows a level with the zero-turn through the real `advance` at the game's step, closed loop, and
// presses Finish as soon as the round's stars allow. Passes run the pattern's way (the long way without one), from the
// side nearest the start, each turning into the next where the turn clears; what they leave is mown greedily, the
// cheapest seconds per cell first. On a stripe level the passes across go first, so the stripes are the last cut.
// It isn't an expert: it's the same driver on every level, so its time over par compares levels with each other.

/** The driver's time over par is at most this on levels 1–12 (3.22, level 7); later levels are held to the same. */
export const WORST_GROWING = 3.25;

const DT = 1 / 120;
const LIMIT_MS = 20 * 60 * 1000;
const SAMPLE = 0.2;
const ROW_MARGIN = 0.2;
const NEAR_MARGIN = 0.08;
const SPACING = 1.3;
const FOOT = 0.3;
const THRESHOLD = 12;
const CHECK_EVERY = 30;

interface Family {
  angle: number;
  phase: number;
}

interface Interval {
  family: number;
  offset: number;
  heading: number;
  from: number;
  to: number;
  feet: { at: number; cells: Int32Array }[];
  turns: Map<number, number>;
}

interface Candidate {
  interval: Interval;
  from: number;
  to: number;
  gain: number;
}

interface Turn {
  path: Placement[];
  from: number;
  width: number;
}

type Gain = (grid: Grid, i: number) => boolean;

const Piece = { MOVE: "move", PIVOT: "pivot" } as const;

interface MovePiece {
  kind: typeof Piece.MOVE;
  path: Placement[];
  lengths: number[];
  bends: number[];
  direction: 1 | -1;
}

interface PivotPiece {
  kind: typeof Piece.PIVOT;
  heading: number;
  way: number;
}

type DrivePiece = MovePiece | PivotPiece;

export interface Mowed {
  state: GameState;
  done: boolean;
  ms: number;
}

function along(angle: number, offset: number, s: number): Vec {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return { x: offset * -uy + s * ux, y: offset * ux + s * uy };
}

function move_piece(path: Placement[], direction: 1 | -1): MovePiece {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  const bends = path.map((_, i) => {
    const j = Math.min(path.length - 1, i + 4);
    return j === i ? 0 : angle_between(path[i].heading, path[j].heading) / Math.max(0.05, lengths[j] - lengths[i]);
  });
  return { kind: Piece.MOVE, path, lengths, bends, direction };
}

function line_piece(a: Pose, b: Pose, direction: 1 | -1): MovePiece {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
  const path: Placement[] = [];
  for (let i = 0; i <= n; i++) path.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, heading: a.heading });
  return move_piece(path, direction);
}

/** Mows a zero-turn level to the finish; the tractor's towed deck needs reversing this driver doesn't do. */
export function mow_level(round: Round): Mowed {
  const rig = rig_of(round);
  const spec = rig.spec;
  if (spec.drive.kind !== DriveKind.SKID) throw new Error("The proof driver mows with a skid steer only");
  const track = spec.drive.track;
  let state = change_gear(set_status(measure(create_game(round)), Status.DRIVING), Gear.DRIVE);
  const { garden, grid } = state;
  const pattern = pattern_of(round);
  const near = obstacles(garden);
  const row_way = in_the_way(garden, inflate(spec, ROW_MARGIN), true);
  const near_way = in_the_way(garden, inflate(spec, NEAR_MARGIN), true);
  const bare_way = in_the_way(garden, spec, true);
  // Where the mower stands now only the bare body counts: it may have stopped nearer than the margin.
  let here: Placement | null = null;
  const blocked = (pose: Placement, close = false) =>
    close
      ? here && Math.hypot(pose.x - here.x, pose.y - here.y) < 0.05 && angle_between(pose.heading, here.heading) < 0.05
        ? bare_way(pose)
        : near_way(pose)
      : row_way(pose);

  const main = pattern === Pattern.EAST_WEST ? 0 : pattern === Pattern.NORTH_SOUTH ? Math.PI / 2 : garden.width >= garden.height ? 0 : Math.PI / 2;
  const families: Family[] =
    pattern === Pattern.CHECKER
      ? [
          { angle: 0, phase: 1 },
          { angle: Math.PI / 2, phase: 2 },
        ]
      : [
          { angle: main, phase: 1 },
          { angle: main + Math.PI / 2, phase: pattern ? 0 : 3 },
        ];
  for (const bank of garden.banks) {
    const fall = ((bank.fall % Math.PI) + Math.PI) % Math.PI;
    if (families.every((family) => angle_between(family.angle, fall) > 0.05 && angle_between(family.angle + Math.PI, fall) > 0.05)) {
      families.push({ angle: fall, phase: pattern ? 0 : 3 });
    }
  }

  // Every offset across the garden at the pass spacing, both ways, split where the body won't fit.
  const half = spec.width / 2;
  const intervals: Interval[] = [];
  const offsets: number[][] = [];
  const corners = [
    { x: 0, y: 0 },
    { x: garden.width, y: 0 },
    { x: 0, y: garden.height },
    { x: garden.width, y: garden.height },
  ];
  families.forEach((family, f) => {
    const ux = Math.cos(family.angle);
    const uy = Math.sin(family.angle);
    const ss = corners.map((p) => p.x * ux + p.y * uy);
    const os = corners.map((p) => -p.x * uy + p.y * ux);
    const o0 = Math.min(...os) + half + ROW_MARGIN + 0.02;
    const o1 = Math.max(...os) - half - ROW_MARGIN - 0.02;
    const count = Math.max(1, Math.ceil((o1 - o0) / SPACING) + 1);
    const step = count > 1 ? (o1 - o0) / (count - 1) : 0;
    offsets[f] = Array.from({ length: count }, (_, k) => o0 + k * step);
    const s0 = Math.min(...ss);
    const s1 = Math.max(...ss);
    for (const offset of offsets[f]) {
      for (const sign of [1, -1]) {
        const heading = wrap_angle(family.angle + (sign > 0 ? 0 : Math.PI));
        let start: number | null = null;
        let last = s0;
        const close = () => {
          if (start === null) return;
          const from = sign > 0 ? start : last;
          const to = sign > 0 ? last : start;
          if (Math.abs(to - from) >= 0.6) intervals.push({ family: f, offset, heading, from, to, feet: [], turns: new Map() });
          start = null;
        };
        for (let s = s0; s <= s1; s += SAMPLE) {
          if (blocked({ ...along(family.angle, offset, s), heading })) close();
          else {
            start ??= s;
            last = s;
          }
        }
        close();
      }
    }
  });
  const pose_on = (interval: Interval, s: number): Placement => ({ ...along(families[interval.family].angle, interval.offset, s), heading: interval.heading });
  for (const interval of intervals) {
    const sign = Math.sign(interval.to - interval.from) || 1;
    const length = Math.abs(interval.to - interval.from);
    for (let d = 0; d <= length + 1e-9; d += FOOT) {
      const at = interval.from + sign * d;
      const cells: number[] = [];
      each_cell(grid, deck_corners(pose_on(interval, at), rig.deck), (i) => {
        if (grid.coverable[i]) cells.push(i);
      });
      interval.feet.push({ at, cells: Int32Array.from(cells) });
    }
  }
  // A turn of the wheel to the right raises the offset when the pass runs along its family's axis.
  const neighbour_sign = (interval: Interval) => (angle_between(interval.heading, families[interval.family].angle) < 0.1 ? 1 : -1);

  const u_turn = (from: Placement, side: number, width: number): Placement[] | null => {
    const r = width / 2;
    const steer = side * (track / (2 * r + track));
    const path: Placement[] = [from];
    const outer = (Math.PI * r) / (1 - Math.abs(steer));
    const pieces = Math.ceil(outer / 0.1);
    let at = from;
    for (let p = 0; p < pieces; p++) path.push((at = travel(at, steer, outer / pieces, spec)));
    for (let i = 0; i < path.length; i += 2) if (blocked(path[i])) return null;
    return path;
  };
  // Where a pass can end and still turn into the next one on `side`: cut back up to 3 m until the turn clears.
  const turn_end = (interval: Interval, side: number): number => {
    const cached = interval.turns.get(side);
    if (cached !== undefined) return cached;
    const sign = Math.sign(interval.to - interval.from) || 1;
    let end = interval.to;
    for (let back = 0; back <= Math.min(3, Math.abs(interval.to - interval.from)); back += 0.3) {
      const s = interval.to - sign * back;
      if (u_turn(pose_on(interval, s), side, SPACING)) {
        end = s;
        break;
      }
    }
    interval.turns.set(side, end);
    return end;
  };

  const main_reach = new Uint8Array(grid.coverable.length);
  for (const interval of intervals) {
    if (families[interval.family].phase !== 1) continue;
    const sign = Math.sign(interval.to - interval.from) || 1;
    const end = sign * Math.max(sign * turn_end(interval, 1), sign * turn_end(interval, -1));
    for (const f of interval.feet) if (sign * f.at <= sign * end + 1e-9) for (const i of f.cells) main_reach[i] = 1;
  }
  const want = pattern === Pattern.NORTH_SOUTH ? Axis.Y : Axis.X;
  const gains: Gain[] = [
    (g, i) => g.cut[i] === Cut.LONG && !main_reach[i],
    pattern === Pattern.CHECKER
      ? (g, i) => !(g.crossed[i] & Axis.X)
      : pattern
        ? (g, i) => g.cut[i] === Cut.LONG || (!g.bank[i] && g.axis[i] !== want)
        : (g, i) => g.cut[i] === Cut.LONG,
    (g, i) => !(g.crossed[i] & Axis.Y),
    (g, i) => g.cut[i] === Cut.LONG,
  ];
  const stamp = new Uint32Array(grid.coverable.length);
  let stamped = 0;
  const done_ids = new Set<string>();
  const id_of = (c: Candidate) => `${c.interval.family}:${c.interval.offset.toFixed(2)}:${c.interval.heading.toFixed(2)}:${c.from.toFixed(1)}`;

  // Each pass trimmed to the cells it would still gain this phase, from a little before the first to the last.
  const candidates = (phase: number): Candidate[] => {
    const gain = gains[phase];
    const found: Candidate[] = [];
    for (const interval of intervals) {
      if (phase < 3 && families[interval.family].phase !== phase) continue;
      let first = -1;
      let last = -1;
      let count = 0;
      stamped++;
      interval.feet.forEach((f, n) => {
        let any = false;
        for (const i of f.cells) {
          if (stamp[i] === stamped || !gain(grid, i)) continue;
          stamp[i] = stamped;
          count++;
          any = true;
        }
        if (!any) return;
        if (first < 0) first = n;
        last = n;
      });
      if (count < (phase === 3 ? THRESHOLD : THRESHOLD * 4)) continue;
      const sign = Math.sign(interval.to - interval.from) || 1;
      const clamp = (s: number) => (sign > 0 ? Math.min(interval.to, Math.max(interval.from, s)) : Math.max(interval.to, Math.min(interval.from, s)));
      const candidate = { interval, from: clamp(interval.feet[first].at - sign * 0.3), to: clamp(interval.feet[last].at + sign * 0.3), gain: count };
      if (!done_ids.has(id_of(candidate))) found.push(candidate);
    }
    return found;
  };
  const start_of = (c: Candidate) => pose_on(c.interval, c.from);
  const end_of = (c: Candidate) => pose_on(c.interval, c.to);

  let row_end: { interval: Interval; at: number } | null = null;
  const turns = new Map<Candidate, Turn | null>();
  const turn_into = (candidate: Candidate): Turn | null => {
    if (!row_end) return null;
    const known = turns.get(candidate);
    if (known !== undefined) return known;
    let found: Turn | null = null;
    const { interval } = candidate;
    const last = row_end.interval;
    const sign = Math.sign(interval.to - interval.from) || 1;
    const across = (interval.offset - last.offset) * neighbour_sign(last);
    const width = Math.abs(across);
    const s = row_end.at;
    if (
      interval.family === last.family &&
      angle_between(interval.heading, last.heading + Math.PI) < 0.05 &&
      width >= 0.6 &&
      width <= SPACING * 3.5 &&
      sign * s >= sign * interval.from - 0.01 &&
      sign * s <= sign * candidate.to - 0.5
    ) {
      const path = u_turn(pose_on(last, s), Math.sign(across), width);
      if (path) found = { path, from: s, width };
    }
    turns.set(candidate, found);
    return found;
  };
  const top = top_speed(spec);
  const estimate = (candidate: Candidate) => {
    const turn = turn_into(candidate);
    const to = start_of(candidate);
    const car = state.car;
    const reach = turn ? (Math.PI * turn.width) / 2 / 1.3 : Math.hypot(to.x - car.x, to.y - car.y) / 2 + angle_between(to.heading, car.heading) / 1.2 + 4;
    return (reach + Math.abs(candidate.to - candidate.from) / top) / candidate.gain;
  };

  // Connectors: straight legs between pivots, each leg forward or back, through at most two waypoints; the quickest
  // guess that clears. The core planner is the last resort.
  const sweep_of = (from: number, to: number, way: number) => {
    const turn = (((way * (to - from)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return turn > 2 * Math.PI - 0.2 ? 0 : turn;
  };
  const pivot_to = (at: Pose, to: number): PivotPiece | null => {
    const short = wrap_angle(to - at.heading) >= 0 ? 1 : -1;
    next: for (const way of [short, -short]) {
      const turn = sweep_of(at.heading, to, way);
      for (let a = 0; a <= turn; a += 0.08) if (blocked({ x: at.x, y: at.y, heading: at.heading + way * a }, true)) continue next;
      if (blocked({ x: at.x, y: at.y, heading: to }, true)) continue;
      return { kind: Piece.PIVOT, heading: to, way };
    }
    return null;
  };
  const line_ok = (a: Pose, b: Pose) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0; d <= length; d += 0.15) {
      const t = length === 0 ? 0 : d / length;
      if (blocked({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: a.heading }, true)) return false;
    }
    return true;
  };
  const legs = (from: Pose, points: Vec[], directions: readonly (1 | -1)[], to: Pose): DrivePiece[] | null => {
    const pieces: DrivePiece[] = [];
    let at: Pose = from;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (Math.hypot(p.x - at.x, p.y - at.y) < 0.05) continue;
      const facing = Math.atan2(p.y - at.y, p.x - at.x) + (directions[i] < 0 ? Math.PI : 0);
      if (angle_between(at.heading, facing) > 0.03) {
        const turn = pivot_to(at, facing);
        if (!turn) return null;
        pieces.push(turn);
      }
      const a = { x: at.x, y: at.y, heading: facing };
      const b = { x: p.x, y: p.y, heading: facing };
      if (!line_ok(a, b)) return null;
      pieces.push(line_piece(a, b, directions[i]));
      at = b;
    }
    if (angle_between(at.heading, to.heading) > 0.03) {
      const turn = pivot_to(at, to.heading);
      if (!turn) return null;
      pieces.push(turn);
    }
    return pieces;
  };
  const guess = (from: Pose, points: Vec[], directions: readonly (1 | -1)[], to: Pose): number => {
    let at: Vec = from;
    let heading = from.heading;
    let time = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const facing = Math.atan2(p.y - at.y, p.x - at.x) + (directions[i] < 0 ? Math.PI : 0);
      const turn = angle_between(heading, facing);
      time += (turn > 0.03 ? 1.4 + turn / 1.6 : 0) + Math.hypot(p.x - at.x, p.y - at.y) / (directions[i] > 0 ? 2.2 : 1) + 0.6;
      heading = facing;
      at = p;
    }
    const turn = angle_between(heading, to.heading);
    return time + (turn > 0.03 ? 1.4 + turn / 1.6 : 0);
  };
  const BOTH = [1, -1] as const;
  const direct = (from: Pose, to: Pose): DrivePiece[] | null => {
    const options: { points: Vec[]; directions: (1 | -1)[]; time: number }[] = [];
    const add = (points: Vec[], directions: (1 | -1)[]) => options.push({ points, directions, time: guess(from, points, directions, to) });
    const ahead = (pose: Pose, k: number) => ({ x: pose.x + Math.cos(pose.heading) * k, y: pose.y + Math.sin(pose.heading) * k });
    for (const d of BOTH) add([to], [d]);
    const ways: Vec[] = [];
    for (const k of [0.6, 1.2, 2, 3]) ways.push(ahead(to, k), ahead(from, -k), ahead(from, k));
    for (let x = 0.5; x < garden.width; x += 0.75) for (let y = 0.5; y < garden.height; y += 0.75) ways.push({ x, y });
    for (const w of ways) for (const d0 of BOTH) for (const d1 of BOTH) add([w, to], [d0, d1]);
    for (const k0 of [-2, -1.2, -0.6, 0.6, 1.2, 2]) {
      for (const k1 of [0.6, 1.2, 2, 3]) for (const d of BOTH) add([ahead(from, k0), ahead(to, k1), to], [k0 > 0 ? 1 : -1, d, -1]);
    }
    options.sort((a, b) => a.time - b.time);
    for (const option of options.slice(0, 400)) {
      const found = legs(from, option.points, option.directions, to);
      if (found) return found;
    }
    return null;
  };
  const planned = (from: Placement, to: Placement): DrivePiece[] | null => {
    here = from;
    try {
      const quick = direct(from, to);
      if (quick) return quick;
      const found = plan(from, to, near, { spec, reach: 0.3, heading_tolerance: 0.15, max_expansions: 60_000, blocked: (pose) => blocked(pose, true) });
      if (!found) return null;
      const pieces: DrivePiece[] = [];
      let at: Placement = from;
      let run: Move[] = [];
      const flush = () => {
        if (run.length === 0) return;
        const path: Placement[] = [at];
        for (const move of run) {
          const n = Math.max(1, Math.ceil(Math.abs(move.distance) / 0.1));
          for (let p = 0; p < n; p++) path.push((at = travel(at, move.steer, move.distance / n, spec)));
        }
        pieces.push(move_piece(path, run[0].distance > 0 ? 1 : -1));
        run = [];
      };
      for (const move of found.moves) {
        if (Math.abs(move.steer) > 0.99) {
          flush();
          at = travel(at, move.steer, move.distance, spec);
          pieces.push({ kind: Piece.PIVOT, heading: at.heading, way: Math.sign(move.steer * move.distance) });
        } else {
          if (run.length > 0 && Math.sign(run[0].distance) !== Math.sign(move.distance)) flush();
          run.push(move);
        }
      }
      flush();
      const off = Math.hypot(at.x - to.x, at.y - to.y) > 0.06 || angle_between(at.heading, to.heading) > 0.04;
      const rest = off ? direct(at, to) : null;
      return rest ? [...pieces, ...rest] : pieces;
    } finally {
      here = null;
    }
  };

  // The closed loop: pure pursuit over a move, the wheel held over for a pivot, pedals that stop in time.
  const pedals = (speed: number, target: number) => {
    const hold = Math.min(1, spec.rolling / (spec.accel * Math.max(0.05, 1 - target / spec.max_forward)));
    const throttle = target <= 0.01 ? 0 : Math.max(0, Math.min(1, hold + 1.5 * (target - speed)));
    const brake = speed > target + 0.06 ? Math.max(0.2, Math.min(1, (speed - target) * 1.2)) : target <= 0.01 ? 1 : 0;
    return { throttle, brake };
  };
  let steps = 0;
  const tick = (input: Input): boolean => {
    state = advance(state, input, DT);
    steps++;
    if (state.status !== Status.DRIVING) return false;
    if (steps % CHECK_EVERY === 0 && can_finish(state) && (!pattern || tidy(state))) {
      state = finish(state);
      return false;
    }
    return state.ms < LIMIT_MS;
  };
  const stop = (): boolean => {
    while (Math.abs(state.car.speed) > 0.02) if (!tick({ steer: state.car.steer, throttle: 0, brake: 1 })) return false;
    return true;
  };
  const gear_for = (direction: number): boolean => {
    const gear = direction > 0 ? Gear.DRIVE : Gear.REVERSE;
    if (state.car.gear === gear) return true;
    if (!stop()) return false;
    state = change_gear(state, gear);
    return true;
  };
  const pivot = (piece: PivotPiece): boolean => {
    if (!gear_for(1)) return false;
    const goal = state.car.heading + piece.way * sweep_of(state.car.heading, piece.heading, piece.way);
    for (let guard = 0; guard < 4000; guard++) {
      const error = goal - state.car.heading;
      const spin = (2 * state.car.speed) / track;
      if (Math.abs(error) < 0.02 || Math.abs(error) <= (spin * spin) / 6 + Math.abs(spin) * 0.12) {
        if (!stop()) return false;
        if (Math.abs(goal - state.car.heading) < 0.04) return true;
      }
      const way = Math.sign(goal - state.car.heading);
      if (Math.abs(state.car.steer - way) > 0.04) {
        if (Math.abs(state.car.speed) > 0.02 && !stop()) return false;
        if (!tick({ steer: way, throttle: 0, brake: 1 })) return false;
        continue;
      }
      const omega = Math.min(2.6, Math.sqrt(2 * 4 * Math.abs(goal - state.car.heading)));
      if (!tick({ steer: way, ...pedals(state.car.speed, (omega * track) / 2) })) return false;
      if (state.bumped) return false;
    }
    return true;
  };
  const follow = (piece: MovePiece, halt: boolean): boolean => {
    const { path, lengths, bends, direction } = piece;
    const total = lengths[lengths.length - 1];
    const tip = path[path.length - 1];
    if (total < 0.3 && Math.hypot(state.car.x - tip.x, state.car.y - tip.y) < 0.35) return true;
    if (!gear_for(direction)) return false;
    let index = 0;
    for (let guard = 0; guard < 200_000; guard++) {
      const car = state.car;
      let best = Infinity;
      for (let j = index; j < Math.min(path.length, index + 40); j++) {
        const d = (path[j].x - car.x) ** 2 + (path[j].y - car.y) ** 2;
        if (d < best) {
          best = d;
          index = j;
        }
      }
      const past = ((car.x - tip.x) * Math.cos(tip.heading) + (car.y - tip.y) * Math.sin(tip.heading)) * direction;
      const left = index === path.length - 1 ? -past : total - lengths[index];
      const speed = car.speed * direction;
      if (left < 0.08 && (!halt || Math.abs(car.speed) < 0.15)) return true;
      if (left < -0.3) return true;
      const reach = 0.9 + 0.2 * Math.abs(car.speed);
      let m = index;
      while (m < path.length - 1 && lengths[m] - lengths[index] < reach) m++;
      const extra = reach - (lengths[m] - lengths[index]);
      const target = extra <= 0 ? path[m] : { x: tip.x + Math.cos(tip.heading) * extra * direction, y: tip.y + Math.sin(tip.heading) * extra * direction };
      const alpha = wrap_angle(Math.atan2(target.y - car.y, target.x - car.x) - car.heading - (direction < 0 ? Math.PI : 0));
      const q = ((Math.sin(alpha) / Math.max(0.2, Math.hypot(target.x - car.x, target.y - car.y))) * direction * track);
      const steer = Math.abs(alpha) > 1.3 ? Math.sign(q) || 1 : q / (1 + Math.abs(q));
      let goal = direction > 0 ? top : spec.max_reverse * 0.7;
      goal = Math.min(goal, Math.sqrt((halt ? 0 : 1) + 2 * 1.6 * Math.max(0, left - 0.05)));
      for (let j = index; j < path.length && lengths[j] - lengths[index] < (speed * speed) / 4 + 1; j += 2) {
        goal = Math.min(goal, Math.sqrt((bends[j] > 0.6 ? 1.3 : top) ** 2 + 2 * 1.6 * (lengths[j] - lengths[index])));
      }
      if (Math.abs(alpha) > 1.3) goal = Math.min(goal, 0.5);
      if (Math.abs(state.car.steer - steer) > 0.35 && Math.abs(car.speed) < 0.3) {
        if (!tick({ steer, throttle: 0, brake: 1 })) return false;
        continue;
      }
      if (!tick({ steer, ...pedals(speed, goal) })) return false;
      if (state.bumped) return false;
    }
    return true;
  };
  const back_off = (): boolean => {
    const direction = state.car.gear === Gear.REVERSE ? 1 : -1;
    if (!gear_for(direction)) return false;
    for (let t = 0; t < 3 && (state.bumped || blocked(state.car, true)); t += DT) if (!tick({ steer: 0, ...pedals(state.car.speed * direction, 0.6) })) return false;
    return stop();
  };

  const running = () => state.status === Status.DRIVING && state.ms < LIMIT_MS;
  // One pass, `way` the side (by offset) the next one is on; false when no way to its start was found.
  const drive = (candidate: Candidate, way: number | null): boolean => {
    const original = id_of(candidate);
    const turn = turn_into(candidate);
    let pieces: DrivePiece[] | null;
    if (turn) {
      candidate.from = turn.from;
      pieces = [move_piece(turn.path, 1)];
    } else {
      if (!stop()) return true;
      if (blocked(state.car, true) && !back_off()) return true;
      pieces = planned(state.car, start_of(candidate));
    }
    if (!pieces) {
      done_ids.add(original);
      return false;
    }
    if (way !== null) {
      const end = turn_end(candidate.interval, way * neighbour_sign(candidate.interval));
      const sign = Math.sign(candidate.interval.to - candidate.interval.from) || 1;
      if (sign * end > sign * candidate.from + 0.5) candidate.to = sign * Math.min(sign * candidate.to, sign * end);
    }
    const row = line_piece(start_of(candidate), end_of(candidate), 1);
    const first = pieces[0];
    const chained = pieces.length === 1 && first.kind === Piece.MOVE && first.direction === 1;
    const all: DrivePiece[] = pieces.length === 0 ? [row] : chained ? [move_piece([...first.path, ...row.path.slice(1)], 1)] : [...pieces, row];
    let ok = true;
    for (let p = 0; p < all.length && ok; p++) {
      const piece = all[p];
      const next = all[p + 1];
      const halt = piece.kind === Piece.MOVE && (next ? next.kind === Piece.PIVOT || next.direction !== piece.direction : way === null);
      ok = piece.kind === Piece.PIVOT ? pivot(piece) : follow(piece, halt);
    }
    row_end = ok ? { interval: candidate.interval, at: candidate.to } : null;
    if (!ok && running()) back_off();
    done_ids.add(id_of(candidate));
    done_ids.add(original);
    return true;
  };
  // Up and down the garden from the side nearest the mower, each pass turning into the next.
  const sweep = (phase: number) => {
    const f = families.findIndex((family) => family.phase === phase);
    const angle = families[f].angle;
    const rows = offsets[f];
    const at = -state.car.x * Math.sin(angle) + state.car.y * Math.cos(angle);
    const ascending = Math.abs(at - rows[0]) <= Math.abs(at - rows[rows.length - 1]);
    const order = ascending ? rows : [...rows].reverse();
    for (let k = 0; k < order.length && running(); k++) {
      const found = candidates(phase).filter((c) => c.interval.family === f && Math.abs(c.interval.offset - order[k]) < 1e-6);
      turns.clear();
      if (found.length === 0) continue;
      const pick = found.filter((c) => turn_into(c)).sort((a, b) => b.gain - a.gain)[0] ?? [...found].sort((a, b) => estimate(a) - estimate(b))[0];
      drive(pick, k < order.length - 1 ? (ascending ? 1 : -1) : null);
    }
  };
  const greedy = (phase: number) => {
    while (running()) {
      const found = candidates(phase);
      turns.clear();
      if (found.length === 0) return;
      found.sort((a, b) => estimate(a) - estimate(b));
      if (!found.slice(0, 8).some((candidate) => drive(candidate, null))) return;
    }
  };

  if (pattern) greedy(0);
  sweep(1);
  greedy(1);
  if (pattern === Pattern.CHECKER) {
    sweep(2);
    greedy(2);
  }
  greedy(3);
  if (running() && can_finish(state) && (!pattern || tidy(state))) state = finish(state);
  return { state, done: state.status === Status.DONE, ms: state.ms };
}
