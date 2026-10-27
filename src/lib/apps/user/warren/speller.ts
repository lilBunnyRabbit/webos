import { spawn, type Input, type Output, type WorkerHandle } from "$kit/utils/worker";
import type { Loaded, SpellApi } from "./spell.worker";
import SpellWorker from "./spell.worker?worker";
// The package's exports name only its Node entry, so the files are reached by path. Emitted as assets and never
// precached: the service worker caches them on first use.
import aff_url from "./node_modules/dictionary-en/index.aff?url";
import dic_url from "./node_modules/dictionary-en/index.dic?url";

const OFF = "Spelling is off";

// One worker and one dictionary for every Warren window, gone when the last one stops checking.
let worker: WorkerHandle<SpellApi> | null = null;
let loaded: Promise<Loaded> | null = null;
let users = 0;

function call<K extends keyof SpellApi>(method: K, input: Input<SpellApi[K]>): Promise<Output<SpellApi[K]>> {
  if (!worker) return Promise.reject(new Error(OFF));
  return worker.call(method, input);
}

export function start_speller(words: string[]): Promise<Loaded> {
  users++;
  if (loaded) return loaded;
  worker = spawn<SpellApi>(SpellWorker, { stopped: "The spelling checker stopped" });
  const absolute = (url: string) => new URL(url, location.href).href;
  loaded = call("load", { aff: absolute(aff_url), dic: absolute(dic_url), words: [...words] });
  loaded.catch(() => stop_speller(true));
  return loaded;
}

export function stop_speller(force = false) {
  users = force ? 0 : Math.max(0, users - 1);
  if (users || !worker) return;
  worker.terminate(new Error(OFF));
  worker = null;
  loaded = null;
}

export async function check_words(words: string[]): Promise<string[]> {
  await loaded;
  return call("check", words);
}

export async function suggest_word(word: string): Promise<string[]> {
  await loaded;
  return call("suggest", word);
}

export async function add_words(words: string[]): Promise<void> {
  await loaded;
  await call("add", words);
}
