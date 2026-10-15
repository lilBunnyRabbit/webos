import { describe, expect, it } from "vitest";
import { frame_sequence } from "./sequence";
import { animated_svg, color_rects, dedupe_frames, frame_body, static_svg } from "./svg";
import { Direction } from "./model";

function rgba(pixels: number[][]): Uint8ClampedArray {
  return Uint8ClampedArray.from(pixels.flat());
}

const RED = [255, 0, 0, 255];
const NONE = [0, 0, 0, 0];

describe("svg export", () => {
  it("merges runs into rectangles across rows", () => {
    const image = rgba([RED, RED, NONE, RED, RED, NONE]);
    const rects = [...color_rects(image, 3, 2).values()];
    expect(rects).toEqual([[{ x: 0, y: 0, width: 2, height: 2 }]]);
  });

  it("writes one path per colour with crisp edges", () => {
    const image = rgba([RED, [0, 0, 255, 128]]);
    const svg = static_svg(image, 2, 1, 8);
    expect(svg).toContain('width="16" height="8" viewBox="0 0 2 1" shape-rendering="crispEdges"');
    expect(svg).toContain('<path fill="#ff0000" d="M0 0h1v1h-1z"/>');
    expect(svg).toContain('fill="#0000ff" fill-opacity="0.502"');
    expect(frame_body(rgba([NONE]), 1, 1)).toBe("");
  });

  it("dedupes identical frames", () => {
    const a = rgba([RED]);
    const b = rgba([NONE]);
    expect(dedupe_frames([a, b, rgba([RED]), b])).toEqual([0, 1, 0, 1]);
  });

  it("animates unique frames with discrete SMIL visibility", () => {
    const order = frame_sequence({ from: 0, to: 2 }, Direction.PINGPONG);
    expect(order).toEqual([0, 1, 2, 1]);
    const svg = animated_svg({
      width: 1,
      height: 1,
      scale: 1,
      bodies: ["<path/>", "<path/>", "<path/>"],
      steps: order.map((frame) => ({ frame, duration: 100 })),
      loop: true,
    });
    expect(svg.match(/<symbol /g)).toHaveLength(3);
    expect(svg).toContain('<g visibility="visible"><use href="#f0"/><animate attributeName="visibility" calcMode="discrete" values="visible;hidden" keyTimes="0;0.25" dur="400ms" repeatCount="indefinite"/></g>');
    expect(svg).toContain('values="hidden;visible;hidden;visible" keyTimes="0;0.25;0.5;0.75"');
    expect(svg).toContain('values="hidden;visible;hidden" keyTimes="0;0.5;0.75"');
  });

  it("plays once and holds the last frame when not looping", () => {
    const svg = animated_svg({ width: 1, height: 1, scale: 1, bodies: ["", ""], steps: [{ frame: 0, duration: 50 }, { frame: 1, duration: 150 }], loop: false });
    expect(svg).toContain('dur="200ms" repeatCount="1" fill="freeze"');
  });

  it("orders reverse and forward sequences", () => {
    expect(frame_sequence({ from: 1, to: 3 }, Direction.REVERSE)).toEqual([3, 2, 1]);
    expect(frame_sequence({ from: 0, to: 0 }, Direction.PINGPONG)).toEqual([0]);
  });
});
