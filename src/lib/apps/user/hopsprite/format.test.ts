import { describe, expect, it } from "vitest";
import { insert_frame, set_cel, add_tag } from "./document";
import { parse_sprite, serialize_sprite, to_file } from "./format";
import { cel_key, create_sprite, Direction, type Sprite } from "./model";

function sample(): Sprite {
  let sprite = create_sprite(4, 3, ["#ff0000ff", "#00ff0080"]);
  const layer = sprite.layers[0];
  const cel = new Uint8Array(12);
  cel[5] = 1;
  cel[6] = 2;
  sprite = set_cel(sprite, layer.id, sprite.frames[0].id, cel);
  sprite = insert_frame(sprite, 0, false);
  sprite = add_tag(sprite, "walk", 0, 1, Direction.PINGPONG);
  return { ...sprite, layers: [{ ...sprite.layers[0], name: "Ink", opacity: 0.5 }] };
}

describe("hopsprite format", () => {
  it("round-trips a sprite", () => {
    const sprite = sample();
    const back = parse_sprite(serialize_sprite(sprite));
    expect(back.width).toBe(4);
    expect(back.height).toBe(3);
    expect(back.palette).toEqual(["#00000000", "#ff0000ff", "#00ff0080"]);
    expect(back.layers.map(({ name, opacity }) => ({ name, opacity }))).toEqual([{ name: "Ink", opacity: 0.5 }]);
    expect(back.frames.map((frame) => frame.duration)).toEqual([100, 100]);
    expect(back.tags).toEqual([{ name: "walk", from: 0, to: 1, direction: "pingpong" }]);
    const cel = back.cels.get(cel_key(back.layers[0].id, back.frames[0].id))!;
    expect(Array.from(cel)).toEqual(Array.from(sprite.cels.values().next().value!));
    expect(back.cels.size).toBe(1);
  });

  it("stores cels trimmed to their content, run-length encoded", () => {
    const file = to_file(sample());
    expect(file.format).toBe("hopsprite");
    expect(file.version).toBe(1);
    expect(file.cels).toEqual([{ layer: 0, frame: 0, x: 1, y: 1, w: 2, h: 1, rle: [[1, 1], [1, 2]] }]);
  });

  it("writes valid JSON with one cel per line", () => {
    const text = serialize_sprite(sample());
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain('\n    {"layer":0,');
    const empty = create_sprite(2, 2, []);
    expect(JSON.parse(serialize_sprite(empty)).cels).toEqual([]);
  });

  it("rejects broken files with a reason", () => {
    expect(() => parse_sprite("nope")).toThrow(/isn't JSON/);
    expect(() => parse_sprite(JSON.stringify({ format: "png" }))).toThrow(/valid Hopsprite/);
    const file = to_file(sample());
    expect(() => parse_sprite(JSON.stringify({ ...file, version: 9 }))).toThrow(/newer Hopsprite/);
    expect(() => parse_sprite(JSON.stringify({ ...file, cels: [{ ...file.cels[0], x: 3 }] }))).toThrow(/past the canvas/);
    expect(() => parse_sprite(JSON.stringify({ ...file, cels: [{ ...file.cels[0], rle: [[1, 9], [1, 1]] }] }))).toThrow(/past the palette/);
    expect(() => parse_sprite(JSON.stringify({ ...file, cels: [{ ...file.cels[0], layer: 4 }] }))).toThrow(/doesn't exist/);
  });

  it("forces index 0 to transparent", () => {
    const file = to_file(sample());
    const back = parse_sprite(JSON.stringify({ ...file, palette: ["#ffffffff", ...file.palette.slice(1)] }));
    expect(back.palette[0]).toBe("#00000000");
  });
});
