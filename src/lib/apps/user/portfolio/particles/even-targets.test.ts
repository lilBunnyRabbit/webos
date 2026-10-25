import { describe, expect, test } from "vitest";
import { TARGET_STRIDE, ToneRule } from "./targets";
import { even_targets } from "./even-targets";

function disc(size: number) {
  const alpha = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if ((x - size / 2) ** 2 + (y - size / 2) ** 2 < (size * 0.4) ** 2) alpha[y * size + x] = 255;
  return { width: size, height: size, alpha };
}

const points = (targets: Float32Array) => Array.from({ length: targets.length / TARGET_STRIDE }, (_, i) => [targets[i * TARGET_STRIDE], targets[i * TARGET_STRIDE + 1]]);

describe("even_targets", () => {
  test("exactly the asked count, every point inside the shape", () => {
    const mask = disc(200);
    const targets = even_targets(mask, 3000, { seed: 7, rule: ToneRule.DIAGONAL });
    expect(targets.length).toBe(3000 * TARGET_STRIDE);
    for (const [x, y] of points(targets)) expect((x - 0.5) ** 2 + (y - 0.5) ** 2).toBeLessThan(0.4 ** 2 + 0.01);
  });

  test("evenly spread: no clumps, unlike white noise", () => {
    const mask = disc(200);
    const all = points(even_targets(mask, 2000, { seed: 3, rule: ToneRule.DIAGONAL }));
    // Nearest-neighbour distances of a jittered grid stay close to the grid step; white noise puts many points on top of
    // each other.
    const nearest = all.slice(0, 300).map(([x, y], i) => Math.min(...all.filter((_, j) => j !== i).map(([u, v]) => Math.hypot(u - x, v - y))));
    const step = Math.sqrt((Math.PI * 0.4 ** 2) / 2000);
    expect(nearest.filter((d) => d < step * 0.2).length).toBeLessThan(nearest.length * 0.05);
  });
});
