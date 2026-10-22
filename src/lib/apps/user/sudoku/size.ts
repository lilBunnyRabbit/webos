/** Kept apart from the puzzle code so the manifest can name the sizes without loading it. */
export const Size = { NINE: "9x9", SIX: "6x6" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);

export const SIZE_LABELS: Record<Size, string> = {
  [Size.NINE]: "9×9",
  [Size.SIX]: "6×6",
};
