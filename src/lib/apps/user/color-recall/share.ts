import { Level } from "./modes";
import { ROUNDS, ROUND_MAX } from "./recall";
import { puzzle_number, type Seed } from "./seed";

export function band(score: number): string {
  if (score >= 9) return "🟩";
  if (score >= 7) return "🟨";
  if (score >= 4) return "🟧";
  return "🟥";
}

/** "42.7", not "42.70". */
export function format_score(score: number): string {
  return String(Math.round(score * 100) / 100);
}

/** "Color Recall #12" for a day's puzzle, "Color Recall · Practice" otherwise. */
export function share_head(name: string, seed: Seed, level: Level): string {
  if (typeof seed === "string") return `${name} #${puzzle_number(seed)}`;
  return `${name} · Practice${level === Level.HARD ? " (Hard)" : ""}`;
}

/** The launch props of a challenge link: the same puzzle for whoever opens it. */
export function challenge_props(seed: Seed, level: Level): Record<string, string | number> {
  return typeof seed === "string" || level === Level.EASY ? { seed } : { seed, level };
}

export function lines(...parts: (string | null)[]): string {
  return parts.filter((part): part is string => !!part).join("\n");
}

export function recall_share(head: string, scores: readonly number[], link: string): string {
  const total = scores.reduce((sum, score) => sum + score, 0);
  return lines(`${head}  ${format_score(total)}/${ROUNDS * ROUND_MAX}`, scores.map(band).join(""), link);
}
