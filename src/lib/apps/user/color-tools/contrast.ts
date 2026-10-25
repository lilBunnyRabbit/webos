// WCAG 2.2 success criteria 1.4.3 (AA) and 1.4.6 (AAA): large text is 18 pt, or 14 pt bold.
export const CONTRAST_LEVELS = [
  { id: "aa", label: "AA", detail: "Body text", min: 4.5 },
  { id: "aaa", label: "AAA", detail: "Body text", min: 7 },
  { id: "aa-large", label: "AA large", detail: "18 pt, or 14 pt bold", min: 3 },
  { id: "aaa-large", label: "AAA large", detail: "18 pt, or 14 pt bold", min: 4.5 },
] as const;

export type ContrastLevel = (typeof CONTRAST_LEVELS)[number];

export function passes(ratio: number, level: ContrastLevel): boolean {
  return ratio >= level.min;
}

// WCAG compares the unrounded ratio: 4.499 fails AA, so it must not read "4.50".
export function format_ratio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}
