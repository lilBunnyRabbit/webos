import type { GameDefinition } from "./define";
import parking from "./parking";

export const GAMES: readonly GameDefinition[] = [parking];

export function game_of(id: string): GameDefinition | undefined {
  return GAMES.find((game) => game.id === id);
}
