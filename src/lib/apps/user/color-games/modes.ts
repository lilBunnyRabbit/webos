// Kept apart from the game logic: the manifest imports these at boot, and a module the app also imports lands whole in the boot chunk.
export const APP_ID = "color-games";
export const APP_NAME = "Color Games";

export const Mode = { RECALL: "recall", ODD: "odd-one-out", SORT: "gradient-sort", HEX: "hex-guess" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const MODES: readonly Mode[] = Object.values(Mode);

export const MODE_NAMES: Record<Mode, string> = {
  [Mode.RECALL]: "Recall",
  [Mode.ODD]: "Odd one out",
  [Mode.SORT]: "Gradient sort",
  [Mode.HEX]: "Hex guess",
};

/** Recall's memorise time and Gradient sort's board. The daily always plays Easy. */
export const Level = { EASY: "easy", HARD: "hard" } as const;
export type Level = (typeof Level)[keyof typeof Level];

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
