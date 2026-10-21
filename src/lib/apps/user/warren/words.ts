const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const LETTER = "[\\p{L}\\p{N}_]";

export interface Counts {
  words: number;
  characters: number;
}

/** Characters count spaces, like a word processor's "with spaces", but not the line ends between paragraphs. */
export function count(text: string): Counts {
  return { words: text.match(WORD)?.length ?? 0, characters: [...text.replace(/\n/g, "")].length };
}

export function is_word(text: string): boolean {
  return new RegExp(`^${WORD.source}$`, "u").test(text);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function word_pattern(word: string): RegExp {
  return new RegExp(`(?<!${LETTER})${escape(word)}(?!${LETTER})`, "giu");
}

export interface Range {
  start: number;
  end: number;
}

/** Whole words only, ignoring case: "fast" finds "Fast" but not "breakfast". */
export function find_word(text: string, word: string): Range[] {
  if (!word) return [];
  return [...text.matchAll(word_pattern(word))].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

export function match_case(replacement: string, found: string): string {
  if (found.length > 1 && found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase();
  const first = found.charAt(0);
  if (first !== first.toLowerCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

export function replace_word(text: string, word: string, replacement: string): { text: string; count: number } {
  let replaced = 0;
  const next = text.replace(word_pattern(word), (found) => {
    replaced++;
    return match_case(replacement, found);
  });
  return { text: next, count: replaced };
}

/** Where `offset` lands after `replace_word`; inside a replaced word it moves to that word's end. */
export function map_offset(text: string, word: string, replacement: string, offset: number): number {
  let shift = 0;
  for (const { start, end } of find_word(text, word)) {
    if (end <= offset) shift += replacement.length - (end - start);
    else if (start < offset) return start + shift + replacement.length;
    else break;
  }
  return offset + shift;
}

export function word_at(text: string, offset: number): Range | null {
  for (const match of text.matchAll(WORD)) {
    const end = match.index + match[0].length;
    if (offset >= match.index && offset <= end) return { start: match.index, end };
    if (match.index > offset) break;
  }
  return null;
}

// Words that carry grammar rather than description; repeating them is never worth a thesaurus.
const STOPWORDS = new Set(
  (
    "about above after again against also although among another anyone anything around because been before being below between both but cannot " +
    "could did does doing done down during each either enough even ever every from further going had has have having her here hers herself him " +
    "himself his how however into its itself just least less many might mine more most much must myself neither never none nor not now off once " +
    "only other others ought our ours ourselves out over own same shall she should since some something such than that the their theirs them " +
    "themselves then there these they this those though through thus too under until upon very was were what whatever when where whether which " +
    "while who whom whose why will with within without would yet you your yours yourself yourselves can may one two three first last next well " +
    "make made get got take took come came went know knew think thought said says say see saw seen use used want like just still back into onto"
  ).split(" ")
);

export interface Repeat {
  word: string;
  count: number;
}

export function repeated_words(text: string, limit = 8): Repeat[] {
  const counts = new Map<string, number>();
  for (const [found] of text.matchAll(WORD)) {
    const word = found.toLowerCase();
    if ([...word].length < 4 || STOPWORDS.has(word) || /^\p{N}+$/u.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, n]) => ({ word, count: n }));
}
