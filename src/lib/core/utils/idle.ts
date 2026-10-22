/** Runs `callback` when the browser is idle, or on the next task where `requestIdleCallback` doesn't exist (Safari). Returns a cancel. */
export function on_idle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const handle = requestIdleCallback(callback);
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(callback, 1);
  return () => clearTimeout(handle);
}
