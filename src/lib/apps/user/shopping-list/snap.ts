interface Entry {
  folded: string;
  spelling: string;
}

export interface Vocabulary {
  /** Whole history entries with more than one word, matched against a whole line. */
  phrases: Entry[];
  /** History words, then the built-in ones: a later tier is only asked when an earlier one has nothing close. */
  tiers: Entry[][];
}

export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().replaceAll("đ", "d");
}

/** Damerau-Levenshtein (optimal string alignment): a swap of two neighbours counts as one edit. */
export function edit_distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

/** Short words only snap when they match outright: one edit turns "sol" into "sok". */
export function allowed_distance(length: number): number {
  if (length >= 6) return 2;
  if (length >= 4) return 1;
  return 0;
}

const WORD = /^\p{L}{2,}$/u;

export function vocabulary(history: Iterable<string>, words: Iterable<string>): Vocabulary {
  const seen = new Set<string>();
  const tier = (source: Iterable<string>) => {
    const entries: Entry[] = [];
    for (const word of source) {
      const folded = fold(word);
      if (!WORD.test(folded) || seen.has(folded)) continue;
      seen.add(folded);
      entries.push({ folded, spelling: word.toLocaleLowerCase() });
    }
    return entries;
  };
  const entries = [...history].map((entry) => entry.trim()).filter(Boolean);
  const phrases = entries.filter((entry) => /\s/.test(entry)).map((entry) => ({ folded: fold(entry), spelling: entry.toLocaleLowerCase() }));
  return { phrases, tiers: [tier(entries.flatMap((entry) => entry.split(/\s+/))), tier(words)] };
}

/** Forms of one word, like "jogurt", "jogurti" and "jogurta": a tie between them is no doubt. */
function same_stem(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short.slice(0, -1));
}

/** `undefined`: nothing close. `null`: two different words equally close (like "voda" and "soda" for "zoda"), so neither is trusted. */
function closest(folded: string, entries: readonly Entry[], length: number): Entry | null | undefined {
  let best: Entry | null | undefined;
  let best_distance = allowed_distance(length) + 1;
  for (const entry of entries) {
    if (Math.abs(entry.folded.length - folded.length) > best_distance) continue;
    const distance = edit_distance(folded, entry.folded);
    if (distance === 0) return entry;
    if (distance < best_distance) {
      best = entry;
      best_distance = distance;
    } else if (distance === best_distance && best && !same_stem(best.folded, entry.folded)) {
      best = null;
    }
  }
  return best;
}

const TOKEN = /^[^\p{L}\p{N}]*([\p{L}\p{N}](?:.*[\p{L}\p{N}])?)[^\p{L}\p{N}]*$/u;

/** Digits a reader gives for handwritten letters: "2ELENJAVA", "PALČKE 2A", "S0JINA". */
const LOOKALIKES: Record<string, string[]> = { "0": ["o"], "1": ["i", "l"], "2": ["z"], "5": ["s"], "8": ["b"] };

function spellings(core: string): string[] {
  let variants = [""];
  for (const char of core) {
    const options = LOOKALIKES[char] ?? [char];
    variants = variants.flatMap((variant) => options.map((option) => variant + option));
    if (variants.length > 8) return [];
  }
  return variants.filter((variant) => !/\d/.test(variant));
}

/** The known spelling of `word` in lower case, or `null` when nothing is close enough to trust. */
export function match_word(word: string, vocabulary: Vocabulary): string | null {
  const core = TOKEN.exec(word)?.[1];
  if (!core || !/\p{L}/u.test(core)) return null;
  for (const spelling of spellings(fold(core))) {
    for (const entries of vocabulary.tiers) {
      const found = closest(spelling, entries, spelling.length);
      if (found !== undefined) {
        if (found) return found.spelling;
        break;
      }
    }
  }
  return null;
}

export function snap_line(line: string, vocabulary: Vocabulary): string {
  const folded = fold(line.trim());
  const phrase = closest(folded, vocabulary.phrases, folded.match(/\p{L}/gu)?.length ?? 0);
  if (phrase) return phrase.spelling;
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => match_word(word, vocabulary) ?? word)
    .join(" ");
}
