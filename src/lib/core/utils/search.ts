/** What one searchable thing offers a query, strongest field first. */
export interface SearchText {
  name: string;
  keywords: string[];
  other: string[];
}

// Below this length a one-letter slip matches too much ("cat" ~ "car", "map").
const TYPO_MIN_LENGTH = 5;
const TYPO_RANK = 5;

/** At most one insertion, deletion, substitution or swap of neighbours between `a` and `b`. */
export function within_one_edit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

const words_of = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Lower is better, `null` is no match. One query word against one thing. */
function rank_word(text: SearchText, needle: string): number | null {
  const name = text.name.toLowerCase();
  if (name.startsWith(needle)) return 0;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(needle))) return 1;
  if (name.includes(needle)) return 2;
  const includes = (value: string) => value.toLowerCase().includes(needle);
  if (text.keywords.some(includes)) return 3;
  if (text.other.some(includes)) return 4;
  if (needle.length >= TYPO_MIN_LENGTH) {
    const words = [name, ...text.keywords, ...text.other].flatMap(words_of);
    if (words.some((word) => within_one_edit(word, needle) || (word.length > needle.length && within_one_edit(word.slice(0, needle.length + 1), needle)))) return TYPO_RANK;
  }
  return null;
}

interface Rank {
  worst: number;
  total: number;
}

/** Every query word must match; a thing ranks by its weakest word, then by the sum. */
function rank(text: SearchText, needles: string[]): Rank | null {
  let worst = 0;
  let total = 0;
  for (const needle of needles) {
    const value = rank_word(text, needle);
    if (value === null) return null;
    worst = Math.max(worst, value);
    total += value;
  }
  return { worst, total };
}

/**
 * The items matching `query`, best first; `[]` for an empty query. The query splits into words and every word must
 * match (case-insensitive substring): name prefix, a word in the name, anywhere in the name, the keywords, then the
 * other text. Words of five letters or more also match a word one typo away, ranked last. A query with a space that
 * starts a name ranks that item first. Ties keep `compare`'s order.
 */
export function search_ranked<T>(items: Iterable<T>, query: string, text_of: (item: T) => SearchText, compare: (a: T, b: T) => number): T[] {
  const needles = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return [];
  const whole = query.trim().toLowerCase();
  return [...items]
    .map((item) => {
      const text = text_of(item);
      return { item, rank: whole.includes(" ") && text.name.toLowerCase().startsWith(whole) ? { worst: -1, total: -1 } : rank(text, needles) };
    })
    .filter((entry): entry is { item: T; rank: Rank } => entry.rank !== null)
    .sort((a, b) => a.rank.worst - b.rank.worst || a.rank.total - b.rank.total || compare(a.item, b.item))
    .map((entry) => entry.item);
}
