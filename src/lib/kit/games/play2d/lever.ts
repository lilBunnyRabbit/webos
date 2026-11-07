export function clamp_notch(notch: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.round(notch)));
}

export function nearest_notch(detents: readonly number[], value: number, fallback: number): number {
  let best = fallback;
  detents.forEach((detent, i) => {
    if (Math.abs(detent - value) < Math.abs(detents[best] - value)) best = i;
  });
  return best;
}
