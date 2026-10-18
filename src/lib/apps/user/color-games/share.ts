import { format_time } from "$kit/games/time";
import { Hint, HEX_GUESSES } from "./hex";
import { APP_NAME, Level, MODE_NAMES, type Mode } from "./modes";
import { ROUNDS, ROUND_MAX } from "./recall";
import { puzzle_number, type Seed } from "./seed";

export function band(score: number): string {
  if (score >= 9) return "🟩";
  if (score >= 7) return "🟨";
  if (score >= 4) return "🟧";
  return "🟥";
}

const HINT_EMOJI: Record<Hint, string> = { [Hint.EXACT]: "🟩", [Hint.UP]: "⬆️", [Hint.DOWN]: "⬇️" };

export function hint_row(hints: readonly Hint[]): string {
  return hints.map((hint) => HINT_EMOJI[hint]).join("");
}

/** "42.7", not "42.70". */
export function format_score(score: number): string {
  return String(Math.round(score * 100) / 100);
}

/** "Color Games · Recall #12" for a day's puzzle, "Color Games · Recall · Practice" otherwise. */
export function share_head(mode: Mode, seed: Seed, level: Level): string {
  const base = `${APP_NAME} · ${MODE_NAMES[mode]}`;
  if (typeof seed === "string") return `${base} #${puzzle_number(seed)}`;
  return `${base} · Practice${level === Level.HARD ? " (Hard)" : ""}`;
}

/** The launch props of a challenge link: the same puzzle for whoever opens it. */
export function challenge_props(mode: Mode, seed: Seed, level: Level): Record<string, string | number> {
  return typeof seed === "string" || level === Level.EASY ? { mode, seed } : { mode, seed, level };
}

function lines(...parts: (string | null)[]): string {
  return parts.filter((part): part is string => !!part).join("\n");
}

export function recall_share(head: string, scores: readonly number[], link: string): string {
  const total = scores.reduce((sum, score) => sum + score, 0);
  return lines(`${head}  ${format_score(total)}/${ROUNDS * ROUND_MAX}`, scores.map(band).join(""), link);
}

export function odd_share(head: string, hits: number, misses: number, link: string): string {
  return lines(`${head}  ${hits} found`, misses ? `${misses} missed` : "No misses", link);
}

export function sort_share(head: string, ms: number, moves: number, link: string): string {
  return lines(`${head}  ${format_time(ms)} · ${moves} ${moves === 1 ? "move" : "moves"}`, link);
}

export function hex_share(head: string, rows: readonly (readonly Hint[])[], won: boolean, link: string): string {
  return lines(`${head}  ${won ? rows.length : "X"}/${HEX_GUESSES}`, ...rows.map(hint_row), link);
}
