import { describe, expect, it } from "vitest";
import { blur_radius, cover_rect, frame_rect } from "./render";

const source = { width: 1920, height: 1080 };

describe("render", () => {
  it("puts the camera centre in the middle of the output", () => {
    const output = { width: 960, height: 540 };
    const rect = frame_rect(source, output, { cx: 300, cy: 200, scale: 1 }, { zoom: 2, follow_size: false });
    expect(rect.width).toBe(1920);
    expect(rect.x + 300 * (rect.width / source.width)).toBe(480);
    expect(rect.y + 200 * (rect.height / source.height)).toBe(270);
  });

  it("zooms out as the subject grows with Follow size, and ignores scale without it", () => {
    const output = { width: 960, height: 540 };
    const camera = { cx: 960, cy: 540, scale: 2 };
    expect(frame_rect(source, output, camera, { zoom: 2, follow_size: true }).width).toBe(960);
    expect(frame_rect(source, output, camera, { zoom: 2, follow_size: false }).width).toBe(1920);
  });

  it("covers the output, centred, past the margin", () => {
    const rect = cover_rect({ width: 100, height: 50 }, { width: 100, height: 100 }, 10);
    expect(rect).toEqual({ x: -70, y: -10, width: 240, height: 120 });
  });

  it("scales the blur with the output", () => {
    expect(blur_radius({ width: 1920, height: 1080 })).toBe(48);
    expect(blur_radius({ width: 80, height: 60 })).toBe(4);
  });
});
