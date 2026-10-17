export const LENGTHS = [5, 6, 7] as const;
export type Length = (typeof LENGTHS)[number];

export interface Words {
  answers: readonly string[];
  allowed: ReadonlySet<string>;
}

type TextModule = () => Promise<{ default: string }>;

// One chunk per length, so a game only downloads the list it plays.
const ANSWERS: Record<Length, TextModule> = {
  5: () => import("./words/answers-5.txt?raw"),
  6: () => import("./words/answers-6.txt?raw"),
  7: () => import("./words/answers-7.txt?raw"),
};
const ALLOWED: Record<Length, TextModule> = {
  5: () => import("./words/allowed-5.txt?raw"),
  6: () => import("./words/allowed-6.txt?raw"),
  7: () => import("./words/allowed-7.txt?raw"),
};

/**
 * The guess lists are front-coded to halve their size: each word is the count of letters it shares with the word
 * before it, then the letters that differ (`0aback3ft` → `aback`, `abaft`).
 */
export function decode_front(text: string): string[] {
  const words: string[] = [];
  let previous = "";
  for (const [, shared, rest] of text.trim().matchAll(/(\d)([a-z]+)/g)) {
    previous = previous.slice(0, Number(shared)) + rest;
    words.push(previous);
  }
  return words;
}

export function parse_answers(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const cache = new Map<Length, Promise<Words>>();

export function load_words(length: Length): Promise<Words> {
  let words = cache.get(length);
  if (!words) {
    words = Promise.all([ANSWERS[length](), ALLOWED[length]()]).then(([answers, allowed]) => {
      const list = parse_answers(answers.default);
      return { answers: list, allowed: new Set([...list, ...decode_front(allowed.default)]) };
    });
    words.catch(() => cache.delete(length));
    cache.set(length, words);
  }
  return words;
}
