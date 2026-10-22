import { error_message } from "$lib/core/utils";
import { check_form, misspelt, spell_words, type Misspelt } from "./spelling";

export const SpellStatus = { OFF: "off", LOADING: "loading", READY: "ready", FAILED: "failed" } as const;
export type SpellStatus = (typeof SpellStatus)[keyof typeof SpellStatus];

type Speller = typeof import("./speller");

/** One window's list of misspelt words. Words already asked about are remembered, so an edit checks only new ones. */
export class SpellList {
  status = $state<SpellStatus>(SpellStatus.OFF);
  error = $state("");
  words = $state.raw<Misspelt[]>([]);
  load_ms = $state<number | null>(null);
  last = $state.raw<{ words: number; ms: number } | null>(null);

  private speller: Speller | null = null;
  private known = new Map<string, boolean>();
  private counts = new Map<string, number>();
  private ignored: ReadonlySet<string> = new Set();
  private request = 0;

  async start(personal: string[]) {
    if (this.status !== SpellStatus.OFF && this.status !== SpellStatus.FAILED) return;
    this.status = SpellStatus.LOADING;
    this.error = "";
    try {
      const speller = await import("./speller");
      if (this.status !== SpellStatus.LOADING) return;
      this.speller = speller;
      const loaded = await this.speller.start_speller(personal);
      if (this.status !== SpellStatus.LOADING) return;
      this.load_ms = loaded.ms;
      this.status = SpellStatus.READY;
    } catch (reason) {
      if (this.status !== SpellStatus.LOADING) return;
      this.status = SpellStatus.FAILED;
      this.error = error_message(reason);
    }
  }

  stop() {
    if (this.status === SpellStatus.OFF) return;
    this.speller?.stop_speller();
    this.status = SpellStatus.OFF;
    this.request++;
    this.known.clear();
    this.words = [];
  }

  async update(text: string, ignored: ReadonlySet<string>) {
    if (this.status !== SpellStatus.READY || !this.speller) return;
    const request = ++this.request;
    this.counts = spell_words(text);
    this.ignored = ignored;
    const unknown = [...new Set([...this.counts.keys()].map(check_form))].filter((form) => !this.known.has(form));
    if (unknown.length) {
      const start = performance.now();
      try {
        const wrong = new Set(await this.speller.check_words(unknown));
        for (const form of unknown) this.known.set(form, !wrong.has(form));
        this.last = { words: unknown.length, ms: Math.round(performance.now() - start) };
      } catch (reason) {
        if (request !== this.request) return;
        this.status = SpellStatus.FAILED;
        this.error = error_message(reason);
        return;
      }
      if (request !== this.request) return;
    }
    this.list();
  }

  private list() {
    this.words = misspelt(this.counts, (form) => this.known.get(form) === false, this.ignored);
  }

  set_ignored(ignored: ReadonlySet<string>) {
    this.ignored = ignored;
    this.list();
  }

  suggest(word: string): Promise<string[]> {
    return this.speller ? this.speller.suggest_word(check_form(word)) : Promise.resolve([]);
  }

  async add(word: string) {
    if (!this.speller) return;
    await this.speller.add_words([check_form(word)]);
    this.known.set(check_form(word), true);
    this.list();
  }
}
