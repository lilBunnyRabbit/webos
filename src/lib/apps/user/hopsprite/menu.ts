import type { Position } from "$lib/core/utils/type";

export function below(event: MouseEvent): Position {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return { x: event.clientX, y: event.clientY };
  const box = target.getBoundingClientRect();
  return { x: box.left, y: box.bottom + 4 };
}
