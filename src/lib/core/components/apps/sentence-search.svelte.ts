import { AiAvailability, type AiService } from "$lib/core/api/services/ai/type";
import type { AppListing } from "$lib/core/api/services/apps/type";

type Ranker = typeof import("$lib/core/api/services/apps/sentence");

let ranker: Promise<Ranker> | null = null;
const load_ranker = () => (ranker ??= import("$lib/core/api/services/apps/sentence"));

const AI_DELAY = 400;
const AI_LIMIT = 4;
const AI_MIN_WORDS = 3;

export interface SentenceSearchInput<T extends AppListing> {
  apps: () => readonly T[];
  query: () => string;
  shown: () => readonly T[];
  ai?: () => AiService | null;
}

interface Suggestion {
  query: string;
  keywords: string[];
}

// Construct during component init: the ranker load and the AI request are $effects owned by the component.
export class SentenceSearch<T extends AppListing> {
  private module = $state.raw<Ranker | null>(null);
  private suggestion = $state.raw<Suggestion | null>(null);

  private readonly index = $derived.by(() => (this.module ? this.module.build_sentence_index(this.input.apps()) : null));
  private readonly query = $derived.by(() => this.input.query().trim());
  private readonly shown_ids = $derived.by(() => new Set(this.input.shown().map((app) => app.id)));

  readonly related: T[] = $derived.by(() => {
    if (!this.index || !this.query) return [];
    return this.module!.rank_sentence(this.index, this.query).filter((app) => !this.shown_ids.has(app.id));
  });

  readonly suggested: T[] = $derived.by(() => {
    if (!this.index || !this.query || this.suggestion?.query !== this.query) return [];
    const listed = new Set([...this.shown_ids, ...this.related.map((app) => app.id)]);
    return this.module!.rank_sentence(this.index, this.suggestion.keywords.join(" "))
      .filter((app) => !listed.has(app.id))
      .slice(0, AI_LIMIT);
  });

  readonly pending = $derived(this.query !== "" && this.module === null);

  constructor(private readonly input: SentenceSearchInput<T>) {
    $effect(() => {
      if (this.query && !this.module) void load_ranker().then((module) => (this.module = module));
    });

    $effect(() => {
      const query = this.query;
      const ai = this.input.ai?.() ?? null;
      if (!ai || ai.features.prompt !== AiAvailability.READY || query.split(/\s+/).length < AI_MIN_WORDS) return;
      const controller = new AbortController();
      const timer = setTimeout(async () => {
        const module = await load_ranker();
        try {
          const keywords = await module.suggest_keywords(ai, query, controller.signal);
          if (!controller.signal.aborted) this.suggestion = { query, keywords };
        } catch {
          // A suggestion is extra: a busy or failing model leaves the row out, with no toast per keystroke.
        }
      }, AI_DELAY);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    });
  }
}
