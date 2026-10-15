import { describe, expect, it } from "vitest";
import {
  add_color,
  added_bytes,
  duplicate_layer,
  insert_frame,
  merge_down,
  add_layer,
  remove_color,
  remove_frame,
  replace_palette,
  resize_sprite,
  set_cel,
  transform_sprite,
  Transform,
  add_tag,
} from "./document";
import { cel_key, create_sprite, Direction, get_cel } from "./model";

const base = () => create_sprite(2, 2, ["#ff0000ff", "#00ff00ff", "#0000ffff"]);

describe("document ops", () => {
  it("shares untouched cels and counts only new bytes", () => {
    let sprite = base();
    const layer = sprite.layers[0].id;
    sprite = set_cel(sprite, layer, sprite.frames[0].id, Uint8Array.from([1, 0, 0, 0]));
    const copied = insert_frame(sprite, 0, true);
    expect(get_cel(copied, layer, 1)).toBe(get_cel(copied, layer, 0));
    expect(added_bytes(sprite, copied)).toBe(0);
    const edited = set_cel(copied, layer, copied.frames[1].id, Uint8Array.from([2, 0, 0, 0]));
    expect(added_bytes(copied, edited)).toBe(4);
    expect(get_cel(copied, layer, 1)![0]).toBe(1);
  });

  it("drops a cel that becomes empty", () => {
    const sprite = base();
    expect(set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, new Uint8Array(4)).cels.size).toBe(0);
  });

  it("merges the upper layer's opaque pixels down", () => {
    let sprite = base();
    const lower = sprite.layers[0].id;
    const added = add_layer(sprite, 0)!;
    sprite = added.sprite;
    const frame = sprite.frames[0].id;
    sprite = set_cel(sprite, lower, frame, Uint8Array.from([1, 1, 0, 0]));
    sprite = set_cel(sprite, added.layer.id, frame, Uint8Array.from([0, 2, 2, 0]));
    const merged = merge_down(sprite, added.layer.id);
    expect(merged.layers).toHaveLength(1);
    expect(Array.from(merged.cels.get(cel_key(lower, frame))!)).toEqual([1, 2, 2, 0]);
  });

  it("duplicates a layer with its cels", () => {
    let sprite = base();
    sprite = set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, Uint8Array.from([3, 0, 0, 0]));
    const { sprite: next, layer } = duplicate_layer(sprite, sprite.layers[0].id)!;
    expect(next.layers[1].name).toBe("Layer 1 copy");
    expect(get_cel(next, layer.id, 0)![0]).toBe(3);
  });

  it("keeps tags on their frames when frames come and go", () => {
    let sprite = base();
    sprite = insert_frame(insert_frame(sprite, 0, false), 1, false);
    sprite = add_tag(sprite, "run", 1, 2, Direction.FORWARD);
    expect(insert_frame(sprite, 0, false).tags[0]).toMatchObject({ from: 2, to: 3 });
    expect(remove_frame(sprite, 0).tags[0]).toMatchObject({ from: 0, to: 1 });
    expect(remove_frame(remove_frame(sprite, 2), 1).tags).toEqual([]);
  });

  it("remaps indices when a colour is removed", () => {
    let sprite = base();
    sprite = set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, Uint8Array.from([1, 2, 3, 0]));
    const next = remove_color(sprite, 2);
    expect(next.palette).toEqual(["#00000000", "#ff0000ff", "#0000ffff"]);
    expect(Array.from(next.cels.values().next().value!)).toEqual([1, 0, 2, 0]);
  });

  it("swaps palettes, sending missing indices to their nearest colour", () => {
    let sprite = base();
    sprite = set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, Uint8Array.from([1, 2, 3, 0]));
    const next = replace_palette(sprite, ["#000000", "#2020f0"]);
    expect(Array.from(next.cels.values().next().value!)).toEqual([1, 2, 2, 0]);
    expect(add_color(next, "#abcdef")!.index).toBe(3);
  });

  it("resizes around an anchor and rotates", () => {
    let sprite = base();
    sprite = set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, Uint8Array.from([1, 0, 0, 2]));
    const bigger = resize_sprite(sprite, 4, 4, 0.5, 0.5);
    expect(Array.from(bigger.cels.values().next().value!)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
    const tall = transform_sprite(resize_sprite(sprite, 3, 2, 0, 0), Transform.ROTATE_CW);
    expect([tall.width, tall.height]).toEqual([2, 3]);
  });
});
