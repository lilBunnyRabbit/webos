import { flushSync } from "svelte";

/** Animates a shell state change with the View Transitions API: the DOM swap happens inside the transition's callback. */
export function view_transition(change: () => void): void {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    change();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(change));
  // A hidden tab or a newer transition skips the animation; the change itself has still run.
  transition.ready.catch(() => {});
}
