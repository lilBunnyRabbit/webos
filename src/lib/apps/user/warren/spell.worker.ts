import nspell from "nspell";

export type SpellRequest =
  | { id: number; op: "load"; aff: string; dic: string; words: string[] }
  | { id: number; op: "check"; words: string[] }
  | { id: number; op: "suggest"; word: string }
  | { id: number; op: "add"; words: string[] };

export type SpellResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface Loaded {
  ms: number;
}

let speller: ReturnType<typeof nspell> | null = null;

async function text_of(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Couldn't download the dictionary (${response.status})`);
  return response.text();
}

function run(request: SpellRequest): unknown | Promise<unknown> {
  if (request.op === "load") {
    return (async (): Promise<Loaded> => {
      const start = performance.now();
      const [aff, dic] = await Promise.all([text_of(request.aff), text_of(request.dic)]);
      speller = nspell(aff, dic);
      for (const word of request.words) speller.add(word);
      return { ms: Math.round(performance.now() - start) };
    })();
  }
  if (!speller) throw new Error("The dictionary isn't loaded");
  if (request.op === "check") return request.words.filter((word) => !speller!.correct(word));
  if (request.op === "suggest") return speller.suggest(request.word).slice(0, 6);
  for (const word of request.words) speller.add(word);
  return null;
}

self.onmessage = async ({ data }: MessageEvent<SpellRequest>) => {
  try {
    self.postMessage({ id: data.id, ok: true, result: await run(data) } satisfies SpellResponse);
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies SpellResponse);
  }
};
