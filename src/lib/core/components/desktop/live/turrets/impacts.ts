import type { WallHit } from "./sim";

type Listener = (impact: WallHit) => void;

const listeners = new Set<Listener>();

// Bolts fly behind windows and widgets, so the background layer hands its shield hits (page coordinates, with the shield's id and edge) to the overlay to spark and chip on top.
export const shield_impacts = {
  emit(impact: WallHit): void {
    for (const listener of listeners) listener(impact);
  },
  listen(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
