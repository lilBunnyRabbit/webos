// Hyphens split: "well-knwn" is checked as "well" and "knwn", as Hunspell lists the parts.
const TOKEN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

export function check_form(word: string): string {
  return word.replace(/’/g, "'");
}

// Numbers, single letters and all-caps words (acronyms: CV, PDF, NATO) are never listed.
export function is_checkable(word: string): boolean {
  if ([...word].length < 2 || /\p{N}/u.test(word)) return false;
  return !(word === word.toUpperCase() && word !== word.toLowerCase());
}

export function spell_words(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [word] of text.matchAll(TOKEN)) {
    if (is_checkable(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

export interface Misspelt {
  word: string;
  count: number;
}

export function misspelt(counts: Map<string, number>, wrong: (form: string) => boolean, ignored: ReadonlySet<string>): Misspelt[] {
  const found = new Map<string, Misspelt>();
  for (const [word, count] of counts) {
    const key = check_form(word).toLowerCase();
    if (ignored.has(key) || !wrong(check_form(word))) continue;
    const seen = found.get(key);
    if (seen) seen.count += count;
    else found.set(key, { word, count });
  }
  return [...found.values()];
}
