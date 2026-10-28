import { contact_point, overlaps } from "./collision";
import { bounds_of, bounds_overlap, type Bounds, type Vec } from "./geometry";
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

export function collide(car: Placement, near: Obstacles, spec: VehicleSpec = VEHICLES.hatch): Hit | null {
  for (const body of bodies(car, spec)) {
    const box = bounds_of(body);
    for (let i = 0; i < near.solids.length; i++) {
      if (!bounds_overlap(box, near.bounds[i])) continue;
      const solid = near.solids[i];
      if (!overlaps(body, solid.shape)) continue;
      return { solid, at: contact_point(body, solid.shape) ?? { x: car.x, y: car.y } };
    }
  }
  return null;
}
