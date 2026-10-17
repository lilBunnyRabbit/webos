import { describe, expect, test } from "vitest";
import {
  MAP_MARGIN,
  MAX_ACROSS,
  MAX_DPI,
  column_label,
  map_layout,
  overlap_bands,
  parse_length,
  poster_layout,
  sheet_cells,
  sheet_size,
  tile_pixels,
  type PosterSettings,
} from "./poster";

const A4: PosterSettings = { paper: "a4", landscape: false, across: 3, overlap: 10, margin: 10 };

describe("sheet_size", () => {
  test("paper in millimetres, turned for landscape", () => {
    const a4 = sheet_size("a4", false);
    expect(a4.width).toBeCloseTo(210, 1);
    expect(a4.height).toBeCloseTo(297, 1);
    const a3 = sheet_size("a3", true);
    expect(a3.width).toBeCloseTo(420, 1);
    expect(a3.height).toBeCloseTo(297, 1);
  });
});

describe("poster_layout", () => {
  test("width comes from sheets across, rows from the aspect", () => {
    const layout = poster_layout(1100, 1650, A4);
    expect(layout.columns).toBe(3);
    expect(layout.poster.width).toBeCloseTo(550, 1);
    expect(layout.poster.height).toBeCloseTo(825, 1);
    expect(layout.rows).toBe(4);
    expect(layout.sheets).toHaveLength(12);
    expect(layout.dpi).toBeCloseTo(1100 / (550 / 25.4), 3);
  });

  test("an image just inside three rows gets no empty fourth", () => {
    expect(poster_layout(1100, 1620, A4).rows).toBe(3);
    expect(poster_layout(1100, 1626, A4).rows).toBe(4);
  });

  test("sheets are row-major, labelled column letter then row number", () => {
    const layout = poster_layout(1100, 1650, A4);
    expect(layout.sheets.slice(0, 4).map((sheet) => sheet.label)).toEqual(["A1", "B1", "C1", "A2"]);
    expect(layout.sheets.at(-1)!.label).toBe("C4");
  });

  test("neighbours start one printable width less the overlap apart", () => {
    const [a1, b1] = poster_layout(1100, 1650, A4).sheets;
    expect(b1.area.x - a1.area.x).toBeCloseTo(180, 1);
    expect(a1.area.x + a1.area.width - b1.area.x).toBeCloseTo(10, 1);
    expect(b1.source.x).toBeCloseTo(360, 1);
    expect(b1.source.width).toBeCloseTo(380, 1);
  });

  test("the last row prints only the image that's left", () => {
    const layout = poster_layout(1100, 1650, A4);
    const last = layout.sheets.at(-1)!;
    expect(last.area.y).toBeCloseTo(801, 0);
    expect(last.printed.height).toBeCloseTo(24, 0);
    expect(last.source.y + last.source.height).toBeCloseTo(1650, 3);
    expect(last.printed.width).toBeCloseTo(190, 1);
  });

  test("joins mark only the sides with a neighbour", () => {
    const layout = poster_layout(1100, 1650, A4);
    expect(layout.sheets[0].joins).toEqual({ left: false, top: false, right: true, bottom: true });
    expect(layout.sheets.at(-1)!.joins).toEqual({ left: true, top: true, right: false, bottom: false });
  });

  test("without overlap the sheets tile edge to edge", () => {
    const layout = poster_layout(1000, 1000, { ...A4, overlap: 0 });
    expect(layout.poster.width).toBeCloseTo(570, 1);
    expect(overlap_bands(layout)).toEqual([]);
  });

  test("landscape sheets change the poster's size", () => {
    expect(poster_layout(1000, 1000, { ...A4, landscape: true }).poster.width).toBeCloseTo(3 * 267 + 10, 1);
  });

  test("out of range settings are clamped", () => {
    expect(poster_layout(100, 100, { ...A4, across: 0 }).columns).toBe(1);
    expect(poster_layout(100, 100, { ...A4, across: 99 }).columns).toBe(MAX_ACROSS);
    expect(poster_layout(100, 100, { ...A4, overlap: 500 }).overlap).toBeCloseTo(95, 1);
    expect(poster_layout(100, 100, { ...A4, margin: 0 }).margin).toBe(5);
  });
});

describe("column_label", () => {
  test("counts like spreadsheet columns", () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(column_label)).toEqual(["A", "B", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
});

describe("sheet_cells", () => {
  test("cells tile the grid without gaps or overlaps", () => {
    const layout = poster_layout(1100, 1650, A4);
    const cells = sheet_cells(layout);
    const area = cells.reduce((sum, cell) => sum + cell.width * cell.height, 0);
    expect(area).toBeCloseTo(layout.grid.width * layout.grid.height, 3);
    expect(cells[1].x).toBeCloseTo(cells[0].x + cells[0].width, 6);
  });

  test("overlap bands sit between columns and between rows", () => {
    const layout = poster_layout(1100, 1650, A4);
    const bands = overlap_bands(layout);
    expect(bands).toHaveLength(2 + 3);
    expect(bands[0].x).toBeCloseTo(180, 1);
    expect(bands[0].width).toBe(10);
  });
});

describe("tile_pixels", () => {
  test("keeps the source's pixels at low resolution", () => {
    const layout = poster_layout(1100, 1650, A4);
    expect(tile_pixels(layout.sheets[0], layout.dpi)).toEqual({ width: 380, height: 554 });
  });

  test("scales down past the printer's limit", () => {
    const layout = poster_layout(30_000, 30_000, A4);
    const tile = tile_pixels(layout.sheets[0], layout.dpi);
    expect(tile.width).toBeCloseTo((190 / 25.4) * MAX_DPI, -1);
  });
});

describe("map_layout", () => {
  test("fits the grid inside the page margins, landscape for a wide poster", () => {
    const layout = poster_layout(4000, 1000, A4);
    const map = map_layout(layout, "a4");
    expect(map.page.width).toBeGreaterThan(map.page.height);
    expect(map.grid.x).toBeGreaterThanOrEqual(MAP_MARGIN - 1e-6);
    expect(map.grid.x + map.grid.width).toBeLessThanOrEqual(map.page.width - MAP_MARGIN + 1e-6);
    expect(map.cells).toHaveLength(layout.sheets.length);
    expect(map.image.width).toBeCloseTo(map.grid.width, 6);
  });
});

describe("parse_length", () => {
  test("reads millimetres, centimetres and inches", () => {
    expect(parse_length("10")).toBe(10);
    expect(parse_length("10mm")).toBe(10);
    expect(parse_length("1.5cm")).toBe(15);
    expect(parse_length("1in")).toBe(25.4);
    expect(parse_length("ten")).toBeNull();
    expect(parse_length("-5mm")).toBeNull();
  });
});
