export const NumpadKey = { BACK: "back", POINT: "." } as const;
export type NumpadKey = (typeof NumpadKey)[keyof typeof NumpadKey];

export const MAX_INPUT = 9;

export function type_key(text: string, key: string): string {
  if (key === NumpadKey.BACK) return text.slice(0, -1);
  if (text.length >= MAX_INPUT) return text;
  if (key === NumpadKey.POINT) {
    if (text.includes(".")) return text;
    return text ? `${text}.` : "0.";
  }
  if (!/^\d$/.test(key)) return text;
  if (text === "0") return key;
  return text + key;
}

/** Lengths are kept to 0.01 mm, so typed values and sums compare equal. */
export function round_mm(mm: number): number {
  return Math.round(mm * 100) / 100;
}
