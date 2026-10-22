import type { Loaded, SpellRequest, SpellResponse } from "./spell.worker";
import SpellWorker from "./spell.worker?worker";
// The package's exports name only its Node entry, so the files are reached by path. Emitted as assets and never
// precached: the service worker caches them on first use.
import aff_url from "./node_modules/dictionary-en/index.aff?url";
import dic_url from "./node_modules/dictionary-en/index.dic?url";

type Request = SpellRequest extends infer R ? (R extends SpellRequest ? Omit<R, "id"> : never) : never;

// One worker and one dictionary for every Warren window, gone when the last one stops checking.
let worker: Worker | null = null;
let loaded: Promise<Loaded> | null = null;
let users = 0;
let next_id = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

function send<T>(request: Request): Promise<T> {
  if (!worker) return Promise.reject(new Error("Spelling is off"));
  const id = ++next_id;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    worker!.postMessage({ ...request, id } as SpellRequest);
  });
}

function fail_all(reason: Error) {
  for (const job of pending.values()) job.reject(reason);
  pending.clear();
}

export function start_speller(words: string[]): Promise<Loaded> {
  users++;
  if (loaded) return loaded;
  worker = new SpellWorker();
  worker.onmessage = ({ data }: MessageEvent<SpellResponse>) => {
    const job = pending.get(data.id);
    pending.delete(data.id);
    if (!job) return;
    if (data.ok) job.resolve(data.result);
    else job.reject(new Error(data.error));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    fail_all(new Error(event.message || "The spelling checker stopped"));
  };
  const absolute = (url: string) => new URL(url, location.href).href;
  loaded = send<Loaded>({ op: "load", aff: absolute(aff_url), dic: absolute(dic_url), words: [...words] });
  loaded.catch(() => stop_speller(true));
  return loaded;
}

export function stop_speller(force = false) {
  users = force ? 0 : Math.max(0, users - 1);
  if (users || !worker) return;
  worker.terminate();
  worker = null;
  loaded = null;
  fail_all(new Error("Spelling is off"));
}

export async function check_words(words: string[]): Promise<string[]> {
  await loaded;
  return send<string[]>({ op: "check", words });
}

export async function suggest_word(word: string): Promise<string[]> {
  await loaded;
  return send<string[]>({ op: "suggest", word });
}

export async function add_words(words: string[]): Promise<void> {
  await loaded;
  await send({ op: "add", words });
}
