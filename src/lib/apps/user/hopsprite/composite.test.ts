import { describe, expect, it } from "vitest";
import { composite, pick_index } from "./composite";
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
