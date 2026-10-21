import { project_characters } from "./charsets";
import { ASCENT, DESCENT, EM, SPACE_WIDTH, STROKE_WIDTH, glyph_of, is_drawn, stroke_width, type FontProject, type Glyph } from "./model";
import { contour_bounds, glyph_contours, type Contour } from "./outline";
import { write_ttf, type TtfGlyph } from "./ttf";

export interface PlacedGlyph {
  contours: Contour[];
  advance: number;
  offset: number;
}

export function place_glyph(glyph: Glyph, bearing: number, width = STROKE_WIDTH): PlacedGlyph | null {
  const contours = glyph_contours(glyph.strokes, width);
  const bounds = contour_bounds(contours);
  if (!bounds) return null;
  const left = bearing + (glyph.lsb ?? 0);
  const right = bearing + (glyph.rsb ?? 0);
  const offset = left - bounds.x_min;
  return {
    contours: contours.map((contour) => contour.map((point) => ({ ...point, x: point.x + offset }))),
    advance: Math.max(1, bounds.x_max - bounds.x_min + left + right),
    offset,
  };
}

function notdef(): Contour[] {
  const box = (x0: number, y0: number, x1: number, y1: number, clockwise: boolean): Contour => {
    const points = [
      { x: x0, y: y0, on: true },
      { x: x0, y: y1, on: true },
      { x: x1, y: y1, on: true },
      { x: x1, y: y0, on: true },
    ];
    return clockwise ? points : points.reverse();
  };
  return [box(60, 0, 440, 700, true), box(110, 50, 390, 650, false)];
}

export function drawn_characters(project: FontProject): string[] {
  return project_characters(project.sets).filter((char) => is_drawn(project.glyphs[char]));
}

export function build_font(project: FontProject, created?: Date): Uint8Array<ArrayBuffer> {
  const glyphs: TtfGlyph[] = [
    { codepoints: [], contours: notdef(), advance: 500 },
    { codepoints: [0x20, 0xa0], contours: [], advance: SPACE_WIDTH },
  ];
  for (const char of drawn_characters(project)) {
    const placed = place_glyph(glyph_of(project, char), project.metrics.bearing, stroke_width(project));
    if (!placed) continue;
    glyphs.push({ codepoints: [char.codePointAt(0)!], contours: placed.contours, advance: placed.advance });
  }
  return write_ttf({
    family: project.name.trim() || "Untitled",
    units_per_em: EM,
    ascent: ASCENT,
    descent: DESCENT,
    cap_height: project.metrics.cap,
    x_height: project.metrics.x,
    glyphs,
    created,
  });
}
