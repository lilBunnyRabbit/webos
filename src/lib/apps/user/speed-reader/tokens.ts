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
  orp: number;
  /** Letters and digits only, so quotes and punctuation don't make a word count as long. */
  letters: number;
  boundary: Boundary;
  paragraph: boolean;
}

export const MAX_HYPHENATED_LENGTH = 12;

const WORD_CHAR = /[\p{L}\p{N}]/u;
const TRAILING_CLOSERS = /[")'\]}»”’]+$/u;
const DASH_ONLY = /^(?:[—–]|-{2,})+$/u;

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

function word_span(chars: string[]): { start: number; end: number } {
  let start = 0;
  while (start < chars.length && !WORD_CHAR.test(chars[start])) start++;
  let end = chars.length;
  while (end > start && !WORD_CHAR.test(chars[end - 1])) end--;
  return { start, end };
}

export function orp_index(word: string): number {
  const chars = Array.from(word);
  if (chars.length === 0) return 0;
  const { start, end } = word_span(chars);
  if (start >= end) return Math.floor((chars.length - 1) / 2);

  const length = end - start;
  const offset = length <= 1 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : length <= 13 ? 3 : 4;
  return start + offset;
}

function letter_count(word: string): number {
  let count = 0;
  for (const char of word) if (WORD_CHAR.test(char)) count++;
  return count;
}

// Code points, not UTF-16 units, so an emoji or astral letter is never cut in half.
export function split_at_orp(token: Pick<ReaderToken, "text" | "orp">): [head: string, pivot: string, tail: string] {
  const chars = Array.from(token.text);
  return [chars.slice(0, token.orp).join(""), chars[token.orp] ?? "", chars.slice(token.orp + 1).join("")];
}

export function split_word(word: string): string[] {
  const parts = word.split(/(?<=[^—–-](?:[—–]|--))(?=[^\s—–-])/u).filter(Boolean);
  return parts.flatMap((part) =>
    Array.from(part).length > MAX_HYPHENATED_LENGTH && /[^-]-[^-]/u.test(part)
      ? part.split(/(?<=[^-]-)(?=[^-])/u)
      : [part]
  );
}

export function tokenize(text: string): ReaderToken[] {
  const tokens: ReaderToken[] = [];

  for (const match of text.matchAll(/(\S+)(\s*)/gu)) {
    const [, word, space] = match;
    const paragraph = /\n[^\S\n]*\n/u.test(space);
    const previous = tokens.at(-1);

    // A spaced dash ("word — word") would flash on its own; it belongs to the word before it.
    if (DASH_ONLY.test(word) && previous) {
      previous.text = `${previous.text} ${word}`;
      previous.boundary = Boundary.DASH;
      previous.paragraph ||= paragraph;
      continue;
    }

    const parts = split_word(word);
    parts.forEach((part, index) => {
      tokens.push({
        text: part,
        orp: orp_index(part),
        letters: letter_count(part),
        boundary: classify_boundary(part),
        paragraph: paragraph && index === parts.length - 1,
      });
    });
  }

  return tokens;
}
