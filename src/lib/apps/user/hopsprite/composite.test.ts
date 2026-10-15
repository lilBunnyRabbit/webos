import { describe, expect, it } from "vitest";
import { composite, composite_into, composite_sampled, pick_index } from "./composite";
import { add_layer, set_cel, update_layer } from "./document";
import { cel_key, create_sprite } from "./model";

describe("composite", () => {
  it("stacks layers bottom to top and skips hidden ones", () => {
    let sprite = create_sprite(2, 1, ["#ff0000ff", "#0000ffff"]);
    const bottom = sprite.layers[0].id;
    const { sprite: next, layer } = add_layer(sprite, 0)!;
    sprite = next;
    const frame = sprite.frames[0].id;
    sprite = set_cel(sprite, bottom, frame, Uint8Array.from([1, 1]));
    sprite = set_cel(sprite, layer.id, frame, Uint8Array.from([0, 2]));
    expect(Array.from(composite(sprite, 0))).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(pick_index(sprite, 0, 1, 0)).toBe(2);

    const hidden = update_layer(sprite, layer.id, { visible: false });
    expect(Array.from(composite(hidden, 0))).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
    expect(pick_index(hidden, 0, 1, 0)).toBe(1);
  });

  it("blends layer opacity over what is below", () => {
    let sprite = create_sprite(1, 1, ["#000000ff", "#ffffffff"]);
    const bottom = sprite.layers[0].id;
    const { sprite: next, layer } = add_layer(sprite, 0)!;
    sprite = update_layer(next, layer.id, { opacity: 0.5 });
    sprite = set_cel(sprite, bottom, sprite.frames[0].id, Uint8Array.from([1]));
    sprite = set_cel(sprite, layer.id, sprite.frames[0].id, Uint8Array.from([2]));
    const [r, , , a] = composite(sprite, 0);
    expect(r).toBeGreaterThanOrEqual(127);
    expect(r).toBeLessThanOrEqual(128);
    expect(a).toBe(255);
  });

  it("draws an override in place of the stored cel", () => {
    const sprite = create_sprite(1, 1, ["#ff0000ff"]);
    const overrides = new Map([[cel_key(sprite.layers[0].id, sprite.frames[0].id), Uint8Array.from([1])]]);
    expect(Array.from(composite(sprite, 0, { overrides }))).toEqual([255, 0, 0, 255]);
  });
});

describe("composite_into", () => {
  it("repaints only the rect and matches a full composite there", () => {
    let sprite = create_sprite(3, 2, ["#ff0000ff", "#00ff00ff"]);
    sprite = set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, Uint8Array.from([1, 1, 1, 2, 2, 2]));
    const out = new Uint8ClampedArray(3 * 2 * 4).fill(7);
    composite_into(out, sprite, 0, { x: 1, y: 1, width: 2, height: 1 });
    const full = composite(sprite, 0);
    expect(Array.from(out.slice(16))).toEqual(Array.from(full.slice(16)));
    expect(Array.from(out.slice(0, 12))).toEqual(Array(12).fill(7));
  });
});

describe("composite_sampled", () => {
  it("samples the nearest pixel at a smaller size", () => {
    let sprite = create_sprite(4, 4, ["#ff0000ff", "#0000ffff"]);
    const data = new Uint8Array(16).fill(1);
    data.fill(2, 8);
    sprite = set_cel(sprite, sprite.layers[0].id, sprite.frames[0].id, data);
    expect(Array.from(composite_sampled(sprite, 0, 2, 2))).toEqual([255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
  });
});
