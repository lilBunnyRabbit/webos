import type { Rotation } from "./pages";

import { PageSize } from "./kinds";

export { PageSize };

/** Short and long edge in points. */
export const PAPER: Record<Exclude<PageSize, "image">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  a3: [841.89, 1190.55],
};

const PX_TO_PT = 72 / 96;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImagePage {
  width: number;
  height: number;
  image: Rect;
}

export function image_page(image_width: number, image_height: number, size: PageSize, margin: number): ImagePage {
  if (size === PageSize.IMAGE) {
    const width = image_width * PX_TO_PT;
    const height = image_height * PX_TO_PT;
    return { width: width + margin * 2, height: height + margin * 2, image: { x: margin, y: margin, width, height } };
  }
  const [short, long] = PAPER[size];
  const landscape = image_width > image_height;
  const page_width = landscape ? long : short;
  const page_height = landscape ? short : long;
  const room_width = Math.max(1, page_width - margin * 2);
  const room_height = Math.max(1, page_height - margin * 2);
  const scale = Math.min(room_width / image_width, room_height / image_height);
  const width = image_width * scale;
  const height = image_height * scale;
  return {
    width: page_width,
    height: page_height,
    image: { x: (page_width - width) / 2, y: (page_height - height) / 2, width, height },
  };
}

export type Matrix = [number, number, number, number, number, number];

// PDF ignores EXIF orientation, so a JPEG embedded as stored needs its turn and flip in the matrix that places it.
export function oriented_matrix(orientation: number, { x, y, width: w, height: h }: Rect): Matrix {
  switch (orientation) {
    case 2:
      return [-w, 0, 0, h, x + w, y];
    case 3:
      return [-w, 0, 0, -h, x + w, y + h];
    case 4:
      return [w, 0, 0, -h, x, y + h];
    case 5:
      return [0, -h, -w, 0, x + w, y + h];
    case 6:
      return [0, -h, w, 0, x, y + h];
    case 7:
      return [0, h, w, 0, x, y];
    case 8:
      return [0, h, -w, 0, x + w, y];
    default:
      return [w, 0, 0, h, x, y];
  }
}

export function displayed_size(box: Rect, rotation: Rotation): { width: number; height: number } {
  return rotation % 180 === 0 ? { width: box.width, height: box.height } : { width: box.height, height: box.width };
}

// The crop box is what a viewer shows, so placements are relative to it.
export function display_to_pdf(box: Rect, rotation: Rotation, dx: number, dy: number): { x: number; y: number } {
  const { width: w, height: h } = box;
  const [x, y] =
    rotation === 90 ? [dy, dx] : rotation === 180 ? [w - dx, dy] : rotation === 270 ? [w - dy, h - dx] : [dx, h - dy];
  return { x: box.x + x, y: box.y + y };
}

export interface Placement {
  x: number;
  y: number;
  width: number;
}

export interface Stamp {
  x: number;
  y: number;
  scale: number;
  // Counter-clockwise degrees, as pdf-lib takes them: equal to the page's /Rotate, so the stamp reads upright.
  rotate: number;
}

// drawSvgPath puts the SVG's top-left at (x, y), rotates, then scales with y flipped.
export function stamp_geometry(box: Rect, rotation: Rotation, placement: Placement, view_width: number, view_x = 0, view_y = 0): Stamp {
  const shown = displayed_size(box, rotation);
  const scale = (placement.width * shown.width) / view_width;
  const origin = display_to_pdf(box, rotation, placement.x * shown.width - view_x * scale, placement.y * shown.height - view_y * scale);
  return { x: origin.x, y: origin.y, scale, rotate: rotation };
}

export function text_origin(box: Rect, rotation: Rotation, dx: number, dy: number, size: number): { x: number; y: number } {
  return display_to_pdf(box, rotation, dx, dy + size * 0.8);
}

export function clamp_placement(placement: Placement, aspect: number, page_aspect: number): Placement {
  const width = Math.min(1, Math.max(0.03, placement.width));
  const height = (width / aspect) * page_aspect;
  return {
    width,
    x: Math.min(1 - width, Math.max(0, placement.x)),
    y: Math.min(Math.max(0, 1 - height), Math.max(0, placement.y)),
  };
}

const PT_TO_MM = 25.4 / 72;

const PAPER_NAMES: [string, number, number][] = [
  ["A3", 297, 420],
  ["A4", 210, 297],
  ["A5", 148, 210],
  ["Letter", 215.9, 279.4],
  ["Legal", 215.9, 355.6],
];

export function page_size_label(width_pt: number, height_pt: number): string {
  const width = width_pt * PT_TO_MM;
  const height = height_pt * PT_TO_MM;
  const [short, long] = width < height ? [width, height] : [height, width];
  const paper = PAPER_NAMES.find(([, w, h]) => Math.abs(short - w) < 1.5 && Math.abs(long - h) < 1.5)?.[0];
  const mm = `${Math.round(width)} × ${Math.round(height)} mm`;
  return paper ? `${mm} · ${paper}${width > height ? " landscape" : ""}` : mm;
}
