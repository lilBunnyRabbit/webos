import { describe, expect, test } from "vitest";
import { RestoreMode } from "./patch";
import { Effect, redact, type RedactArea } from "./redact";

function source(fill: (context: OffscreenCanvasRenderingContext2D) => void): OffscreenCanvas {
  const canvas = new OffscreenCanvas(120, 120);
  fill(canvas.getContext("2d")!);
  return canvas;
}

function checker(context: OffscreenCanvasRenderingContext2D) {
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 120, 120);
  context.fillStyle = "#000";
  for (let y = 0; y < 120; y++) for (let x = y % 2; x < 120; x += 2) context.fillRect(x, y, 1, 1);
}

const box = (effect: RedactArea["effect"]): RedactArea => ({
  effect,
  op: { kind: "rect", mode: RestoreMode.ADD, rect: { x: 30, y: 30, width: 60, height: 60 } },
});

function pixel(canvas: OffscreenCanvas, x: number, y: number): number[] {
  return [...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data];
}

describe("redact", () => {
  test("box paints the area solid black and leaves the rest", () => {
    const out = redact({ source: source(checker), areas: [box(Effect.BOX)], block: 12, radius: 20 });
    expect(pixel(out, 60, 60)).toEqual([0, 0, 0, 255]);
    expect(pixel(out, 10, 10)).toEqual(pixel(source(checker), 10, 10));
  });

  test("a block size under the floor still pixelates in 12 px blocks", () => {
    const out = redact({ source: source(checker), areas: [box(Effect.PIXELATE)], block: 1, radius: 20 });
    expect(pixel(out, 36, 36)).toEqual(pixel(out, 47, 47));
  });

  test("a radius under the floor still blurs heavily", () => {
    const out = redact({ source: source(checker), areas: [box(Effect.BLUR)], block: 12, radius: 1 });
    const [a] = pixel(out, 60, 60);
    const [b] = pixel(out, 61, 60);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });

  test("erase strokes cut a hole in an area", () => {
    const areas: RedactArea[] = [
      box(Effect.BOX),
      { effect: Effect.BOX, op: { kind: "brush", mode: RestoreMode.ERASE, size: 20, points: [60, 60] } },
    ];
    const out = redact({ source: source(checker), areas, block: 12, radius: 20 });
    expect(pixel(out, 60, 60)).toEqual(pixel(source(checker), 60, 60));
    expect(pixel(out, 35, 35)).toEqual([0, 0, 0, 255]);
  });

  test("on a see-through image the original doesn't show under the blur", () => {
    const glyph = source((context) => {
      context.fillStyle = "rgb(255 0 0 / 0.5)";
      context.fillRect(58, 30, 4, 60);
    });
    const out = redact({ source: glyph, areas: [box(Effect.BLUR)], block: 12, radius: 20 });
    const [, , , alpha] = pixel(out, 60, 60);
    expect(alpha).toBeLessThan(40);
  });
});
