import { to_hex } from "./shapes";

export function base_name(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

let probe: OffscreenCanvasRenderingContext2D | null = null;

// Theme tokens are OKLCH; the colour input only takes #rrggbb, so let the canvas do the gamut mapping.
export function css_to_hex(color: string): string {
  probe ??= new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
  if (!probe) return "#000000";
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000000";
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return to_hex(r, g, b);
}
