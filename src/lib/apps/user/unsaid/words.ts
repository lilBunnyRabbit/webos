const SUFFIXES = ["ies", "ing", "es", "ed", "er", "ly", "s"] as const;
const ARTICLES = new Set(["a", "an", "the"]);
const MIN_STEM = 3;
/** A card word or stem this long also bans every word that starts with it ("horse" bans "horseshoe"). */
const PREFIX_STEM = 4;

export interface Token {
  word: string;
  start: number;
  end: number;
}

export interface Violation extends Token {
  banned: string;
}

export function fold(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function tokens(text: string): Token[] {
  return Array.from(text.matchAll(/[\p{L}\p{M}]+/gu), (match) => ({
    word: fold(match[0]).replace(/[^\p{L}]/gu, ""),
    start: match.index,
    end: match.index + match[0].length,
  })).filter((token) => token.word.length > 0);
}

/** A cheap English stem: one suffix off, then a final "e" and a doubled last letter, so bake, baked, baker and baking meet. */
export function stem(word: string): string {
  let root = fold(word);
  for (const suffix of SUFFIXES) {
    if (!root.endsWith(suffix)) continue;
    const next = root.slice(0, -suffix.length) + (suffix === "ies" ? "y" : "");
    if (next.length >= MIN_STEM) {
      root = next;
      break;
    }
  }
  if (root.endsWith("e") && root.length > MIN_STEM) root = root.slice(0, -1);
  if (root.length > MIN_STEM && root.at(-1) === root.at(-2)) root = root.slice(0, -1);
  return root;
}

function matches(word: string, card_word: string): boolean {
  const folded = fold(card_word);
  const root = stem(folded);
  if (word === folded || stem(word) === root) return true;
  return [folded, root].some((prefix) => prefix.length >= PREFIX_STEM && word.startsWith(prefix));
}

export function violations(clue: string, target: string, banned: readonly string[]): Violation[] {
  const card_words = [target, ...banned];
  const found: Violation[] = [];
  for (const token of tokens(clue)) {
    const hit = card_words.find((card_word) => matches(token.word, card_word));
    if (hit) found.push({ ...token, banned: hit });
  }
  return found;
}

/** Whether a guess names the target: articles ignored, a guess of several words hits when any of them is the target. */
export function is_hit(guess: string, target: string): boolean {
  const folded = fold(target);
  const root = stem(folded);
  return tokens(guess).some(
    (token) => !ARTICLES.has(token.word) && (token.word === folded || stem(token.word) === root)
  );
}

export function guess_key(guess: string): string {
  return tokens(guess)
    .map((token) => token.word)
    .filter((word) => !ARTICLES.has(word))
    .join(" ");
}
