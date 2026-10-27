import { describe, expect, test } from "vitest";
import { CharSet } from "./charsets";
import type { Vec } from "./outline";
import { homography, project, type Gray, type Quad } from "$kit/utils/perspective";
import { crop_box, find_marks, has_ink } from "./scan";
import { MARK_SIZE, PAGE, template_layout } from "./template";

const layout = template_layout(CharSet.BASIC_LATIN);
const PAGE_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: PAGE.width, y: 0 },
  { x: PAGE.width, y: PAGE.height },
  { x: 0, y: PAGE.height },
];

function photograph(corners: Quad, inked: string[], width = 700, height = 900): Gray {
  const image_to_page = homography(corners, PAGE_QUAD);
  const data = new Uint8Array(width * height);
  const hole = MARK_SIZE / 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const page = project(image_to_page, { x: x + 0.5, y: y + 0.5 });
      let value = 70;
      if (page.x >= 0 && page.y >= 0 && page.x <= PAGE.width && page.y <= PAGE.height) {
        value = 225 - Math.round((x / width) * 25);
        layout.marks.forEach((mark, index) => {
          const inside = Math.abs(page.x - mark.x) <= MARK_SIZE / 2 && Math.abs(page.y - mark.y) <= MARK_SIZE / 2;
          const in_hole = index === 0 && Math.abs(page.x - mark.x) <= hole / 2 && Math.abs(page.y - mark.y) <= hole / 2;
          if (inside && !in_hole) value = 15;
        });
        for (const box of layout.boxes) {
          if (!inked.includes(box.char)) continue;
          const cx = box.x + box.width / 2;
          if (Math.abs(page.x - cx) < 0.6 && page.y > box.y + 3 && page.y < box.y + box.height - 3) value = 30;
        }
      }
      data[y * width + x] = value;
    }
  }
  return { width, height, data };
}

const close = (a: Vec, b: Vec, tolerance: number) => Math.hypot(a.x - b.x, a.y - b.y) < tolerance;

describe("find_marks", () => {
  const corners: Quad = [
    { x: 60, y: 50 },
    { x: 640, y: 80 },
    { x: 670, y: 860 },
    { x: 30, y: 830 },
  ];

  test("finds the marks of a tilted photo", () => {
    const gray = photograph(corners, []);
    const marks = find_marks(gray);
    expect(marks).not.toBeNull();
    const expected = layout.marks.map((mark) => project(homography(PAGE_QUAD, corners), mark));
    marks!.forEach((mark, index) => expect(close(mark, expected[index], 3)).toBe(true));
  });

  test("puts the holed mark first when the page is upside down", () => {
    const rotated: Quad = [corners[2], corners[3], corners[0], corners[1]];
    const marks = find_marks(photograph(rotated, []));
    const expected = layout.marks.map((mark) => project(homography(PAGE_QUAD, rotated), mark));
    expect(marks).not.toBeNull();
    marks!.forEach((mark, index) => expect(close(mark, expected[index], 3)).toBe(true));
  });

  test("gives up on a blank picture", () => {
    expect(find_marks({ width: 200, height: 200, data: new Uint8Array(200 * 200).fill(220) })).toBeNull();
  });
});

describe("crop_box", () => {
  test("crops the boxes with ink and leaves the empty ones", () => {
    const corners: Quad = [
      { x: 40, y: 30 },
      { x: 660, y: 50 },
      { x: 650, y: 870 },
      { x: 50, y: 860 },
    ];
    const gray = photograph(corners, ["A", "k"]);
    const marks = find_marks(gray)!;
    const matrix = homography(layout.marks, marks);
    const inked = layout.boxes.filter((box) => has_ink(crop_box(gray, matrix, box, 50, 60))).map((box) => box.char);
    expect(inked).toEqual(["A", "k"]);
  });
});
