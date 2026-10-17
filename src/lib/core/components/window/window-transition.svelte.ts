import { flushSync } from "svelte";
import type { WindowId } from "$lib/core/api";
import { view_transition } from "$lib/core/utils/view-transition";

let named = $state.raw<ReadonlySet<WindowId>>(new Set());

/** True while a `window_transition` acting on this window runs, so its frame carries its name though unfocused. */
export const transition_named = (id: WindowId): boolean => named.has(id);

/**
 * `view_transition` for a change that acts on these windows. Only the focused frame is named between transitions
 * (ADR-014 revision); these get their names before the old state is captured and keep them until it finishes, so an
 * unfocused window still morphs into or out of its taskbar button.
 */
export function window_transition(ids: Iterable<WindowId>, change: () => void): void {
  const mine: ReadonlySet<WindowId> = new Set(ids);
  flushSync(() => (named = mine));
  view_transition(change);
  const clear = () => {
    if (named === mine) named = new Set();
  };
  const transition = document.activeViewTransition;
  if (transition) void transition.finished.then(clear, clear);
  else clear();
}
