import { describe, expect, test } from "vitest";
import { add_box } from "./edit";
import { parse_wire, read_wire, serialize_wire } from "./format";
import { create_wire } from "./model";

describe(".wire", () => {
  test("round-trips a sketch", () => {
    const box = add_box(create_wire("m"), null, { x: 800.004, y: 400, z: 2000 }, "#3584e4");
    const wire = parse_wire(serialize_wire(box.wire));
    expect(wire).toEqual(box.wire);
    expect(wire.points.some((point) => point.x === 800)).toBe(true);
  });

  test("leaves out faces that are bent or have a side with no line", () => {
    const points = [
      { id: "a", x: 0, y: 0, z: 0 },
      { id: "b", x: 100, y: 0, z: 0 },
      { id: "c", x: 100, y: 100, z: 0 },
      { id: "d", x: 0, y: 100, z: 50 },
    ];
    const lines = [
      { id: "1", a: "a", b: "b", color: null },
      { id: "2", a: "b", b: "c", color: null },
      { id: "3", a: "c", b: "a", color: null },
    ];
    const faces = [
      { id: "ok", points: ["a", "b", "c"], color: null },
      { id: "bent", points: ["a", "b", "c", "d"], color: null },
      { id: "edgeless", points: ["a", "b", "d"], color: null },
    ];
    const read = read_wire(JSON.stringify({ version: 2, unit: "mm", points, lines, faces }));
    expect(read.wire.faces.map((face) => face.id)).toEqual(["ok"]);
    expect(read.dropped).toBe(2);
  });

  test("opens a version 1 file with no faces and saves it as version 2", () => {
    const wire = parse_wire(JSON.stringify({ version: 1, unit: "mm", points: [{ id: "a", x: 0, y: 0, z: 0 }], lines: [] }));
    expect(wire.faces).toEqual([]);
    expect(JSON.parse(serialize_wire(wire)).version).toBe(2);
    expect(() =>
      parse_wire(JSON.stringify({ ...wire, faces: [{ id: "f", points: ["a", "b", "c"], color: null }] }))
    ).toThrow(/doesn't exist/);
  });

  test("refuses broken references, bad colours and newer versions", () => {
    const base = { version: 1, unit: "cm", points: [{ id: "a", x: 0, y: 0, z: 0 }], lines: [] as unknown[] };
    expect(() => parse_wire(JSON.stringify({ ...base, lines: [{ id: "l", a: "a", b: "zz", color: null }] }))).toThrow(
      /doesn't exist/
    );
    expect(() =>
      parse_wire(
        JSON.stringify({
          ...base,
          points: [...base.points, { id: "b", x: 1, y: 0, z: 0 }],
          lines: [{ id: "l", a: "a", b: "b", color: "red" }],
        })
      )
    ).toThrow(/valid Wireframe/);
    expect(() => parse_wire(JSON.stringify({ ...base, version: 3 }))).toThrow(/newer Wireframe/);
    expect(() => parse_wire("nope")).toThrow(/isn't JSON/);
  });
});
