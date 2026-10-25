import { describe, expect, test } from "vitest";
import { add_point, append_point, close_path, set_length, start_path } from "./edit";
import { distance, midpoint } from "./geometry";
import { create_sketch, type Sketch, type Target } from "./model";
import { PRESETS, ViewPreset } from "./projection";
import { build_solid_scene, build_world, EdgeKind, FaceKind, hit_solid } from "./solid";

const VIEW = { scale: 1, offset_x: 400, offset_y: 300 };
const THREE_QUARTER = PRESETS[ViewPreset.THREE_QUARTER];

function add_path(sketch: Sketch, corners: [number, number][], lengths: (number | null)[], closed: boolean) {
  const ids: string[] = [];
  for (const [x, y] of corners) {
    const added = add_point(sketch, { x, y });
    sketch = added.sketch;
    ids.push(added.id);
  }
  const started = start_path(sketch, ids[0]);
  sketch = started.sketch;
  for (let i = 1; i < ids.length; i++) sketch = append_point(sketch, started.id, ids[i], lengths[i - 1]);
  if (closed) sketch = close_path(sketch, started.id, lengths.at(-1));
  return { sketch, path: started.id };
}

function house() {
  const room = add_path(
    create_sketch(),
    [
      [0, 0],
      [100, 0],
      [100, 80],
      [0, 80],
    ],
    [4000, 3000, 4000, 3000],
    true
  );
  const sketch = set_length(room.sketch, { kind: "height", path: room.path }, 2500);
  const fence = add_path(
    sketch,
    [
      [200, 0],
      [200, 120],
    ],
    [1500],
    false
  );
  return { sketch: fence.sketch, room: room.path, fence: fence.path };
}

describe("build_world", () => {
  const { sketch, room, fence } = house();
  const world = build_world(sketch);
  const floor = world.paths.find((path) => path.id === room)!.floor;

  test("rebuilds a path from its lengths, not from how it was drawn", () => {
    expect(distance(floor[0], floor[1]) / distance(floor[1], floor[2])).toBeCloseTo(4 / 3);
  });

  test("sets each path down at its first corner's drawn position, heights through the same scale", () => {
    expect(floor[0]).toEqual({ x: 0, y: 0 });
    const fence_floor = world.paths.find((path) => path.id === fence)!.floor;
    expect(fence_floor[0]).toEqual({ x: 200, y: 0 });
    const k = distance(floor[0], floor[1]) / 4000;
    expect(world.paths.find((path) => path.id === room)!.height).toBeCloseTo(2500 * k);
    expect(distance(fence_floor[0], fence_floor[1])).toBeCloseTo(1500 * k);
  });

  test("a path without a height stays flat", () => {
    expect(world.paths.find((path) => path.id === fence)!.height).toBeNull();
  });
});

describe("build_solid_scene", () => {
  const { sketch, room, fence } = house();
  const scene = build_solid_scene(sketch, THREE_QUARTER, VIEW);

  test("a closed path with a height is a prism: floor, top and a wall per edge, farthest first", () => {
    const faces = scene.faces.filter((face) => face.path === room);
    expect(faces.filter((face) => face.kind === FaceKind.WALL)).toHaveLength(4);
    expect(faces.filter((face) => face.kind === FaceKind.TOP)).toHaveLength(1);
    expect(faces.filter((face) => face.kind === FaceKind.FLOOR)).toHaveLength(1);
    for (let i = 1; i < scene.faces.length; i++)
      expect(scene.faces[i].depth).toBeGreaterThanOrEqual(scene.faces[i - 1].depth);
  });

  test("each length is labelled once, the height once", () => {
    const ids = scene.labels.map((label) => label.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith(`edge:${room}:`))).toHaveLength(4);
    expect(scene.labels.find((label) => label.id === `height:${room}`)!.text).toBe("↑ 250 cm");
  });

  test("a heightless path gets a ↑ ? handle at its first corner", () => {
    const handle = scene.handles.find((each) => each.path === fence)!;
    expect(handle).toBeDefined();
    expect(scene.labels.find((label) => label.id === `height:${fence}`)!.text).toBe("↑ ?");
    expect(scene.edges.some((edge) => edge.path === fence && edge.kind === EdgeKind.RISE)).toBe(false);
  });

  test("from straight above, the end-on height label hides until it's the one being measured", () => {
    const top = build_solid_scene(sketch, PRESETS[ViewPreset.TOP], VIEW);
    expect(top.labels.some((label) => label.id === `height:${room}`)).toBe(false);
    const measuring = build_solid_scene(sketch, PRESETS[ViewPreset.TOP], VIEW, { kind: "height", path: room });
    expect(measuring.labels.some((label) => label.id === `height:${room}`)).toBe(true);
  });
});

describe("hit_solid", () => {
  const { sketch, room, fence } = house();
  const scene = build_solid_scene(sketch, THREE_QUARTER, VIEW);
  const labelled = new Set(scene.labels.map((label) => label.id));

  test("a top edge is the same length as its floor edge", () => {
    const top = scene.edges.find(
      (edge) => edge.kind === EdgeKind.TOP && edge.target.kind === "edge" && edge.target.index === 1
    )!;
    const at = midpoint(top.a, top.b);
    const hit = hit_solid({ ...scene, labels: [] }, at, 22);
    expect(hit).toEqual({ kind: "edge", path: room, index: 1 } satisfies Target);
  });

  test("a vertical edge is the path's height, hit within a thumb's reach", () => {
    const rise = scene.edges.find((edge) => edge.kind === EdgeKind.RISE)!;
    const at = midpoint(rise.a, rise.b);
    expect(hit_solid({ ...scene, labels: [] }, { x: at.x + 1, y: at.y }, 22)).toEqual({ kind: "height", path: room });
  });

  test("the ↑ ? handle opens the height", () => {
    expect(labelled.has(`height:${fence}`)).toBe(true);
    const label = scene.labels.find((each) => each.id === `height:${fence}`)!;
    const center = { x: label.rect.x + label.rect.w / 2, y: label.rect.y + label.rect.h / 2 };
    expect(hit_solid(scene, center, 22)).toEqual({ kind: "height", path: fence });
  });

  test("empty space hits nothing", () => {
    expect(hit_solid(scene, { x: -500, y: -500 }, 22)).toBeNull();
  });
});
