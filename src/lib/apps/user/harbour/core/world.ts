import { bounds_of, oriented_box, rect, type Bounds, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import type { Bay } from "$kit/games/play2d/precision";
import { hull, type Drive, type HullSize } from "./boat";

export const SolidKind = { QUAY: "quay", PONTOON: "pontoon", MOORED: "moored", PILE: "pile", BUOY: "buoy" } as const;
export type SolidKind = (typeof SolidKind)[keyof typeof SolidKind];

export interface Solid {
  id: number;
  kind: SolidKind;
  shape: Polygon;
  box: Bounds;
  /** Fenders take a touch softly; a quay wall or someone's boat is judged at half the speeds. */
  fendered: boolean;
  /** A moored boat's pose and size, for drawing it. */
  boat?: { pose: Pose; length: number; beam: number; paint: number; drive: Drive; cargo?: boolean };
  /** A buoy's side of a gate: port is red, starboard green. */
  side?: "port" | "starboard";
}

export const BerthKind = { ALONGSIDE: "alongside", BOX: "box" } as const;
export type BerthKind = (typeof BerthKind)[keyof typeof BerthKind];

export interface Berth {
  kind: BerthKind;
  /** The water the boat must end up in, and the way it must point (`either` way alongside). */
  bay: Bay;
  /** Alongside: the pontoon's face, and the unit normal out of it into the berth. */
  edge?: { a: Vec; b: Vec; out: Vec };
  /** Where the crew make the lines fast. */
  cleats: Vec[];
}

export interface Scene {
  bounds: Bounds;
  solids: Solid[];
  berth: Berth | null;
  start: Pose;
}

export class SceneBuilder {
  readonly solids: Solid[] = [];

  private add(kind: SolidKind, shape: Polygon, fendered: boolean, extra: Partial<Solid> = {}): Solid {
    const solid: Solid = { id: this.solids.length, kind, shape, box: bounds_of(shape), fendered, ...extra };
    this.solids.push(solid);
    return solid;
  }

  quay(x0: number, y0: number, x1: number, y1: number): Solid {
    return this.add(SolidKind.QUAY, rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)), false);
  }

  pontoon(x0: number, y0: number, x1: number, y1: number): Solid {
    return this.add(SolidKind.PONTOON, rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)), true);
  }

  moored(pose: Pose, spec: HullSize, paint: number): Solid {
    const shape = hull(pose, spec);
    return this.add(SolidKind.MOORED, shape, false, { boat: { pose, length: spec.length, beam: spec.beam, paint, drive: spec.drive, cargo: spec.cargo } });
  }

  pile(x: number, y: number, size = 0.4): Solid {
    return this.add(SolidKind.PILE, oriented_box(x, y, Math.PI / 4, size, size), false);
  }

  buoy(x: number, y: number, side: "port" | "starboard", size = 0.45): Solid {
    const shape = Array.from({ length: 8 }, (_, i) => ({ x: x + Math.cos((i * Math.PI) / 4) * size, y: y + Math.sin((i * Math.PI) / 4) * size }));
    return this.add(SolidKind.BUOY, shape, true, { side });
  }
}

/** A berth on a pontoon's face from `a` to `b`, the boat lying on the side `out` points to. */
export function alongside(a: Vec, b: Vec, out: Vec, beam: number): Berth {
  const heading = Math.atan2(b.y - a.y, b.x - a.x);
  const far = { x: out.x * beam, y: out.y * beam };
  return {
    kind: BerthKind.ALONGSIDE,
    bay: { shape: [a, b, { x: b.x + far.x, y: b.y + far.y }, { x: a.x + far.x, y: a.y + far.y }], heading, either: true },
    edge: { a, b, out },
    cleats: [a, b],
  };
}

/** A box berth whose closed end is at `head`, the boat lying bow in along `heading`. */
export function box(head: Vec, heading: number, length: number, width: number): Berth {
  const along = { x: Math.cos(heading), y: Math.sin(heading) };
  const across = { x: -along.y, y: along.x };
  const corner = (l: number, w: number) => ({ x: head.x - along.x * l + across.x * w, y: head.y - along.y * l + across.y * w });
  const shape = [corner(0, -width / 2), corner(0, width / 2), corner(length, width / 2), corner(length, -width / 2)];
  return {
    kind: BerthKind.BOX,
    bay: { shape, heading, either: false },
    cleats: [corner(0, -width / 2 + 0.3), corner(0, width / 2 - 0.3), corner(length * 0.75, width / 2), corner(length * 0.75, -width / 2)],
  };
}
