import nspell from "nspell";
import { serve } from "$kit/utils/worker/serve";

export interface Loaded {
  ms: number;
}

export interface SpellApi {
  load(input: { aff: string; dic: string; words: string[] }): Loaded;
  check(words: string[]): string[];
  suggest(word: string): string[];
  add(words: string[]): null;
}

let speller: ReturnType<typeof nspell> | null = null;

async function text_of(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the dictionary (${response.status})`);
  return response.text();
}

function loaded_speller() {
  if (!speller) throw new Error("The dictionary isn't loaded");
  return speller;
}

serve<SpellApi>({
  load: async ({ aff, dic, words }) => {
    const start = performance.now();
    const [aff_text, dic_text] = await Promise.all([text_of(aff), text_of(dic)]);
    speller = nspell(aff_text, dic_text);
    for (const word of words) speller.add(word);
    return { ms: Math.round(performance.now() - start) };
  },
  check: (words) => words.filter((word) => !loaded_speller().correct(word)),
  suggest: (word) => loaded_speller().suggest(word).slice(0, 6),
  add: (words) => {
    const current = loaded_speller();
    for (const word of words) current.add(word);
    return null;
  },
});
