import type { AppId } from "../apps/type";

/** `id` at `index` (the end by default), moved there when it's already pinned. `index` counts without `id`. */
export function with_pin(pinned: readonly AppId[], id: AppId, index = Infinity): AppId[] {
  const rest = pinned.filter((candidate) => candidate !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

export function without_pin(pinned: readonly AppId[], id: AppId): AppId[] {
  return pinned.filter((candidate) => candidate !== id);
}
