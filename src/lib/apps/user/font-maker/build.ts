import { write_collection } from "$lib/core/utils/font-collection";
import { project_characters } from "./charsets";
import {
  ASCENT,
  DESCENT,
  EM,
  SPACE_WIDTH,
  STROKE_WIDTH,
  face_strokes,
  glyph_of,
  is_drawn,
  project_faces,
  regular_weight,
  stroke_width,
  weight_width,
  type Face,
  type FontProject,
  type Glyph,
} from "./model";
import { auto_pair_kern, face_kerning, kerning_target, pair_chars, type Profiled } from "./kerning";
import { contour_bounds, glyph_contours, glyph_masters, type Contour } from "./outline";
import { MAX_KERN_PAIRS, write_ttf, type TtfGlyph, type TtfKernPair } from "./ttf";

export interface PlacedGlyph {
  contours: Contour[];
  advance: number;
  offset: number;
}

export function place_contours(contours: Contour[], glyph: Pick<Glyph, "lsb" | "rsb">, bearing: number): PlacedGlyph | null {
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

export function place_glyph(glyph: Glyph, bearing: number, width = STROKE_WIDTH, step_width = width): PlacedGlyph | null {
  return place_contours(glyph_contours(glyph.strokes, width, step_width), glyph, bearing);
}

/** Leans a glyph right around the middle of the x-height, so its spacing stays where the upright one had it. */
export function slant_contours(contours: Contour[], slant: number, x_height: number): Contour[] {
  const tan = Math.tan((slant * Math.PI) / 180);
  const pivot = x_height / 2;
  return contours.map((contour) => contour.map((point) => ({ ...point, x: Math.round(point.x + (point.y - pivot) * tan) })));
}

interface WeightOutlines {
  /** By `project.weights` index; `null` where the glyph has no ink at that weight. */
  placed: (PlacedGlyph | null)[];
  /** Every weight has the same contours point for point, so a variable font can interpolate them. */
  compatible: boolean;
}

// Outlined at every weight together: the regular weight's strokes set the sampling, so a static face and the
// variable font's instance at that weight are the same outlines.
function outline_weights(project: FontProject, char: string, italic: boolean): WeightOutlines {
  const glyph = glyph_of(project, char);
  const weights = project.weights.map((item) => item.weight);
  const regular = weights.indexOf(regular_weight(project));
  const order = [regular, ...weights.map((_, index) => index).filter((index) => index !== regular)];
  const strokes = order.map((index) => face_strokes(glyph, { weight: weights[index], italic }));
  const widths = order.map((index) => weight_width(project, weights[index]));
  const step = stroke_width(project);
  const masters = glyph_masters(strokes, widths, step);
  const contours: Contour[][] = weights.map(() => []);
  order.forEach((weight_index, master) => {
    contours[weight_index] = masters ? masters[master] : glyph_contours(strokes[master], widths[master], step);
  });
  const slant = italic ? (project.italic?.slant ?? 0) : 0;
  const placed = contours.map((list) => {
    const upright = place_contours(list, glyph, project.metrics.bearing);
    return upright && slant ? { ...upright, contours: slant_contours(upright.contours, slant, project.metrics.x) } : upright;
  });
  const shape = (list: Contour[]) => list.map((contour) => contour.length).join(",");
  const compatible = masters !== null && placed.every((item) => item !== null) && contours.every((list) => shape(list) === shape(contours[regular]));
  return { placed, compatible };
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

const fixed_glyphs = (): TtfGlyph[] => [
  { codepoints: [], contours: notdef(), advance: 500 },
  { codepoints: [0x20, 0xa0], contours: [], advance: SPACE_WIDTH },
];

export function drawn_characters(project: FontProject): string[] {
  return project_characters(project.sets).filter((char) => is_drawn(project.glyphs[char]));
}

export function family_name(project: FontProject): string {
  return project.name.trim() || "Untitled";
}

function font_base(project: FontProject, face: Face, created?: Date) {
  return {
    family: family_name(project),
    weight: face.weight,
    italic: face.italic,
    slant: face.italic ? (project.italic?.slant ?? 0) : 0,
    units_per_em: EM,
    ascent: ASCENT,
    descent: DESCENT,
    cap_height: project.metrics.cap,
    x_height: project.metrics.x,
    created,
  };
}

// The `kern` table can't vary by weight, so a variable font carries its default weight's pairs.
function kern_pairs(project: FontProject, outlines: ReadonlyMap<string, WeightOutlines>, index: number, first_glyph: number): TtfKernPair[] {
  const placed = new Map<string, Profiled>();
  for (const [char, outline] of outlines) {
    const glyph = outline.placed[index];
    if (glyph) placed.set(char, glyph);
  }
  const ids = new Map([...placed.keys()].map((char, at) => [char, first_glyph + at]));
  const pairs = face_kerning(project.kerning, placed, kerning_target(project.metrics.bearing), MAX_KERN_PAIRS);
  return [...pairs].map(([pair, value]) => {
    const [left, right] = pair_chars(pair)!;
    return { left: ids.get(left)!, right: ids.get(right)!, value };
  });
}

function write_face(project: FontProject, face: Face, outlines: ReadonlyMap<string, WeightOutlines>, created?: Date): Uint8Array<ArrayBuffer> {
  const index = project.weights.findIndex((item) => item.weight === face.weight);
  const glyphs = fixed_glyphs();
  const kerning = kern_pairs(project, outlines, index, glyphs.length);
  for (const [char, outline] of outlines) {
    const placed = outline.placed[index];
    if (placed) glyphs.push({ codepoints: [char.codePointAt(0)!], contours: placed.contours, advance: placed.advance });
  }
  return write_ttf({ ...font_base(project, face, created), glyphs, kerning });
}

function outlines_of(project: FontProject, italic: boolean): Map<string, WeightOutlines> {
  return new Map(drawn_characters(project).map((char) => [char, outline_weights(project, char, italic)]));
}

/** What auto kerning gives a pair in one face, 0 with auto off or a letter not drawn. */
export function auto_kern_of(project: FontProject, face: Face, first: string, second: string): number {
  if (!project.kerning?.auto) return 0;
  const drawn = drawn_characters(project);
  if (!drawn.includes(first) || !drawn.includes(second)) return 0;
  const index = project.weights.findIndex((item) => item.weight === face.weight);
  const left = outline_weights(project, first, face.italic).placed[index];
  const right = outline_weights(project, second, face.italic).placed[index];
  return left && right ? auto_pair_kern(first, second, left, right, kerning_target(project.metrics.bearing)) : 0;
}

export function build_face(project: FontProject, face: Face = { weight: regular_weight(project), italic: false }, created?: Date): Uint8Array<ArrayBuffer> {
  return write_face(project, face, outlines_of(project, face.italic), created);
}

export const build_font = (project: FontProject, created?: Date) => build_face(project, undefined, created);

export function build_family(project: FontProject, created?: Date): Uint8Array<ArrayBuffer> {
  const upright = outlines_of(project, false);
  const italic = project.italic ? outlines_of(project, true) : null;
  const faces = project_faces(project).map((face) => write_face(project, face, face.italic ? italic! : upright, created));
  return write_collection(faces);
}

/** Characters whose weights can't be interpolated: a redraw with a different number of strokes, or an empty one. */
export function variable_blockers(project: FontProject, italic = false): string[] {
  if (project.weights.length < 2) return [];
  return [...outlines_of(project, italic)].filter(([, outline]) => !outline.compatible).map(([char]) => char);
}

export function can_build_variable(project: FontProject, italic = false): boolean {
  return project.weights.length >= 2 && (!italic || !!project.italic) && variable_blockers(project, italic).length === 0;
}

/** One font with a `wght` axis across the project's weights; the regular weight is the default instance. */
export function build_variable(project: FontProject, italic = false, created?: Date): Uint8Array<ArrayBuffer> {
  if (project.weights.length < 2) throw new Error("A variable font needs at least two weights");
  if (italic && !project.italic) throw new Error("This font has no italic");
  const outlines = outlines_of(project, italic);
  const blocked = [...outlines].filter(([, outline]) => !outline.compatible).map(([char]) => char);
  if (blocked.length) throw new Error(`These characters can't vary in weight: ${blocked.join(" ")}`);
  const weights = project.weights.map((item) => item.weight);
  const regular = regular_weight(project);
  const base = weights.indexOf(regular);
  const others = weights.map((_, index) => index).filter((index) => index !== base);
  const glyphs = fixed_glyphs();
  const kerning = kern_pairs(project, outlines, base, glyphs.length);
  for (const [char, outline] of outlines) {
    const placed = outline.placed[base]!;
    glyphs.push({
      codepoints: [char.codePointAt(0)!],
      contours: placed.contours,
      advance: placed.advance,
      masters: others.map((index) => ({ contours: outline.placed[index]!.contours, advance: outline.placed[index]!.advance })),
    });
  }
  return write_ttf({
    ...font_base(project, { weight: regular, italic }, created),
    glyphs,
    kerning,
    variation: { min: weights[0], max: weights[weights.length - 1], masters: others.map((index) => weights[index]), instances: weights },
  });
}
