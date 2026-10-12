export const Boundary = {
  SENTENCE: "sentence",
  ELLIPSIS: "ellipsis",
  DASH: "dash",
  COMMA: "comma",
  NONE: "none",
} as const;
export type Boundary = (typeof Boundary)[keyof typeof Boundary];

export interface ReaderToken {
  text: string;
  boundary: Boundary;
}

const TRAILING_CLOSERS = /[")'\]}»”’]+$/u;

const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "fig",
  "no",
  "vol",
  "pp",
  "al",
  "inc",
  "ltd",
  "co",
  "corp",
  "dept",
  "est",
  "gen",
  "gov",
  "sen",
  "rep",
  "capt",
  "col",
  "lt",
  "sgt",
  "rev",
  "hon",
  "messrs",
  "mt",
  "ave",
  "blvd",
  "approx",
  "ph.d",
  "a.m",
  "p.m",
]);
const INITIALISM = /^[A-Za-z](\.[A-Za-z])*$/;

function is_abbreviation(base: string): boolean {
  if (!base) return false;
  return ABBREVIATIONS.has(base.toLowerCase()) || INITIALISM.test(base);
}

export function classify_boundary(word: string): Boundary {
  const stripped = word.replace(TRAILING_CLOSERS, "");
  if (!stripped) return Boundary.NONE;
  // Before the sentence check, or "wait..." would read as a period.
  if (/(\.{2,}|…)$/u.test(stripped)) return Boundary.ELLIPSIS;
  if (/(—|–|--)$/u.test(stripped)) return Boundary.DASH;

  const enders = stripped.match(/[.!?]+$/u);
  if (enders) {
    const run = enders[0];
    if (run.includes("!") || run.includes("?")) return Boundary.SENTENCE;
    return is_abbreviation(stripped.slice(0, -run.length)) ? Boundary.NONE : Boundary.SENTENCE;
  }

  return /[,;:]$/u.test(stripped) ? Boundary.COMMA : Boundary.NONE;
}

export function tokenize(text: string): ReaderToken[] {
  return (text.match(/\S+/gu) ?? []).map((word) => ({ text: word, boundary: classify_boundary(word) }));
}

export function count_sentences(tokens: readonly ReaderToken[]): number {
  return tokens.reduce((count, token) => count + (token.boundary === Boundary.SENTENCE ? 1 : 0), 0);
}
