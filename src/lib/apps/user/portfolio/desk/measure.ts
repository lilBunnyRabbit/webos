import type { Rgb } from "../contrast";

export interface Measured {
  rgb: Rgb;
  css: string;
}

/**
 * Theme tokens can be expressions (`color-mix()`, relative colours), so the browser resolves each one on a probe element
 * and a 1×1 canvas reads back sRGB. Values are CSS colours, `var(--primary)` or `color-mix(…)`.
 */
export function measure_colors(values: Record<string, string>): Record<string, Measured> {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const result: Record<string, Measured> = {};
  try {
    if (!context) return result;
    for (const [key, value] of Object.entries(values)) {
      probe.style.color = value;
      const css = getComputedStyle(probe).color;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      result[key] = { rgb: [r, g, b], css };
    }
    return result;
  } finally {
    probe.remove();
  }
}
