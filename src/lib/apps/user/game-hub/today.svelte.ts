import { day_key } from "$lib/core/utils/date";

/** Call during component init: it uses `$effect`. */
export function use_today(active: () => boolean = () => true): { readonly value: string } {
  let today = $state(day_key());
  $effect(() => {
    if (!active()) return;
    today = day_key();
    const timer = setInterval(() => (today = day_key()), 60_000);
    return () => clearInterval(timer);
  });
  return {
    get value() {
      return today;
    },
  };
}
