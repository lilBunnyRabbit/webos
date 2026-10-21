import { CharSet } from "./charsets";

export type StrokePoint = [x: number, y: number, pressure: number];
export type Stroke = StrokePoint[];

export interface Glyph {
  strokes: Stroke[];
  lsb?: number;
  rsb?: number;
  guide?: string;
  /** Redraws for one weight, keyed by weight ("700"). Kept even when empty, so a redraw in progress doesn't fall back. */
  weights?: Record<string, Stroke[]>;
  /** Redraw for the italic faces, drawn upright and slanted like everything else. */
  italic?: Stroke[];
}

export interface Metrics {
  em: 1000;
  cap: number;
  x: number;
  descender: number;
  bearing: number;
}

export interface StrokeStyle {
  width: number;
}

export interface FontWeight {
  /** 100–900 in steps of 100. */
  weight: number;
  /** Multiplier on the project's stroke width. */
  scale: number;
}

export interface Italic {
  /** Degrees the italic faces lean right. */
  slant: number;
}

export interface FontProject {
  version: 2;
  name: string;
  sets: CharSet[];
  metrics: Metrics;
  stroke?: StrokeStyle;
  weights: FontWeight[];
  /** `null`: upright faces only. */
  italic: Italic | null;
  glyphs: Record<string, Glyph>;
}

export interface Face {
  weight: number;
  italic: boolean;
}

export type Layer = { kind: "regular" } | { kind: "weight"; weight: number } | { kind: "italic" };

export const EM = 1000;
export const ASCENT = 950;
export const DESCENT = 250;
export const BOX_WIDTH = 1000;
export const SPACE_WIDTH = 260;
export const STROKE_WIDTH = 70;
export const MIN_STROKE_WIDTH = 20;
export const MAX_STROKE_WIDTH = 160;
export const MAX_NUDGE = 400;
export const DEFAULT_PRESSURE = 0.5;
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;
export const MAX_SLANT = 25;
export const DEFAULT_SLANT = 10;
export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const DEFAULT_WEIGHTS: readonly FontWeight[] = [
  { weight: 400, scale: 1 },
  { weight: 700, scale: 1.7 },
];
export const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

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
  return {
    version: 2,
    name,
    sets: [CharSet.BASIC_LATIN],
    metrics: { ...DEFAULT_METRICS },
    weights: DEFAULT_WEIGHTS.map((weight) => ({ ...weight })),
    italic: { slant: DEFAULT_SLANT },
    glyphs: {},
  };
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
  if (glyph.weights && Object.keys(glyph.weights).length) kept.weights = glyph.weights;
  if (glyph.italic) kept.italic = glyph.italic;
  return kept.strokes.length || kept.lsb || kept.rsb || kept.guide || kept.weights || kept.italic ? kept : null;
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

export const REGULAR_LAYER: Layer = { kind: "regular" };

/** The listed weight nearest 400: its faces use the regular strokes, and a variable font's default sits there. */
export function regular_weight(project: FontProject): number {
  return project.weights.reduce((best, item) => (Math.abs(item.weight - 400) < Math.abs(best - 400) ? item.weight : best), project.weights[0].weight);
}

export function layer_strokes(glyph: Glyph, layer: Layer): Stroke[] {
  if (layer.kind === "italic") return glyph.italic ?? glyph.strokes;
  if (layer.kind === "weight") return glyph.weights?.[layer.weight] ?? glyph.strokes;
  return glyph.strokes;
}

export function is_redrawn(glyph: Glyph, layer: Layer): boolean {
  if (layer.kind === "italic") return !!glyph.italic;
  if (layer.kind === "weight") return !!glyph.weights && Object.hasOwn(glyph.weights, layer.weight);
  return false;
}

/** The italic redraw wins, then the weight's redraw, then the regular strokes. */
export function face_strokes(glyph: Glyph, face: Face): Stroke[] {
  if (face.italic && glyph.italic) return glyph.italic;
  return glyph.weights?.[face.weight] ?? glyph.strokes;
}

