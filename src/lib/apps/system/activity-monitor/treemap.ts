import { file_extension } from "$lib/core/api/services/files/path";
import type { SizeNode } from "$lib/core/api";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Tile<T> extends Rect {
  item: T;
}

/** Bruls, Huizing and van Wijk's squarified layout: a row grows while that doesn't worsen its worst aspect ratio. */
function worst(areas: number[], length: number): number {
  const sum = areas.reduce((total, area) => total + area, 0);
  const side = length * length;
  return Math.max(...areas.map((area) => Math.max((side * area) / (sum * sum), (sum * sum) / (side * area))));
}

export function squarify<T>(items: T[], size: (item: T) => number, bounds: Rect): Tile<T>[] {
  const sized = items.map((item) => ({ item, value: size(item) })).filter((entry) => entry.value > 0);
  sized.sort((a, b) => b.value - a.value);
  const total = sized.reduce((sum, entry) => sum + entry.value, 0);
  if (total === 0 || bounds.width <= 0 || bounds.height <= 0) return [];

  const scale = (bounds.width * bounds.height) / total;
  const queue = sized.map((entry) => ({ item: entry.item, area: entry.value * scale }));
  const tiles: Tile<T>[] = [];
  let rest = { ...bounds };
  let row: typeof queue = [];

  const place = () => {
    const sum = row.reduce((total, entry) => total + entry.area, 0);
    const wide = rest.width >= rest.height;
    const thickness = sum / (wide ? rest.height : rest.width);
    let offset = 0;
    for (const entry of row) {
      const length = entry.area / thickness;
      tiles.push(
        wide
          ? { item: entry.item, x: rest.x, y: rest.y + offset, width: thickness, height: length }
          : { item: entry.item, x: rest.x + offset, y: rest.y, width: length, height: thickness }
      );
      offset += length;
    }
    rest = wide
      ? { x: rest.x + thickness, y: rest.y, width: rest.width - thickness, height: rest.height }
      : { x: rest.x, y: rest.y + thickness, width: rest.width, height: rest.height - thickness };
    row = [];
  };

  for (const entry of queue) {
    const length = Math.min(rest.width, rest.height);
    const areas = row.map((placed) => placed.area);
    if (row.length > 0 && worst([...areas, entry.area], length) > worst(areas, length)) place();
    row.push(entry);
  }
  if (row.length > 0) place();
  return tiles;
}

export const TileKind = {
  FOLDER: "folder",
  IMAGE: "image",
  MEDIA: "media",
  OTHER: "other",
} as const;

export type TileKind = (typeof TileKind)[keyof typeof TileKind];

const IMAGE = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".bmp", ".ico", ".heic"]);
const MEDIA = new Set([".mp4", ".webm", ".mov", ".mkv", ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"]);

/** A folder is any node with `children`, which `size_tree` gives every folder within the asked depth. */
export function tile_kind(node: SizeNode): TileKind {
  if (node.children) return TileKind.FOLDER;
  const extension = file_extension(node.name);
  if (IMAGE.has(extension)) return TileKind.IMAGE;
  if (MEDIA.has(extension)) return TileKind.MEDIA;
  return TileKind.OTHER;
}

export function ancestors(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  return ["/", ...segments.map((_, index) => "/" + segments.slice(0, index + 1).join("/"))];
}
