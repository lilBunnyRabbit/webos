import type { GameDefinition } from "./define";
import parking from "./parking";

export const GAMES: readonly GameDefinition[] = [parking];

export const YARD = "yard";
// The names the shut buildings carry, in yard order after the registered games, so a player sees what's coming.
export const UPCOMING: readonly string[] = ["Warehouse"];
// The `game` prop's values: decided ahead of the games, so a link to one that hasn't shipped lands in the yard.
export const GAME_CHOICES = [YARD, "parking", "forklift"] as const;
export type GameChoice = (typeof GAME_CHOICES)[number];

export function game_of(id: string): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
