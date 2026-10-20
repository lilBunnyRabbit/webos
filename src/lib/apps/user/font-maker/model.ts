import { CharSet } from "./charsets";

export type StrokePoint = [x: number, y: number, pressure: number];
export type Stroke = StrokePoint[];

export interface Glyph {
  strokes: Stroke[];
  lsb?: number;
  rsb?: number;
  guide?: string;
}

export interface Metrics {
  em: 1000;
  cap: number;
  x: number;
  descender: number;
  bearing: number;
}

export interface FontProject {
  version: 1;
  name: string;
  sets: CharSet[];
  metrics: Metrics;
  glyphs: Record<string, Glyph>;
}

export const EM = 1000;
export const ASCENT = 950;
export const DESCENT = 250;
export const BOX_WIDTH = 1000;
export const SPACE_WIDTH = 260;
export const STROKE_WIDTH = 70;
export const MAX_NUDGE = 400;
export const DEFAULT_PRESSURE = 0.5;

export const DEFAULT_METRICS: Metrics = { em: EM, cap: 700, x: 480, descender: 230, bearing: 60 };

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const BOX: Box = { left: 0, right: BOX_WIDTH, top: ASCENT, bottom: -DESCENT };
export const BOX_HEIGHT = BOX.top - BOX.bottom;

export function create_project(name = "My Handwriting"): FontProject {
  return { version: 1, name, sets: [CharSet.BASIC_LATIN], metrics: { ...DEFAULT_METRICS }, glyphs: {} };
}

export function is_drawn(glyph: Glyph | undefined): boolean {
  return !!glyph && glyph.strokes.length > 0;
}

export function glyph_of(project: FontProject, char: string): Glyph {
  return project.glyphs[char] ?? { strokes: [] };
}

function prune(glyph: Glyph): Glyph | null {
  const kept: Glyph = { strokes: glyph.strokes };
  if (glyph.lsb) kept.lsb = glyph.lsb;
  if (glyph.rsb) kept.rsb = glyph.rsb;
  if (glyph.guide) kept.guide = glyph.guide;
  return kept.strokes.length || kept.lsb || kept.rsb || kept.guide ? kept : null;
}

export function set_glyph(project: FontProject, char: string, glyph: Glyph): FontProject {
  const glyphs = { ...project.glyphs };
  const kept = prune(glyph);
  if (kept) glyphs[char] = kept;
  else delete glyphs[char];
  return { ...project, glyphs };
}

export function update_glyph(project: FontProject, char: string, change: (glyph: Glyph) => Glyph): FontProject {
  return set_glyph(project, char, change(glyph_of(project, char)));
}

export function add_stroke(project: FontProject, char: string, stroke: Stroke): FontProject {
  return update_glyph(project, char, (glyph) => ({ ...glyph, strokes: [...glyph.strokes, stroke] }));
}

export function clear_strokes(project: FontProject, char: string): FontProject {
  return update_glyph(project, char, (glyph) => ({ ...glyph, strokes: [] }));
}

export function set_guides(project: FontProject, guides: ReadonlyMap<string, string>): FontProject {
  let next = project;
  for (const [char, guide] of guides) next = update_glyph(next, char, (glyph) => ({ ...glyph, guide }));
  return next;
}

export function clear_guides(project: FontProject): FontProject {
  let next = project;
  for (const char of Object.keys(project.glyphs)) next = update_glyph(next, char, ({ guide: _guide, ...rest }) => rest);
  return next;
}

export function has_guides(project: FontProject): boolean {
  return Object.values(project.glyphs).some((glyph) => !!glyph.guide);
}

export function clamp_nudge(value: number): number {
  return Math.round(Math.min(MAX_NUDGE, Math.max(-MAX_NUDGE, value)));
}
