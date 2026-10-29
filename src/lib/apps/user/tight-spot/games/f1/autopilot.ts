import { max_steer, steer_base, type Input } from "../../core/vehicle";
import { advance, Status, type GameState } from "./game";
import { SPEC } from "./spec";
import { racing_line } from "./line";

/**
 * The proofs' driver: pure pursuit of the racing line with its speed, through the same `advance` a player drives, from
 * the pedals and the wheel only. It proves each track can be lapped clean and how close to par a lap comes.
 */
export function autopilot(state: GameState, pace = 1): Input {
  const line = racing_line(state.track);
  const n = line.points.length;
  const car = state.car;
  const v = Math.abs(car.speed);
  const target = line.points[(state.at.index + Math.round(Math.max(5, v * 0.55))) % n];
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const side = -dx * Math.sin(car.heading) + dy * Math.cos(car.heading);
  const curvature = (2 * side) / Math.max(1, dx * dx + dy * dy);
  const steer = Math.atan(steer_base(SPEC) * curvature) / max_steer(SPEC);
  const want = pace * line.speed[(state.at.index + Math.round(v * 0.45) + 2) % n];
  return { steer: Math.max(-1, Math.min(1, steer)), throttle: v < want ? 1 : 0, brake: v > want + 0.4 ? 1 : 0 };
}

export function drive_session(state: GameState, pace = 1, dt = 1 / 120, limit_s = 400): GameState {
  let next = state.status === Status.READY ? { ...state, status: Status.DRIVING } : state;
  for (let i = 0; i < limit_s / dt && next.status === Status.DRIVING; i++) {
    next = advance(next, autopilot(next, pace), dt);
  }
  return next;
}
