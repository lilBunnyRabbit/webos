export const COIN_ID = 1;

export interface Coins {
  gold: number;
  silver: number;
  copper: number;
}

export function split_coins(total: number): Coins {
  const value = Math.max(0, Math.floor(total));
  return { gold: Math.floor(value / 10_000), silver: Math.floor(value / 100) % 100, copper: value % 100 };
}

export function format_coins(total: number): string {
  const { gold, silver, copper } = split_coins(total);
  if (gold > 0) return `${gold.toLocaleString("en")}g ${String(silver).padStart(2, "0")}s ${String(copper).padStart(2, "0")}c`;
  if (silver > 0) return `${silver}s ${String(copper).padStart(2, "0")}c`;
  return `${copper}c`;
}

const SMALL_WORDS = new Set(["and", "of", "the"]);

/** The API gives world bosses only as ids like `inquest_golem_mark_ii`. */
export function boss_name(id: string): string {
  return id
    .split("_")
    .map((word, index) => {
      if (/^[ivx]+$/.test(word)) return word.toUpperCase();
      if (index > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function format_progress(current: number, complete: number): string {
  return `${Math.min(current, complete).toLocaleString("en")} / ${complete.toLocaleString("en")}`;
}

export function fraction(current: number, complete: number): number {
  return complete <= 0 ? 1 : Math.min(1, Math.max(0, current / complete));
}

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function format_stack(count: number): string {
  return count < 1000 ? String(count) : COMPACT.format(count).toLowerCase();
}
