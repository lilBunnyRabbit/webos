import { to_screen, type View } from "$kit/utils/view";
import { add, distance, edge_vectors, length, midpoint, path_scale, scale, sketch_scale, sub, unit } from "./geometry";
import type { Line, Rect } from "./labels";
import { edge_count, point_map, same_target, type Point, type Sketch, type Target } from "./model";
import { back_to_front, mean_depth, nearest_line, project, type HitLine, type Orbit, type Point3 } from "./projection";
import {
  around_from,
  AROUND,
  bounds_of,
  dim_label,
  dim_shape,
  edge_label,
  height_label,
  Labeller,
  marker_label,
  outward_normal,
  point_rect,
  union,
  type SceneDim,
  type SceneLabel,
  type SceneMarker,
} from "./scene";

export interface SolidPath {
  id: string;
  closed: boolean;
  floor: Point[];
  height: number | null;
}

export interface World {
  paths: SolidPath[];
  positions: Map<string, Point>;
}

/**
 * Each path is rebuilt from its lengths (unmeasured edges at its own drawn ratio, the closing leftover spread as for
 * the area) and set down at its first corner's drawn position. Lengths turn back into sketch units through the
 * sketch's median scale, so paths measured in one sketch keep their sizes relative to each other.
 */
export function build_world(sketch: Sketch): World {
  const points = point_map(sketch);
  const k = sketch_scale(sketch) ?? 1;
  const positions = new Map<string, Point>(sketch.points.map((point) => [point.id, { x: point.x, y: point.y }]));
  const placed = new Set<string>();
  const paths: SolidPath[] = [];
  for (const path of sketch.paths) {
    const origin = points.get(path.points[0]);
    if (!origin) continue;
    const floor: Point[] = [{ x: origin.x, y: origin.y }];
    if (edge_count(path)) {
      const vectors = edge_vectors(path, points, path_scale(path, points) ?? k);
      for (let i = 1; i < path.points.length; i++) floor.push(add(floor[i - 1], scale(vectors[i - 1], k)));
    }
    path.points.forEach((id, i) => {
      if (placed.has(id)) return;
      placed.add(id);
      positions.set(id, floor[i]);
    });
    paths.push({ id: path.id, closed: path.closed, floor, height: path.height === null ? null : path.height * k });
  }
  return { paths, positions };
}

function world_box(world: World): { min: Point3; max: Point3 } | null {
  let min: Point3 | null = null;
  let max: Point3 | null = null;
  const take = (p: Point3) => {
    min = min ? { x: Math.min(min.x, p.x), y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) } : { ...p };
    max = max ? { x: Math.max(max.x, p.x), y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) } : { ...p };
  };
  for (const position of world.positions.values()) take({ ...position, z: 0 });
  for (const path of world.paths) for (const corner of path.floor) take({ ...corner, z: path.height ?? 0 });
  return min && max ? { min, max } : null;
}

export const FaceKind = { FLOOR: "floor", WALL: "wall", TOP: "top" } as const;
export type FaceKind = (typeof FaceKind)[keyof typeof FaceKind];

export const EdgeKind = { FLOOR: "floor", TOP: "top", RISE: "rise" } as const;
export type EdgeKind = (typeof EdgeKind)[keyof typeof EdgeKind];

export interface SolidFace {
  path: string;
  kind: FaceKind;
  points: Point[];
  depth: number;
}

export interface SolidEdge {
  path: string;
  kind: EdgeKind;
  a: Point;
  b: Point;
  target: Target;
}

export interface SolidHandle {
  path: string;
  foot: Point;
  tip: Point;
}

export interface SolidScene {
  faces: SolidFace[];
  edges: SolidEdge[];
  handles: SolidHandle[];
  dims: SceneDim[];
  markers: SceneMarker[];
  labels: SceneLabel[];
  bounds: Rect | null;
}

// Below this many px an edge is seen nearly end-on and its label would pile onto its neighbours'.
export const END_ON = 24;
const STUB = 30;

/** Screen px for a world point: centred on the sketch's middle so turning it keeps it in place. */
export function solid_projector(world: World, orbit: Orbit, view: View): (p: Point3) => Point & { depth: number } {
  const box = world_box(world);
  const c = box
    ? { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 }
    : { x: 0, y: 0, z: 0 };
  return (p) => {
    const at = project(orbit, { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z });
    return { ...to_screen(view, at.x, at.y), depth: at.depth };
  };
}

export function solid_bounds(sketch: Sketch, orbit: Orbit): Rect | null {
  const world = build_world(sketch);
  const to = solid_projector(world, orbit, { scale: 1, offset_x: 0, offset_y: 0 });
  let bounds: Rect | null = null;
  for (const position of world.positions.values()) bounds = union(bounds, point_rect(to({ ...position, z: 0 }), 0));
  for (const path of world.paths)
    for (const corner of path.floor) bounds = union(bounds, point_rect(to({ ...corner, z: path.height ?? 0 }), 0));
  return bounds;
}

