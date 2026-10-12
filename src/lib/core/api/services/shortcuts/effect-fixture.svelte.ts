import { flushSync } from "svelte";

/** Test-only: runs `body` inside an effect, like a component would, and reports how often it ran. */
export function run_in_effect(body: () => void | (() => void)): { runs: () => number; stop: () => void } {
  let runs = 0;
  const stop = $effect.root(() => {
    $effect(() => {
      runs++;
      return body();
    });
  });
  flushSync();
  return { runs: () => runs, stop };
}
