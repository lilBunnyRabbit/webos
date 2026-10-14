import { describe, expect, test } from "vitest";
import { PageSize, clamp_placement, display_to_pdf, displayed_size, image_page, page_size_label, stamp_geometry } from "./geometry";

describe("page_size_label", () => {
  test("names common paper, either way round", () => {
    expect(page_size_label(595.28, 841.89)).toBe("210 × 297 mm · A4");
    expect(page_size_label(792, 612)).toBe("279 × 216 mm · Letter landscape");
  });

  test("other sizes are just millimetres", () => {
    expect(page_size_label(200, 300)).toBe("71 × 106 mm");
  });
});

const BOX = { x: 0, y: 0, width: 600, height: 800 };

describe("image_page", () => {
  test("fits a portrait image into A4 with margins, centered", () => {
    const page = image_page(1000, 2000, PageSize.A4, 36);
    expect(page.width).toBeCloseTo(595.28);
    expect(page.height).toBeCloseTo(841.89);
    expect(page.image.height).toBeCloseTo(841.89 - 72);
    expect(page.image.width).toBeCloseTo((841.89 - 72) / 2);
    expect(page.image.x).toBeCloseTo((595.28 - page.image.width) / 2);
  });

  test("landscape images get landscape paper", () => {
    const page = image_page(3000, 1000, PageSize.LETTER, 0);
    expect(page.width).toBe(792);
    expect(page.height).toBe(612);
    expect(page.image.width).toBeCloseTo(792);
  });

  test("image size uses 96 dpi plus margins", () => {
    const page = image_page(96, 192, PageSize.IMAGE, 10);
    expect(page).toEqual({ width: 92, height: 164, image: { x: 10, y: 10, width: 72, height: 144 } });
  });
});

describe("display_to_pdf", () => {
  test("corners of the shown page land on the right PDF corners for every rotation", () => {
    expect(display_to_pdf(BOX, 0, 0, 0)).toEqual({ x: 0, y: 800 });
    expect(displayed_size(BOX, 90)).toEqual({ width: 800, height: 600 });
    expect(display_to_pdf(BOX, 90, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(display_to_pdf(BOX, 90, 800, 600)).toEqual({ x: 600, y: 800 });
    expect(display_to_pdf(BOX, 180, 0, 0)).toEqual({ x: 600, y: 0 });
    expect(display_to_pdf(BOX, 270, 0, 0)).toEqual({ x: 600, y: 800 });
  });

  test("the crop box offset is added", () => {
    expect(display_to_pdf({ x: 10, y: 20, width: 100, height: 100 }, 0, 0, 0)).toEqual({ x: 10, y: 120 });
  });
});

describe("stamp_geometry", () => {
  test("upright page: top-left of the placement, scale from width", () => {
    const stamp = stamp_geometry(BOX, 0, { x: 0.5, y: 0.25, width: 0.25 }, 300);
    expect(stamp).toEqual({ x: 300, y: 600, scale: 0.5, rotate: 0 });
  });

  test("rotated page rotates the stamp with it", () => {
    const stamp = stamp_geometry(BOX, 90, { x: 0, y: 0, width: 0.5 }, 400);
    expect(stamp).toEqual({ x: 0, y: 0, scale: 1, rotate: 90 });
  });
});

describe("clamp_placement", () => {
  test("keeps the signature on the page", () => {
    expect(clamp_placement({ x: 0.9, y: -0.1, width: 0.3 }, 3, 0.75)).toEqual({ x: 0.7, y: 0, width: 0.3 });
    expect(clamp_placement({ x: 0, y: 0.99, width: 0.3 }, 3, 0.75).y).toBeCloseTo(1 - 0.075);
    expect(clamp_placement({ x: 0, y: 0, width: 5 }, 3, 0.75).width).toBe(1);
  });
});
