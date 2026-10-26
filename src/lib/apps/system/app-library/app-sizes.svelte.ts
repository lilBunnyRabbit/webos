import type { AppId } from "$lib/core/api";
import { SvelteMap } from "svelte/reactivity";
import { cached_size } from "./app-size";

interface Entry {
  id: AppId;
  files: readonly string[];
}

export class AppSizes {
  private readonly sizes = new SvelteMap<AppId, number | null>();
  private run = 0;

  get(id: AppId): number | null {
    return this.sizes.get(id) ?? null;
  }

  get total(): number {
    let sum = 0;
    for (const size of this.sizes.values()) sum += size ?? 0;
    return sum;
  }

  /** One app at a time, so a big library doesn't flood Cache Storage; a newer call drops an older one. */
  async measure(entries: readonly Entry[]): Promise<void> {
    const run = ++this.run;
    for (const id of [...this.sizes.keys()]) if (!entries.some((entry) => entry.id === id)) this.sizes.delete(id);
    for (const entry of entries) {
      const size = await cached_size(import.meta.env.BASE_URL, entry.files).catch(() => null);
      if (run !== this.run) return;
      this.sizes.set(entry.id, size);
    }
  }
}
