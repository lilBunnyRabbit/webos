import { dark_mask, project, regions, sample, type Gray, type Matrix, type Quad, type Region } from "$kit/utils/perspective";
import type { TemplateBox } from "./template";

function holed(mask: Uint8Array, width: number, blob: Region): boolean {
  const radius = Math.max(1, Math.round(Math.min(blob.x_max - blob.x_min, blob.y_max - blob.y_min) / 12));
  let light = 0;
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      total++;
      if (!mask[Math.round(blob.cy + dy) * width + Math.round(blob.cx + dx)]) light++;
    }
  }
  return light > total / 2;
}

export function find_marks(gray: Gray): Quad | null {
  const { width, height } = gray;
  const mask = dark_mask(gray);
  const side = Math.min(width, height);
  const candidates = regions(mask, width, height).filter((blob) => {
    const w = blob.x_max - blob.x_min + 1;
    const h = blob.y_max - blob.y_min + 1;
    const aspect = w / h;
    return !blob.edge && blob.area >= (side * 0.012) ** 2 && blob.area <= (side * 0.15) ** 2 && aspect > 0.4 && aspect < 2.5 && blob.area / (w * h) >= 0.4;
  });
  const quadrants: (Region | null)[] = [null, null, null, null];
  for (const blob of candidates) {
    const right = blob.cx >= width / 2;
    const bottom = blob.cy >= height / 2;
    const index = bottom ? (right ? 2 : 3) : right ? 1 : 0;
    if (!quadrants[index] || quadrants[index]!.area < blob.area) quadrants[index] = blob;
  }
  if (quadrants.some((blob) => !blob)) return null;
  const found = quadrants as Region[];
  const areas = found.map((blob) => blob.area);
  if (Math.max(...areas) > Math.min(...areas) * 5) return null;
  const holes = found.map((blob) => holed(mask, width, blob));
  const first = holes.filter(Boolean).length === 1 ? holes.indexOf(true) : 0;
  return [0, 1, 2, 3].map((step) => {
    const blob = found[(first + step) % 4];
    return { x: blob.cx + 0.5, y: blob.cy + 0.5 };
  }) as Quad;
}

export function crop_box(gray: Gray, page_to_image: Matrix, box: TemplateBox, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const point = project(page_to_image, { x: box.x + ((i + 0.5) / width) * box.width, y: box.y + ((j + 0.5) / height) * box.height });
      data[j * width + i] = sample(gray, point.x, point.y);
    }
  }
  const sorted = Uint8Array.from(data).sort();
  const white = Math.max(1, sorted[Math.floor(sorted.length * 0.9)]);
  for (let index = 0; index < data.length; index++) data[index] = Math.min(255, Math.round((data[index] * 255) / white));
  return { width, height, data };
}

export function has_ink(gray: Gray): boolean {
  const { width, height, data } = gray;
  const inset_x = Math.ceil(width * 0.06);
  const inset_y = Math.ceil(height * 0.06);
  let ink = 0;
  let total = 0;
  for (let y = inset_y; y < height - inset_y; y++) {
    for (let x = inset_x; x < width - inset_x; x++) {
      total++;
      if (data[y * width + x] < 128) ink++;
    }
  }
  return total > 0 && ink / total > 0.003;
}
