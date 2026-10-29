import { inside_convex } from "./collision";
import type { Polygon, Vec } from "./geometry";
import { axles, DriveKind, front_frame, to_world, trailer_wheels, type Placement, type VehicleSpec } from "./vehicle";

/** Front pair, rear pair, then each trailer's pair down the chain; a frame steer's front pair turns with its front frame. */
export function tyres(car: Placement, spec: VehicleSpec): Vec[] {
  const half = spec.track / 2;
  const { front, rear } = axles(spec);
  const frame = spec.drive.kind === DriveKind.FRAME;
  const ahead = frame ? front_frame(car, spec) : car;
  const x = frame ? 0 : front;
  const found = [
    to_world(ahead, { x, y: -half }),
    to_world(ahead, { x, y: half }),
    to_world(car, { x: rear, y: -half }),
    to_world(car, { x: rear, y: half }),
  ];
  spec.hitches.forEach((_, i) => found.push(...trailer_wheels(car, spec, i)));
  return found;
}

export function ground_under(point: Vec, ground: readonly Polygon[], margin = 0): number {
  return ground.findIndex((piece) => inside_convex(point, piece, margin));
}

/** Ground is convex pieces that may overlap; none given means everywhere is ground. */
export function support(car: Placement, spec: VehicleSpec, ground: readonly Polygon[] | undefined, margin = 0): number[] {
  if (!ground) return [];
  const off: number[] = [];
  tyres(car, spec).forEach((point, i) => {
    if (ground_under(point, ground, margin) < 0) off.push(i);
  });
  return off;
}