export function build_solid_scene(sketch: Sketch, orbit: Orbit, view: View, current: Target | null = null): SolidScene {
  const world = build_world(sketch);
  const to = solid_projector(world, orbit, view);
  const labeller = new Labeller();
  const lines = labeller.lines;
  const faces: SolidFace[] = [];
  const edges: SolidEdge[] = [];
  const handles: SolidHandle[] = [];
  const corners_on_screen: Point[] = [];
  const shown = (target: Target, a: Point, b: Point) => distance(a, b) >= END_ON || same_target(target, current);

  for (const path of world.paths) {
    const source = sketch.paths.find((each) => each.id === path.id)!;
    const floor = path.floor.map((p) => to({ ...p, z: 0 }));
    const top = path.height === null ? null : path.floor.map((p) => to({ ...p, z: path.height! }));
    const count = edge_count(source);
    const height_target: Target = { kind: "height", path: path.id };
    corners_on_screen.push(...floor);

    if (path.closed) faces.push({ path: path.id, kind: FaceKind.FLOOR, points: floor, depth: mean_depth(floor) });
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % floor.length;
      const target: Target = { kind: "edge", path: path.id, index: i };
      edges.push({ path: path.id, kind: EdgeKind.FLOOR, a: floor[i], b: floor[j], target });
      if (top) {
        edges.push({ path: path.id, kind: EdgeKind.TOP, a: top[i], b: top[j], target });
        const wall = [floor[i], floor[j], top[j], top[i]];
        faces.push({ path: path.id, kind: FaceKind.WALL, points: wall, depth: mean_depth(wall) });
      }
    }
    if (top) {
      if (path.closed) faces.push({ path: path.id, kind: FaceKind.TOP, points: top, depth: mean_depth(top) });
      floor.forEach((foot, i) =>
        edges.push({ path: path.id, kind: EdgeKind.RISE, a: foot, b: top[i], target: height_target })
      );
    }
    for (const edge of edges) if (edge.path === path.id) lines.push({ a: edge.a, b: edge.b });

    for (let i = 0; i < count; i++) {
      const a = floor[i];
      const b = floor[(i + 1) % floor.length];
      const label = edge_label(path.id, i, source.lengths[i], sketch.unit);
      if (!shown(label.target!, a, b)) continue;
      const normal = outward_normal(a, b, floor, path.closed);
      labeller.request(label, midpoint(a, b), [normal, scale(normal, -1)]);
    }

    const center = floor.reduce((sum, p) => add(sum, scale(p, 1 / floor.length)), { x: 0, y: 0 });
    if (top && count) {
      const nearest = floor.reduce((best, p, i) => (p.depth > floor[best].depth ? i : best), 0);
      const foot = floor[nearest];
      const tip = top[nearest];
      if (shown(height_target, foot, tip)) {
        const side = foot.x >= center.x ? 1 : -1;
        labeller.request(height_label(path.id, source.height, sketch.unit), midpoint(foot, tip), [
          { x: side, y: 0 },
          { x: -side, y: 0 },
          ...AROUND,
        ]);
      }
    } else if (count) {
      const foot = floor[0];
      const tip = { x: foot.x, y: foot.y - STUB * Math.cos(orbit.pitch) };
      handles.push({ path: path.id, foot, tip });
      if (distance(foot, tip) > 1) lines.push({ a: foot, b: tip });
      labeller.request(height_label(path.id, null, sketch.unit), tip, around_from({ x: 0, y: -1 }));
    }
  }

  const dims: SceneDim[] = [];
  for (const dim of sketch.dims) {
    const pa = world.positions.get(dim.a);
    const pb = world.positions.get(dim.b);
    if (!pa || !pb) continue;
    const along = unit(sub(pb, pa));
    const floor_normal = length(along) ? { x: along.y, y: -along.x } : { x: 0, y: -1 };
    const sa = to({ ...pa, z: 0 });
    const sb = to({ ...pb, z: 0 });
    const shifted = to({ ...add(pa, scale(floor_normal, dim.offset)), z: 0 });
    const offset = sub(shifted, sa);
    const screen_along = unit(sub(sb, sa));
    const normal = length(offset) > 1e-6 ? unit(offset) : { x: screen_along.y, y: -screen_along.x };
    const shape = dim_shape(dim.id, sa, sb, normal, length(offset));
    dims.push(shape);
    lines.push({ a: shape.a, b: shape.b }, ...shape.extensions);
    const label = dim_label(dim.id, dim.length, sketch.unit);
    if (shown(label.target!, shape.a, shape.b))
      labeller.request(label, midpoint(shape.a, shape.b), [shape.normal, scale(shape.normal, -1)]);
  }

  const markers: SceneMarker[] = [];
  for (const marker of sketch.markers) {
    const position = world.positions.get(marker.point);
    if (!position) continue;
    const at = to({ ...position, z: 0 });
    markers.push({ id: marker.id, point: marker.point, at });
    if (marker.note) labeller.request(marker_label(marker.id, marker.note), at, AROUND);
  }

  const labels = labeller.place(corners_on_screen.map((p) => point_rect(p, 4)));
  return {
    faces: back_to_front(faces),
    edges,
    handles,
    dims,
    markers,
    labels,
    bounds: bounds_of(
      lines,
      labels.map((label) => label.rect)
    ),
  };
}

export function hit_solid(scene: SolidScene, p: Point, radius: number): Target | null {
  const slop = radius / 2;
  for (const label of [...scene.labels].reverse()) {
    if (!label.target) continue;
    const { x, y, w, h } = label.rect;
    if (p.x >= x - slop && p.x <= x + w + slop && p.y >= y - slop && p.y <= y + h + slop) return label.target;
  }
  const lines: HitLine<Target>[] = [
    ...scene.edges.map((edge) => ({ a: edge.a, b: edge.b, value: edge.target })),
    ...scene.handles.map((handle) => ({
      a: handle.foot,
      b: handle.tip,
      value: { kind: "height", path: handle.path } as Target,
    })),
    ...scene.dims.map((dim) => ({ a: dim.a, b: dim.b, value: { kind: "dim", id: dim.id } as Target })),
  ];
  return nearest_line(lines, p, radius);
}

export function solid_lines(scene: SolidScene): Line[] {
  return [
    ...scene.edges.map(({ a, b }) => ({ a, b })),
    ...scene.dims.flatMap((dim) => [{ a: dim.a, b: dim.b }, ...dim.extensions]),
  ];
}
