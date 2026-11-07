import { centroid, wrap_angle, type Vec } from "$kit/games/play2d/geometry";
import { bodies, type Placement, type VehicleSpec } from "../../core/vehicle";
import { bank_at, type Garden } from "./garden";

/** How far off the fall line a body on a bank may point, up or down it, before it would tip. */
export const BANK_TOLERANCE = (25 * Math.PI) / 180;

export function slant(heading: number, fall: number): number {
  const off = Math.abs(wrap_angle(heading - fall));
  return Math.min(off, Math.PI - off);
}

interface Lean {
  at: Vec;
  slant: number;
}

function leans(car: Placement, spec: VehicleSpec, garden: Pick<Garden, "banks">): (Lean | null)[] {
  return bodies(car, spec).map((shape, i) => {
    const at = centroid(shape);
    const bank = bank_at(garden, at);
    if (!bank) return null;
    const heading = i === 0 ? car.heading : (car.trailers?.[i - 1]?.heading ?? car.heading);
    return { at, slant: slant(heading, bank.fall) };
  });
}

/** Where a step leaves a body too far across a bank, unless it was already there and is turning back toward the fall line. */
export function across_bank(from: Placement, to: Placement, spec: VehicleSpec, garden: Pick<Garden, "banks">): Vec | null {
  if (garden.banks.length === 0) return null;
  const after = leans(to, spec, garden);
  let before: (Lean | null)[] | null = null;
  for (let i = 0; i < after.length; i++) {
    const now = after[i];
    if (!now || now.slant <= BANK_TOLERANCE) continue;
    before ??= leans(from, spec, garden);
    const was = before[i];
    if (!was || now.slant > was.slant + 1e-9) return now.at;
  }
  return null;
}

export function crosswise(car: Placement, spec: VehicleSpec, garden: Pick<Garden, "banks">): boolean {
  if (garden.banks.length === 0) return false;
  return leans(car, spec, garden).some((lean) => lean !== null && lean.slant > BANK_TOLERANCE);
}
