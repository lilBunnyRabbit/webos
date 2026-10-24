import { afterEach, describe, expect, test } from "vitest";
import { local_box, local_point } from "./local-box";

let root: HTMLElement | null = null;

function build(transform: string) {
  root = document.createElement("div");
  root.style.cssText = `position: absolute; left: 40px; top: 30px; width: 300.5px; height: 500.25px; transform: ${transform}; transform-origin: 0 0;`;
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position: absolute; inset: 0; width: 100%; height: 100%;";
  const figure = document.createElement("div");
  figure.style.cssText = "position: absolute; left: 50px; top: 20px; width: 160px; height: 140px;";
  root.append(canvas, figure);
  document.body.append(root);
  return { canvas, figure };
}

afterEach(() => {
  root?.remove();
  root = null;
});

describe("local_box", () => {
  test("measures in the host's own px under a running scale", () => {
    const { canvas, figure } = build("scale(0.96) translate(12px, 8px)");
    const box = local_box(canvas, figure);
    expect(box?.x).toBeCloseTo(50, 3);
    expect(box?.y).toBeCloseTo(20, 3);
    expect(box?.width).toBeCloseTo(160, 3);
    expect(box?.height).toBeCloseTo(140, 3);
  });

  test("maps a pointer back the same way", () => {
    const { canvas } = build("scale(0.5)");
    const rect = canvas.getBoundingClientRect();
    const at = local_point(canvas, rect.left + 25, rect.top + 10);
    expect(at?.x).toBeCloseTo(50, 3);
    expect(at?.y).toBeCloseTo(20, 3);
  });

  test("gives up on a host with no size", () => {
    const { canvas, figure } = build("scale(0)");
    expect(local_box(canvas, figure)).toBeNull();
  });
});
