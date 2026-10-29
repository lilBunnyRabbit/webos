import type { Vec } from "../../core/geometry";

// Slow enough that a flick of the wheel doesn't swing the board (the owner disliked a twitchy view), quick enough that
// the car still points up out of a hairpin.
const TURN_RATE = 2.5;

function wrap(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function heading_up(heading: number): number {
  return wrap(-Math.PI / 2 - heading);
}

export function ease_turn(current: number, target: number, dt: number): number {
  return wrap(current + wrap(target - current) * (1 - Math.exp(-dt * TURN_RATE)));
}

export function unturn(screen: Vec, turn: number): Vec {
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return { x: screen.x * cos + screen.y * sin, y: -screen.x * sin + screen.y * cos };
}
