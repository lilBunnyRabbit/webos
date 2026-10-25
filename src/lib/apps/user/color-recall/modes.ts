// Kept apart from the game logic: the four colour games' manifests import these at boot, and a module the app also imports lands whole in the boot chunk.
import { z } from "zod";

/** The app the four games were modes of until ADR-071. Their dailies still seed on `color-games/{mode}`. */
export const LEGACY_ID = "color-games";

export const Mode = { RECALL: "recall", ODD: "odd-one-out", SORT: "gradient-sort", HEX: "hex-guess" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** Recall's memorise time and Gradient sort's board. The daily always plays Easy. */
export const Level = { EASY: "easy", HARD: "hard" } as const;
export type Level = (typeof Level)[keyof typeof Level];

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GAME_DEFAULTS = { constraints: { width: { min: 340 }, height: { min: 520 } } };

export const game_props = z.object({
  /** A day plays that day's puzzle, a number a practice one: what a challenge link carries. */
  seed: z.union([z.string().regex(DAY_PATTERN), z.number().int().nonnegative()]).optional(),
  /** Game Hub's daily contract (ADR-035): the day to play. */
  daily: z.string().regex(DAY_PATTERN).optional(),
});
export const leveled_game_props = game_props.extend({ level: z.enum(Level).optional() });
