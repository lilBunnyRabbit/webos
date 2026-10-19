import { clamp } from "$lib/core/utils";
import type { Bounds as Rect, Dimensions as Size } from "$lib/core/utils/type";

export const Handle = {
  MOVE: "move",
  N: "n",
  S: "s",
  E: "e",
  W: "w",
  NE: "ne",
  NW: "nw",
  SE: "se",
  SW: "sw",
} as const;
export type Handle = (typeof Handle)[keyof typeof Handle];

export const RESIZE_HANDLES: Exclude<Handle, "move">[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const MIN_CROP = 1;

export function fit_aspect(bounds: Size, aspect: number | null): Rect {
  if (!aspect) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  let width = bounds.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}

function move(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, bounds.width - rect.width),
    y: clamp(rect.y + dy, 0, bounds.height - rect.height),
  };
}

function free(rect: Rect, handle: Handle, dx: number, dy: number, bounds: Size): Rect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_CROP, bounds.width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_CROP, bounds.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function at_aspect(width: number, height: number, aspect: number, max_width: number, max_height: number): Size {
  let w = Math.max(width, height * aspect, MIN_CROP);
  let h = w / aspect;
  const scale = Math.min(1, max_width / w, max_height / h);
  w *= scale;
  h *= scale;
  return { width: w, height: h };
}

function locked(rect: Rect, handle: Handle, dx: number, dy: number, bounds: Size, aspect: number): Rect {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;

  if (handle.length === 2) {
    const east = handle.includes("e");
    const south = handle.includes("s");
    const anchor_x = east ? rect.x : right;
    const anchor_y = south ? rect.y : bottom;
    const pointer_x = (east ? right : rect.x) + dx;
    const pointer_y = (south ? bottom : rect.y) + dy;
    const size = at_aspect(
      east ? pointer_x - anchor_x : anchor_x - pointer_x,
      south ? pointer_y - anchor_y : anchor_y - pointer_y,
      aspect,
      east ? bounds.width - anchor_x : anchor_x,
      south ? bounds.height - anchor_y : anchor_y
    );
    return {
      x: east ? anchor_x : anchor_x - size.width,
      y: south ? anchor_y : anchor_y - size.height,
      width: size.width,
      height: size.height,
    };
  }

  if (handle === Handle.E || handle === Handle.W) {
    const east = handle === Handle.E;
    const anchor_x = east ? rect.x : right;
    const center_y = rect.y + rect.height / 2;
    const width = east ? rect.width + dx : rect.width - dx;
    const size = at_aspect(
      width,
      0,
      aspect,
      east ? bounds.width - anchor_x : anchor_x,
      2 * Math.min(center_y, bounds.height - center_y)
    );
    return { x: east ? anchor_x : anchor_x - size.width, y: center_y - size.height / 2, ...size };
  }

  const south = handle === Handle.S;
  const anchor_y = south ? rect.y : bottom;
  const center_x = rect.x + rect.width / 2;
  const height = south ? rect.height + dy : rect.height - dy;
  const size = at_aspect(
    0,
    height,
    aspect,
    2 * Math.min(center_x, bounds.width - center_x),
    south ? bounds.height - anchor_y : anchor_y
  );
  return { x: center_x - size.width / 2, y: south ? anchor_y : anchor_y - size.height, ...size };
}

/**
 * The crop after dragging `handle` by (dx, dy) image pixels from `start`. Stays inside `bounds`; with `aspect`
 * (width / height) the ratio holds and edge handles grow around the opposite edge's centre.
 */
export function drag_rect(
  start: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: Size,
  aspect: number | null
): Rect {
  if (handle === Handle.MOVE) return move(start, dx, dy, bounds);
  return aspect ? locked(start, handle, dx, dy, bounds, aspect) : free(start, handle, dx, dy, bounds);
}

export interface AspectPreset {
  value: string;
  label: string;
  ratio: number | null | "original";
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { value: "free", label: "Free", ratio: null },
  { value: "original", label: "Original", ratio: "original" },
  { value: "1:1", label: "1:1", ratio: 1 },
  { value: "4:3", label: "4:3", ratio: 4 / 3 },
  { value: "3:4", label: "3:4", ratio: 3 / 4 },
  { value: "3:2", label: "3:2", ratio: 3 / 2 },
  { value: "2:3", label: "2:3", ratio: 2 / 3 },
  { value: "16:9", label: "16:9", ratio: 16 / 9 },
  { value: "9:16", label: "9:16", ratio: 9 / 16 },
];

export function aspect_of(value: string, image: Size): number | null {
  const preset = ASPECT_PRESETS.find((item) => item.value === value);
  if (!preset || preset.ratio === null) return null;
  return preset.ratio === "original" ? image.width / image.height : preset.ratio;
}
