import { flushSync } from "svelte";
import type { AiService } from "$lib/core/api/services/ai/type";
import type { AppListing } from "$lib/core/api/services/apps/type";
import { SentenceSearch } from "./sentence-search.svelte";

/** Test-only: a `SentenceSearch` owned by an effect root, as a component would own it. */
export function sentence_fixture(apps: AppListing[], ai: AiService | null) {
  const input = $state({ query: "", shown: [] as AppListing[] });
  let search!: SentenceSearch<AppListing>;
  const stop = $effect.root(() => {
    search = new SentenceSearch({ apps: () => apps, query: () => input.query, shown: () => input.shown, ai: () => ai });
  });
  flushSync();
  return {
    search,
    stop,
    type(query: string, shown: AppListing[] = []) {
      input.query = query;
      input.shown = shown;
      flushSync();
    },
  };
}
