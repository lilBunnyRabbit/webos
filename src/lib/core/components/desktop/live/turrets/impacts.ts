import type { Point } from "../geometry";

type Listener = (at: Point) => void;

const listeners = new Set<Listener>();

// Bolts fly behind windows and widgets, so the background layer hands its shield hits (page coordinates) to the overlay to spark on top.
export const shield_impacts = {
  emit(at: Point): void {
    for (const listener of listeners) listener(at);
  },
  listen(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
