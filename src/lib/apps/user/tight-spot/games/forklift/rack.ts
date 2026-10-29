import { angle_between, clamp, type Vec } from "../../core/geometry";
import type { Placement } from "../../core/vehicle";
import {
  along,
  BEAM,
  can_lift,
  carried_pose,
  CLEAN,
  contact,
  crash,
  depth_to,
  fork_action,
  fork_fit,
  ForkAction,
  JAM,
  lift_load,
  lower_load,
  MISS,
  near_of,
  placed_in,
  resting,
  SideKind,
  SPEC,
  Status,
  type GameState,
  type SideView,
} from "./game";
import { PALLET, TIER_HEIGHTS, type Slot } from "./warehouse";

export const LIFT_RATE = 0.4;
export const CREEP = 0.3;
export const TRAVEL = 0.1;
/** The forks' underside over the beam, going into a pallet's pockets dead centre. */
export const POCKET = 0.05;
export const CLEARANCE = 0.05;
export const MAST = TIER_HEIGHTS[TIER_HEIGHTS.length - 1] + 0.6;

export { CLEAN, MISS };

export function beam_height(slot: Slot): number {
  return TIER_HEIGHTS[slot.tier];
}

/** The fork height that goes in clean: the tines dead centre in the pockets, or the load just over the beam. */
export function ideal_lift(view: Pick<SideView, "slot" | "kind">): number {
  return beam_height(view.slot) + POCKET + (view.kind === SideKind.DROP ? CLEARANCE : 0);
}

export const Fit = { CLEAN: "clean", SCRAPE: "scrape", HIT: "hit" } as const;
export type Fit = (typeof Fit)[keyof typeof Fit];

export function judge(miss: number): Fit {
  const off = Math.abs(miss);
  return off <= CLEAN ? Fit.CLEAN : off <= MISS ? Fit.SCRAPE : Fit.HIT;
}

/** How far the fork tips (or the load's front) are past the slot's face: 0 at it, a pallet length fully in. */
export function reach(state: Pick<GameState, "car" | "loads" | "current">, view: SideView): number {
  const load = state.loads[state.current];
  if (view.kind === SideKind.PICK) return PALLET.length - fork_fit(state.car, load.pose).gap;
  const pose = carried_pose(state);
  return pose ? PALLET.length - depth_to(pose, view.slot) : 0;
}

/** Standing at the face of an upper tier's slot (`fork_action` says `rack`): the side view opens, forks at travel height. */
export function open_side(state: GameState): GameState {
  if (fork_action(state) !== ForkAction.RACK) return state;
  const task = state.floor.tasks[state.current];
  const carrying = !!state.loads[state.current].carried;
  const from: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  const side: SideView = { slot: carrying ? task.to : task.from, kind: carrying ? SideKind.DROP : SideKind.PICK, lift: TRAVEL, from, miss: null };
  return { ...state, side, car: { ...state.car, speed: 0 } };
}

export function close_side(state: GameState): GameState {
  if (!state.side || reach(state, state.side) > 0) return state;
  return { ...state, side: null, raised: null };
}

export interface SideControls {
  lift: number;
  drive: number;
}

function face_point(state: GameState, view: SideView): Vec {
  const home = view.slot.home;
  const back = PALLET.length / 2;
  return { x: home.x - Math.cos(home.heading) * back, y: home.y - Math.sin(home.heading) * back };
}

/**
 * One step at the rack. The forks go up or down at a fixed rate while they're out, and are held while they're in; the
 * forklift creeps straight in or out, no further back than where the view opened and no further in than fully in. The
 * moment the tips (or the load) pass the face the height is judged: more than `MISS` off hits the pallet or the beam.
 */
export function step_side(state: GameState, controls: SideControls, dt: number): GameState {
  const view = state.side;
  if (state.status !== Status.DRIVING || !view) return state;
  const ms = state.ms + dt * 1000;
  const before = reach(state, view);
  const lift = before > 0 ? view.lift : clamp(view.lift + Math.sign(controls.lift) * LIFT_RATE * dt, 0, MAST);
  const heading = view.slot.heading;
  const cos = Math.max(0.5, Math.cos(angle_between(state.car.heading, heading)));
  const travelled = (state.car.x - view.from.x) * Math.cos(state.car.heading) + (state.car.y - view.from.y) * Math.sin(state.car.heading);
  const room = (PALLET.length - before) / cos;
  const next = clamp(travelled + Math.sign(controls.drive) * CREEP * dt, 0, travelled + room);
  const placed = along(view.from, next);
  const car = { ...state.car, x: placed.x, y: placed.y, speed: 0 };
  let side: SideView = { ...view, lift };
  const moved = { ...state, car, ms, side };
  const after = reach(moved, view);
  if (before <= 0 && after > 0) {
    const miss = lift - ideal_lift(view);
    if (judge(miss) === Fit.HIT) {
      const kind = view.kind === SideKind.PICK && miss > 0 ? JAM : BEAM;
      return crash(moved, car, ms, { kind, at: face_point(state, view), by_load: view.kind === SideKind.DROP });
    }
    side = { ...side, miss };
  } else if (after <= 0) side = { ...side, miss: null };
  const hit = contact(near_of(state.floor), resting(state.loads), car, carried_pose(moved), view.slot, 0, SPEC);
  if (hit) return crash(moved, car, ms, hit);
  return { ...moved, side };
}

export function side_action(state: GameState): ForkAction | null {
  const view = state.side;
  if (state.status !== Status.DRIVING || !view || view.miss === null) return null;
  if (view.kind === SideKind.PICK) return can_lift(fork_fit(state.car, state.loads[state.current].pose)) ? ForkAction.LIFT : null;
  const pose = carried_pose(state);
  return pose && placed_in(pose, view.slot) ? ForkAction.LOWER : null;
}

export function use_side(state: GameState): GameState {
  const action = side_action(state);
  const view = state.side;
  if (!action || !view) return state;
  const base = { ...state, side: null, raised: view.slot };
  return action === ForkAction.LIFT ? lift_load(base, view.miss ?? 0) : lower_load(base, view.miss ?? 0);
}
