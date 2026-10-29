import type { Polygon, Vec } from "../core/geometry";
import { SolidKind } from "../core/scene";
import { Building } from "../games/define";

// A plan's own frame: `u` across the front, `v` out of it, the doorway centred on u = 0 and the front on v = 0, so the
// building lies at negative v. Pieces are convex (the collision test needs it) and stay out of the doorway.
export interface Blueprint {
  pieces: { kind: SolidKind; shape: Polygon }[];
  u0: number;
  u1: number;
  back: number;
}

export const DOOR_HALF = 3;
export const RECESS = 3.5;
export const PLAN_HALF = 7.4;
export const PLAN_DEPTH = 11.4;
// The car park's ramp down: a height bar across the back of its doorway, a lane funnelled in from the doorway's width,
// and the line where a vehicle passes to the floor below, far enough in that a van's nose is still clear of the lane's end.
export const RAMP_HALF = 1.7;
export const RAMP_FUNNEL = 1;
export const RAMP_BAR: [number, number] = [-RECESS - 0.3, -RECESS];
export const RAMP_LINE = -5;
export const RAMP_END = -10.2;

export interface Frame {
  mouth: Vec;
  facing: number;
}

export function to_town(frame: Frame, u: number, v: number): Vec {
  const fx = Math.cos(frame.facing);
  const fy = Math.sin(frame.facing);
  return { x: frame.mouth.x - fy * u + fx * v, y: frame.mouth.y + fx * u + fy * v };
}

export const shape_at = (frame: Frame, shape: Polygon) => shape.map((p) => to_town(frame, p.x, p.y));

export function box(u0: number, v0: number, u1: number, v1: number): Vec[] {
  return [
    { x: u0, y: v0 },
    { x: u1, y: v0 },
    { x: u1, y: v1 },
    { x: u0, y: v1 },
  ];
}

export function disc(cu: number, cv: number, r: number, sides = 12): Vec[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return { x: cu + Math.cos(a) * r, y: cv + Math.sin(a) * r };
  });
}

function around(u0: number, u1: number, back: number, kind: SolidKind = SolidKind.WALL, front = 0) {
  return [
    { kind, shape: box(u0, back, -DOOR_HALF, front) },
    { kind, shape: box(DOOR_HALF, back, u1, front) },
    { kind, shape: box(-DOOR_HALF, back, DOOR_HALF, -RECESS) },
  ];
}

const wall = (shape: Polygon) => ({ kind: SolidKind.WALL, shape });

// An open ground (a lawn, an arena, a basin) is solid too: its hedge, fence or quay edge is what stops the vehicle.
export function blueprint(building: Building | null): Blueprint {
  switch (building) {
    case Building.CAR_PARK:
      return {
        pieces: [
          wall(box(-6.5, -9, -DOOR_HALF, 0)),
          wall(box(DOOR_HALF, -9, 6.5, 0)),
          wall(box(-DOOR_HALF, RAMP_END - 0.6, -RAMP_HALF, -RECESS - RAMP_FUNNEL)),
          wall(box(RAMP_HALF, RAMP_END - 0.6, DOOR_HALF, -RECESS - RAMP_FUNNEL)),
          wall([{ x: -DOOR_HALF, y: -RECESS }, { x: -RAMP_HALF, y: -RECESS - RAMP_FUNNEL }, { x: -DOOR_HALF, y: -RECESS - RAMP_FUNNEL }]),
          wall([{ x: DOOR_HALF, y: -RECESS }, { x: RAMP_HALF, y: -RECESS - RAMP_FUNNEL }, { x: DOOR_HALF, y: -RECESS - RAMP_FUNNEL }]),
          wall(box(-RAMP_HALF, RAMP_END - 0.6, RAMP_HALF, RAMP_END)),
          wall(disc(4.9, -9.1, 2.3)),
        ],
        u0: -6.5,
        u1: 7.2,
        back: -11.4,
      };
    case Building.WAREHOUSE:
      return { pieces: around(-PLAN_HALF, PLAN_HALF, -8), u0: -PLAN_HALF, u1: PLAN_HALF, back: -8 };
    case Building.TRACK:
      return {
        pieces: [...around(-3.6, 3.6, -7.6), wall(disc(-3.6, -3.8, 3.8, 16)), wall(disc(3.6, -3.8, 3.8, 16))],
        u0: -PLAN_HALF,
        u1: PLAN_HALF,
        back: -7.6,
      };
    case Building.GARDEN:
      return { pieces: around(-7, 7, -10, SolidKind.HEDGE), u0: -7, u1: 7, back: -10 };
    case Building.APRON:
      return { pieces: around(-PLAN_HALF, PLAN_HALF, -PLAN_DEPTH), u0: -PLAN_HALF, u1: PLAN_HALF, back: -PLAN_DEPTH };
    case Building.FERRY:
      return { pieces: around(-PLAN_HALF, PLAN_HALF, -12.2, SolidKind.WATER), u0: -PLAN_HALF, u1: PLAN_HALF, back: -12 };
    case Building.ARENA:
      return { pieces: around(-7, 7, -10.6), u0: -7, u1: 7, back: -10.6 };
    case Building.VALET_STAND:
      return { pieces: around(-7, 7, -10), u0: -7, u1: 7, back: -10 };
    case Building.TEST_CENTRE:
      return { pieces: around(-PLAN_HALF, PLAN_HALF, -9.6), u0: -PLAN_HALF, u1: PLAN_HALF, back: -9.6 };
    default:
      return { pieces: around(-5.5, 5.5, -8), u0: -5.5, u1: 5.5, back: -8 };
  }
}
