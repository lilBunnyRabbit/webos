import { error_message } from "$lib/core/utils";
import { Gw2Error, Gw2ErrorKind } from "./api";

export class Resource<T> {
  data = $state.raw<T | null>(null);
  error = $state.raw<Gw2Error | null>(null);
  loading = $state(false);
  at = $state<number | null>(null);

  private readonly fetcher: (max_age?: number) => Promise<{ data: T; at: number }>;
  private run = 0;

  constructor(fetcher: (max_age?: number) => Promise<{ data: T; at: number }>) {
    this.fetcher = fetcher;
  }

  async load(force = false): Promise<void> {
    const run = ++this.run;
    this.loading = true;
    this.error = null;
    try {
      const result = await this.fetcher(force ? 0 : undefined);
      if (run !== this.run) return;
      this.data = result.data;
      this.at = result.at;
    } catch (error) {
      if (run !== this.run) return;
      this.error = error instanceof Gw2Error ? error : new Gw2Error(Gw2ErrorKind.FAILED, error_message(error));
    } finally {
      if (run === this.run) this.loading = false;
    }
  }
}