function with_layer(glyph: Glyph, layer: Layer, strokes: Stroke[]): Glyph {
  if (layer.kind === "italic") return { ...glyph, italic: strokes };
  if (layer.kind === "weight") return { ...glyph, weights: { ...glyph.weights, [layer.weight]: strokes } };
  return { ...glyph, strokes };
}

/** The first stroke in a weight or italic layer starts its redraw from the strokes the layer showed until then. */
export function add_stroke(project: FontProject, char: string, stroke: Stroke, layer: Layer = REGULAR_LAYER): FontProject {
  return update_glyph(project, char, (glyph) => with_layer(glyph, layer, [...layer_strokes(glyph, layer), stroke]));
}

export function clear_strokes(project: FontProject, char: string, layer: Layer = REGULAR_LAYER): FontProject {
  return update_glyph(project, char, (glyph) => with_layer(glyph, layer, []));
}

export function reset_layer(project: FontProject, char: string, layer: Layer): FontProject {
  if (!is_redrawn(glyph_of(project, char), layer)) return project;
  return update_glyph(project, char, (glyph) => {
    if (layer.kind === "italic") {
      const { italic: _italic, ...rest } = glyph;
      return rest;
    }
    if (layer.kind !== "weight" || !glyph.weights) return glyph;
    const { [layer.weight]: _dropped, ...weights } = glyph.weights;
    return { ...glyph, weights };
  });
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

export function stroke_width(project: FontProject): number {
  return project.stroke?.width ?? STROKE_WIDTH;
}

export function set_stroke_width(project: FontProject, width: number): FontProject {
  const next = Math.round(Math.min(MAX_STROKE_WIDTH, Math.max(MIN_STROKE_WIDTH, width)));
  return next === stroke_width(project) ? project : { ...project, stroke: { width: next } };
}

export function weight_width(project: FontProject, weight: number): number {
  const scale = project.weights.find((item) => item.weight === weight)?.scale ?? 1;
  return Math.max(1, Math.round(stroke_width(project) * scale));
}

export function layer_weight(project: FontProject, layer: Layer): number {
  return layer.kind === "weight" ? layer.weight : regular_weight(project);
}

export function project_faces(project: FontProject): Face[] {
  const faces: Face[] = project.weights.map((item) => ({ weight: item.weight, italic: false }));
  if (project.italic) faces.push(...project.weights.map((item) => ({ weight: item.weight, italic: true })));
  return faces;
}

export function style_name(weight: number, italic: boolean): string {
  const name = WEIGHT_NAMES[weight] ?? String(weight);
  if (!italic) return name;
  return name === "Regular" ? "Italic" : `${name} Italic`;
}

export function set_weights(project: FontProject, weights: readonly FontWeight[]): FontProject {
  const seen = new Set<number>();
  const kept: FontWeight[] = [];
  for (const item of weights) {
    if (seen.has(item.weight)) continue;
    seen.add(item.weight);
    kept.push({ weight: item.weight, scale: Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, item.scale)) * 100) / 100 });
  }
  kept.sort((a, b) => a.weight - b.weight);
  return kept.length ? { ...project, weights: kept } : project;
}

export function set_slant(project: FontProject, slant: number | null): FontProject {
  return { ...project, italic: slant === null ? null : { slant: Math.round(Math.min(MAX_SLANT, Math.max(0, slant))) } };
}

export function reset_spacing(project: FontProject, char: string): FontProject {
  const glyph = project.glyphs[char];
  if (!glyph?.lsb && !glyph?.rsb) return project;
  return update_glyph(project, char, ({ lsb: _lsb, rsb: _rsb, ...rest }) => rest);
}

export function clamp_nudge(value: number): number {
  return Math.round(Math.min(MAX_NUDGE, Math.max(-MAX_NUDGE, value)));
}
