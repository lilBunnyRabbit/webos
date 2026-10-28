import { contact_point, overlaps } from "./collision";
import { bounds_of, bounds_overlap, centroid, type Bounds, type Polygon, type Vec } from "./geometry";
import type { Solid } from "./scene";
import { bodies, VEHICLES, type Placement, type VehicleSpec } from "./vehicle";

export interface Hit {
  solid: Solid;
  at: Vec;
}

export interface Obstacles {
  solids: Solid[];
  bounds: Bounds[];
}

export interface Scene {
  solids: Solid[];
}

const obstacle_cache = new WeakMap<Scene, Obstacles>();

export function obstacles(scene: Scene): Obstacles {
  let cached = obstacle_cache.get(scene);
  if (!cached) {
    cached = { solids: scene.solids, bounds: scene.solids.map((solid) => bounds_of(solid.shape)) };
    obstacle_cache.set(scene, cached);
  }
  return cached;
}

export function collide_shape(shape: Polygon, near: Obstacles): Hit | null {
  const box = bounds_of(shape);
  for (let i = 0; i < near.solids.length; i++) {
    if (!bounds_overlap(box, near.bounds[i])) continue;
    const solid = near.solids[i];
    if (!overlaps(shape, solid.shape)) continue;
    return { solid, at: contact_point(shape, solid.shape) ?? centroid(shape) };
  }
  return null;
}

export function collide(car: Placement, near: Obstacles, spec: VehicleSpec = VEHICLES.hatch): Hit | null {
  for (const body of bodies(car, spec)) {
    const hit = collide_shape(body, near);
    if (hit) return hit;
  }
  return null;
}
