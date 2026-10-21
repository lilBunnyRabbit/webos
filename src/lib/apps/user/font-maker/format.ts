import { z } from "zod";
import { CHAR_SETS } from "./charsets";
import { ASCENT, DESCENT, EM, MAX_NUDGE, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH, type FontProject, type Glyph, type Stroke } from "./model";

export const VERSION = 1;
export const EXTENSION = ".fontmaker";

const Coordinate = z.number().finite().min(-2 * EM).max(2 * EM);
const Point = z.tuple([Coordinate, Coordinate, z.number().min(0).max(1)]);
const Nudge = z.number().int().min(-MAX_NUDGE).max(MAX_NUDGE);

const GlyphSchema = z.object({
  strokes: z.array(z.array(Point).min(1)),
  lsb: Nudge.optional(),
  rsb: Nudge.optional(),
  guide: z
    .string()
    .regex(/^data:image\/(webp|png|jpeg);base64,/)
    .optional(),
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
  const { name, sets, metrics, stroke, glyphs } = result.data;
  const project: FontProject = { version: VERSION, name, sets: [...new Set(sets)], metrics: { ...metrics, em: EM }, glyphs: glyphs as Record<string, Glyph> };
  if (stroke) project.stroke = { width: stroke.width };
  return project;
}

const round = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function compact(stroke: Stroke): Stroke {
  return stroke.map(([x, y, pressure]) => [round(x, 1), round(y, 1), round(pressure, 2)]);
}

export function serialize_project(project: FontProject): string {
  const glyphs: Record<string, Glyph> = {};
  for (const [char, glyph] of Object.entries(project.glyphs)) {
    glyphs[char] = { ...glyph, strokes: glyph.strokes.map(compact) };
  }
  return JSON.stringify({ ...project, version: VERSION, glyphs });
}
