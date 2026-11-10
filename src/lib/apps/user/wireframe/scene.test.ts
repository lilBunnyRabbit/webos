import { expect, test } from "vitest";
import { add_box, add_line } from "./edit";
import { create_wire } from "./model";
import { PRESETS, ViewPreset } from "./projection";
import { build_scene } from "./scene";

const camera = {
  orbit: PRESETS[ViewPreset.CAVALIER],
  pivot: { x: 0, y: 0, z: 0 },
  view: { scale: 0.5, offset_x: 400, offset_y: 600 },
};

test("a box reads W × D × H, and a forced line keeps its own label", () => {
  const box = add_box(create_wire(), null, { x: 800, y: 400, z: 2000 }, null);
  const labels = build_scene(box.wire, camera)
    .labels.map((label) => label.text)
    .sort();
  expect(labels).toEqual(["200 cm", "40 cm", "80 cm"]);
  const forced = build_scene(box.wire, camera, true, new Set(box.lines.slice(0, 2))).labels;
  expect(forced.map((label) => label.id)).toEqual(expect.arrayContaining(box.lines.slice(0, 2)));
});

test("a slope gets its label next to the axis lines it lies on in Front", () => {
  const box = add_box(create_wire(), null, { x: 800, y: 400, z: 2000 }, null);
  const [a, , , h] = box.wire.points;
  const slope = add_line(box.wire, a.id, h.id, null);
  const front = { ...camera, orbit: PRESETS[ViewPreset.FRONT] };
  expect(build_scene(slope.wire, front).labels.some((label) => label.id === slope.id)).toBe(true);
});
