export const PHRASE_WORDS = 5;

export async function load_wordlist(): Promise<string[]> {
  const { default: text } = await import("./eff-large-wordlist.txt?raw");
  return text.split("\n").map((word) => word.trim()).filter(Boolean);
}

/** Uniform in `[0, n)`: rejection sampling, so the modulo doesn't favour the first words. */
export function secure_index(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % n;
  }
}

export function generate_phrase(words: readonly string[], count = PHRASE_WORDS, pick = secure_index): string {
  return Array.from({ length: count }, () => words[pick(words.length)]).join(" ");
}

export const Strength = { WEAK: "weak", FAIR: "fair", STRONG: "strong" } as const;
export type Strength = (typeof Strength)[keyof typeof Strength];

export const MIN_BITS = 40;
const STRONG_BITS = 60;

/**
 * A rough guess of how many bits an attacker must try. A word from the list counts as one pick from it; anything else
 * counts half its character-pool bits, because people choose predictable strings.
 */
export function phrase_bits(phrase: string, wordlist: ReadonlySet<string>): number {
  const tokens = phrase.normalize("NFKC").trim().split(/\s+/).filter(Boolean);
  const per_word = Math.log2(Math.max(wordlist.size, 2));
  let bits = 0;
  const seen = new Set<string>();
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (wordlist.has(lower)) {
      bits += per_word;
      continue;
    }
    let pool = 0;
    if (/[a-z]/.test(token)) pool += 26;
    if (/[A-Z]/.test(token)) pool += 26;
    if (/\d/.test(token)) pool += 10;
    if (/[^a-zA-Z\d]/.test(token)) pool += 33;
    const distinct = new Set(token).size;
    bits += (Math.min(token.length, distinct * 2) * Math.log2(Math.max(pool, 2))) / 2;
  }
  return Math.round(bits);
}

export function strength_of(bits: number): Strength {
  return bits >= STRONG_BITS ? Strength.STRONG : bits >= MIN_BITS ? Strength.FAIR : Strength.WEAK;
}
