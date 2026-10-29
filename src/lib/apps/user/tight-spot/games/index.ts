import type { GameDefinition } from "./define";
import ferry from "./ferry";
import f1 from "./f1";
import forklift from "./forklift";
import mower from "./mower";
import parking from "./parking";
import pushback from "./pushback";
import rodeo from "./rodeo";
import test from "./test";
import valet from "./valet";

export const GAMES: readonly GameDefinition[] = [parking, forklift, f1, ferry, mower, pushback, rodeo, valet, test];

export const YARD = "yard";
// The names the shut buildings carry, in yard order after the registered games, so a player sees what's coming.
export const UPCOMING: readonly string[] = [];
// The `game` prop's values: decided ahead of the games, so a link to one that hasn't shipped lands in the yard.
export const GAME_CHOICES = [YARD, "parking", "forklift", "f1", "ferry", "mower", "pushback", "rodeo", "valet", "test"] as const;
export type GameChoice = (typeof GAME_CHOICES)[number];
// The games with a daily, in Game Hub's row order: each is one mode of the app's per-mode daily (ADR-050).
export const DAILY_GAMES = ["parking", "forklift", "f1", "ferry", "mower", "pushback", "rodeo", "valet"] as const satisfies readonly GameChoice[];
export type DailyGame = (typeof DAILY_GAMES)[number];

export function is_daily_game(id: string | undefined): id is DailyGame {
  return (DAILY_GAMES as readonly (string | undefined)[]).includes(id);
}

export function game_of(id: string): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
