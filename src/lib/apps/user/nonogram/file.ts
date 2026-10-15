import { z } from "zod";
import { BW_PALETTE, INKS, Ink, MAX_COLORS, Verdict } from "./puzzle";

export const NONOGRAM_EXTENSION = ".nonogram";
export const MIN_SIDE = 2;
export const MAX_SIDE = 30;

/**
 * A `.nonogram` file is the picture, not the clues: clues are derived, so a file can't disagree with itself.
 * `cells` is one string per row, `.` for empty and `1`–`4` for a colour in `colors` (1-based). Without `colors` the
 * puzzle is black and white.
 */
export const NonogramFileSchema = z
  .object({
    version: z.literal(1),
    title: z.string().max(120).optional(),
    width: z.number().int().min(MIN_SIDE).max(MAX_SIDE),
    height: z.number().int().min(MIN_SIDE).max(MAX_SIDE),
    colors: z
      .array(z.enum(INKS as [Ink, ...Ink[]]))
      .min(1)
      .max(MAX_COLORS)
      .optional(),
    cells: z.array(z.string()),
  })
  .superRefine((file, context) => {
    const colors = file.colors ?? BW_PALETTE;
    if (new Set(colors).size !== colors.length)
      context.addIssue({ code: "custom", path: ["colors"], message: "Colours repeat" });
    if (file.cells.length !== file.height) {
      context.addIssue({
        code: "custom",
        path: ["cells"],
        message: `Expected ${file.height} rows, got ${file.cells.length}`,
      });
      return;
    }
    const allowed = new RegExp(`^[.1-${colors.length}]{${file.width}}$`);
    file.cells.forEach((row, index) => {
      if (!allowed.test(row)) {
        context.addIssue({
          code: "custom",
          path: ["cells", index],
          message: `Row ${index + 1} must be ${file.width} of “.” or 1–${colors.length}`,
        });
      }
    });
  });
export type NonogramFile = z.infer<typeof NonogramFileSchema>;

export interface Drawing {
  title?: string;
  width: number;
  height: number;
  palette: readonly Ink[];
  cells: readonly number[];
}

export type ParseResult = { ok: true; drawing: Drawing } | { ok: false; error: string };

export function parse_nonogram(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file isn't valid JSON." };
  }
  const result = NonogramFileSchema.safeParse(json);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Not a nonogram file." };
  const file = result.data;
  return {
    ok: true,
    drawing: {
      ...(file.title ? { title: file.title } : {}),
      width: file.width,
      height: file.height,
      palette: file.colors ?? BW_PALETTE,
      cells: file.cells.flatMap((row) => [...row].map((char) => (char === "." ? 0 : Number(char)))),
    },
  };
}

/** Unused colours are dropped and the rest renumbered in palette order, so a file only lists what it paints. */
export function compact(drawing: Drawing): Drawing {
  const used = drawing.palette.flatMap((ink, index) =>
    drawing.cells.includes(index + 1) ? [{ ink, from: index + 1 }] : []
  );
  if (!used.length) return { ...drawing, palette: [drawing.palette[0] ?? Ink.FOREGROUND] };
  const renumber = new Map(used.map(({ from }, index) => [from, index + 1]));
  return {
    ...drawing,
    palette: used.map(({ ink }) => ink),
    cells: drawing.cells.map((cell) => renumber.get(cell) ?? 0),
  };
}

export function serialize_nonogram(drawing: Drawing): string {
  const { title, width, height, palette, cells } = compact(drawing);
  const black_and_white = palette.length === 1 && palette[0] === Ink.FOREGROUND;
  const file: NonogramFile = {
    version: 1,
    ...(title ? { title } : {}),
    width,
    height,
    ...(black_and_white ? {} : { colors: [...palette] }),
    cells: Array.from({ length: height }, (_, row) =>
      cells
        .slice(row * width, row * width + width)
        .map((cell) => (cell > 0 ? String(cell) : "."))
        .join("")
    ),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  [Verdict.LOGIC]: "unique: solvable by logic alone",
  [Verdict.UNIQUE]: "needs a guess: one answer, but reaching it needs a guess",
  [Verdict.MULTIPLE]: "multiple: more than one picture fits the clues",
  [Verdict.NONE]: "none: no picture fits the clues",
  [Verdict.UNKNOWN]: "unknown: too complex to check",
};
