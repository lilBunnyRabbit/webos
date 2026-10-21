import { z } from "zod";
import { CHAR_SETS } from "./charsets";
import { MAX_MANUAL_KERN, pair_chars } from "./kerning";
import {
  ASCENT,
  DEFAULT_SLANT,
  DEFAULT_WEIGHTS,
  DESCENT,
  EM,
  MAX_NUDGE,
  MAX_SCALE,
  MAX_SLANT,
  MAX_STROKE_WIDTH,
  MIN_SCALE,
  MIN_STROKE_WIDTH,
  type FontProject,
  type Glyph,
  type Stroke,
} from "./model";

export const VERSION = 3;
export const EXTENSION = ".fontmaker";

const Coordinate = z.number().finite().min(-2 * EM).max(2 * EM);
const Point = z.tuple([Coordinate, Coordinate, z.number().min(0).max(1)]);
const Nudge = z.number().int().min(-MAX_NUDGE).max(MAX_NUDGE);
const Strokes = z.array(z.array(Point).min(1));
const Weight = z.number().int().min(100).max(900).multipleOf(100);
const Redraws = z.record(z.string().regex(/^[1-9]00$/, "redraws are for weights 100 to 900"), Strokes);

const GlyphSchema = z.object({
  strokes: Strokes,
  lsb: Nudge.optional(),
  rsb: Nudge.optional(),
  guide: z
    .string()
    .regex(/^data:image\/(webp|png|jpeg);base64,/)
    .optional(),
  weights: Redraws.optional(),
  italic: Strokes.optional(),
  italics: Redraws.optional(),
});

const ProjectSchema = z.object({
  version: z.number().int().min(1),
  name: z.string().trim().min(1).max(100),
  sets: z.array(z.enum(CHAR_SETS)).min(1),
  metrics: z
    .object({
      em: z.literal(EM),
      cap: z.number().int().min(100).max(ASCENT),
      x: z.number().int().min(50).max(ASCENT),
      descender: z.number().int().min(0).max(DESCENT),
      bearing: z.number().int().min(0).max(300),
    })
    .refine((metrics) => metrics.x <= metrics.cap, { message: "x-height is above the cap height" }),
  stroke: z.object({ width: z.number().int().min(MIN_STROKE_WIDTH).max(MAX_STROKE_WIDTH) }).optional(),
  weights: z
    .array(z.object({ weight: Weight, scale: z.number().min(MIN_SCALE).max(MAX_SCALE) }))
    .min(1)
    .refine((weights) => new Set(weights.map((item) => item.weight)).size === weights.length, "weights repeat")
    .optional(),
  italic: z
    .object({ slant: z.number().min(0).max(MAX_SLANT) })
    .nullable()
    .optional(),
  kerning: z
    .object({
      auto: z.boolean(),
      pairs: z.record(z.string().refine((key) => pair_chars(key) !== null, "kerning keys are two characters"), z.number().int().min(-MAX_MANUAL_KERN).max(MAX_MANUAL_KERN)).optional(),
    })
    .optional(),
  glyphs: z.record(z.string().refine((key) => [...key].length === 1, "keys are single characters"), GlyphSchema),
});

export function parse_project(text: string): FontProject {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Font Maker file: it isn't JSON");
  }
  const version = (json as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > VERSION) {
    throw new Error(`This file was made by a newer Font Maker (format ${version})`);
  }
  const result = ProjectSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`This isn't a valid Font Maker file: ${issue.path.join(".") || "root"} ${issue.message}`);
  }
  const { name, sets, metrics, stroke, weights, italic, kerning, glyphs } = result.data;
  const project: FontProject = {
    version: VERSION,
    name,
    sets: [...new Set(sets)],
    metrics: { ...metrics, em: EM },
    // Version 1 had one face; it opens with the default family (Regular, Bold and their italics) like a new project.
    weights: (weights ?? DEFAULT_WEIGHTS).map((item) => ({ ...item })).sort((a, b) => a.weight - b.weight),
    italic: italic === undefined ? { slant: DEFAULT_SLANT } : italic,
    glyphs: glyphs as Record<string, Glyph>,
  };
  if (stroke) project.stroke = { width: stroke.width };
  if (kerning) project.kerning = kerning.pairs ? { auto: kerning.auto, pairs: { ...kerning.pairs } } : { auto: kerning.auto };
  return project;
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function compact(stroke: Stroke): Stroke {
  return stroke.map(([x, y, pressure]) => [round(x, 1), round(y, 1), round(pressure, 2)]);
}

const compact_redraws = (redraws: Record<string, Stroke[]>) => Object.fromEntries(Object.entries(redraws).map(([weight, strokes]) => [weight, strokes.map(compact)]));

export function serialize_project(project: FontProject): string {
  const glyphs: Record<string, Glyph> = {};
  for (const [char, glyph] of Object.entries(project.glyphs)) {
    const out: Glyph = { ...glyph, strokes: glyph.strokes.map(compact) };
    if (glyph.weights) out.weights = compact_redraws(glyph.weights);
    if (glyph.italic) out.italic = glyph.italic.map(compact);
    if (glyph.italics) out.italics = compact_redraws(glyph.italics);
    glyphs[char] = out;
  }
  return JSON.stringify({ ...project, version: VERSION, glyphs });
}
