import { flushSync } from "svelte";
import { motion_reduced } from "./motion";

/** Animates a shell state change with the View Transitions API: the DOM swap happens inside the transition's callback. */
export function view_transition(change: () => void): void {
  if (!document.startViewTransition || motion_reduced()) {
    change();
    return;
  }
  const transition = document.startViewTransition(() => flushSync(change));
  // A hidden tab or a newer transition skips the animation; the change itself has still run.
  transition.ready.catch(() => {});
}
