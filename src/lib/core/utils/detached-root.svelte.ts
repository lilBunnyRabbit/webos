/**
 * `$effect.root` that belongs to no component. Svelte links a root created during component init into that
 * component's effect tree: while the component plays its outro the branch is skipped by flushes, the root is left
 * dirty, and its effects never run again, for every other user of a shared cell too. Created from a microtask, no
 * effect is active, so the root stands alone.
 */
export function detached_root(fn: () => void): () => void {
  let dispose: (() => void) | null = null;
  let disposed = false;
  queueMicrotask(() => {
    if (!disposed) dispose = $effect.root(fn);
  });
  return () => {
    disposed = true;
    dispose?.();
  };
}
