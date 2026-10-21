import { LENGTHS, load_words } from "../letterer/words";
import { build_trie, type Dictionary } from "./puzzle";

let dictionary: Promise<Dictionary> | null = null;

export function load_dictionary(): Promise<Dictionary> {
  if (!dictionary) {
    dictionary = Promise.all(LENGTHS.map(load_words)).then((lists) => ({
      answers: Object.fromEntries(LENGTHS.map((length, i) => [length, lists[i].answers])),
      trie: build_trie(lists.flatMap((list) => [...list.allowed])),
    }));
    dictionary.catch(() => (dictionary = null));
  }
  return dictionary;
}
