import { track_progress } from "../../core/track";
import type { ProgressSource } from "../define";
import { LEVEL_COUNT, level_stars, type Graded } from "./stars";

export const LEVELS = LEVEL_COUNT;

function best_of(save: unknown): Record<string, Graded> {
  const best = typeof save === "object" && save !== null ? (save as Record<string, unknown>).best : undefined;
  if (typeof best !== "object" || best === null) return {};
  const out: Record<string, Graded> = {};
  for (const [key, value] of Object.entries(best)) {
    if (typeof value !== "object" || value === null) continue;
    const { passed, minors } = value as Record<string, unknown>;
    if (typeof passed === "boolean" && typeof minors === "number") out[key] = { passed, minors };
  }
  return out;
}

export default {
  file: "test.json",
  read: (save) => track_progress(level_stars(best_of(save)), LEVELS),
} satisfies ProgressSource;
