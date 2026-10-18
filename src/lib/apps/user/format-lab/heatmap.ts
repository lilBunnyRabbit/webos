import type { SsimResult } from "$kit/utils/codecs";

/** Below this SSIM a window is fully coloured: the visible losses sit between 1 and about 0.75. */
const FLOOR = 0.75;

export function draw_heatmap({ map, map_width, map_height }: SsimResult, color: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(map_width, map_height);
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(map_width, map_height);
  for (let index = 0; index < map.length; index++) {
    const loss = Math.min(1, Math.max(0, (1 - map[index]) / (1 - FLOOR)));
    image.data[index * 4 + 3] = Math.round(Math.sqrt(loss) * 255);
  }
  context.putImageData(image, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, map_width, map_height);
  return canvas;
}

export function share_of(before: number, after: number): string {
  if (before <= 0) return "";
  const percent = (after / before) * 100;
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}
