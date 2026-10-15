import { describe, expect, test } from "vitest";
import { compact, parse_nonogram, serialize_nonogram, VERDICT_TEXT, type Drawing } from "./file";
import { analyze_solution, Ink, Verdict } from "./puzzle";

const heart: Drawing = {
  width: 3,
  height: 2,
  palette: [Ink.ERROR, Ink.INFO],
  cells: [1, 0, 1, 2, 1, 2],
};

describe("serialize_nonogram", () => {
  test("writes rows as strings and lists the colours", () => {
    const json = JSON.parse(serialize_nonogram({ ...heart, title: "Heart" }));
    expect(json).toEqual({
      version: 1,
      title: "Heart",
      width: 3,
      height: 2,
      colors: ["error", "info"],
      cells: ["1.1", "212"],
    });
  });

  test("leaves colours out of a black-and-white picture", () => {
    const json = JSON.parse(
      serialize_nonogram({ width: 2, height: 2, palette: [Ink.FOREGROUND], cells: [1, 0, 0, 1] })
    );
    expect(json).toEqual({ version: 1, width: 2, height: 2, cells: ["1.", ".1"] });
  });

  test("round-trips through parse", () => {
    const parsed = parse_nonogram(serialize_nonogram(heart));
    expect(parsed).toEqual({ ok: true, drawing: heart });
  });
});

describe("compact", () => {
  test("drops unused colours and renumbers the rest", () => {
    const drawing: Drawing = { width: 2, height: 1, palette: [Ink.PRIMARY, Ink.SUCCESS, Ink.INFO], cells: [3, 0] };
    expect(compact(drawing)).toEqual({ ...drawing, palette: [Ink.INFO], cells: [1, 0] });
  });

  test("keeps one ink for an empty picture", () => {
    expect(compact({ width: 2, height: 2, palette: [Ink.WARNING], cells: [0, 0, 0, 0] }).palette).toEqual([
      Ink.WARNING,
    ]);
  });
});

describe("parse_nonogram", () => {
  const file = (patch: object) => JSON.stringify({ version: 1, width: 3, height: 2, cells: ["1.1", ".1."], ...patch });

  test("reads a black-and-white file", () => {
    expect(parse_nonogram(file({}))).toEqual({
      ok: true,
      drawing: { width: 3, height: 2, palette: [Ink.FOREGROUND], cells: [1, 0, 1, 0, 1, 0] },
    });
  });

  test.each([
    ["not JSON", "{", "valid JSON"],
    ["a wrong version", file({ version: 2 }), ""],
    ["too few rows", file({ cells: ["1.1"] }), "Expected 2 rows"],
    ["a short row", file({ cells: ["1.1", ".1"] }), "Row 2"],
    ["a colour past the palette", file({ cells: ["2..", "..."] }), "Row 1"],
    ["an unknown ink", file({ colors: ["hotpink"] }), ""],
    ["repeated colours", file({ colors: ["info", "info"] }), "repeat"],
    ["five colours", file({ colors: ["info", "error", "success", "warning", "primary"] }), ""],
    ["a huge board", file({ width: 99 }), ""],
  ])("rejects %s", (_, text, message) => {
    const result = parse_nonogram(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });
});

describe("analyze_solution", () => {
  const check_drawing = ({ width, height, palette, cells }: Drawing) =>
    analyze_solution(width, height, palette, cells, 20_000).verdict;

  const bw = (width: number, cells: number[]): Drawing => ({
    width,
    height: cells.length / width,
    palette: [Ink.FOREGROUND],
    cells,
  });

  test("a picture the clues pin down is unique", () => {
    expect(check_drawing(bw(2, [1, 1, 1, 0]))).toBe(Verdict.LOGIC);
    expect(check_drawing(heart)).toBe(Verdict.LOGIC);
  });

  test("a diagonal could go either way", () => {
    expect(check_drawing(bw(2, [1, 0, 0, 1]))).toBe(Verdict.MULTIPLE);
    expect(VERDICT_TEXT[Verdict.MULTIPLE]).toMatch(/^multiple:/);
  });
});
