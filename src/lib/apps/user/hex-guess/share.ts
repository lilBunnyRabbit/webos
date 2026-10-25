import { lines } from "../color-recall/share";
import { Hint, HEX_GUESSES } from "./hex";

const HINT_EMOJI: Record<Hint, string> = { [Hint.EXACT]: "🟩", [Hint.UP]: "⬆️", [Hint.DOWN]: "⬇️" };

export function hint_row(hints: readonly Hint[]): string {
  return hints.map((hint) => HINT_EMOJI[hint]).join("");
}

export function hex_share(head: string, rows: readonly (readonly Hint[])[], won: boolean, link: string): string {
  return lines(`${head}  ${won ? rows.length : "X"}/${HEX_GUESSES}`, ...rows.map(hint_row), link);
}
