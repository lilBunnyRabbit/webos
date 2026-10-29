import type { Polygon, Pose, Vec } from "../../core/geometry";
import { to_world, Vehicle } from "../../core/vehicle";

export interface Deck {
  front: number;
  rear: number;
  half: number;
}

// The zero-turn's three blades sit 0.78 m ahead of its drive axle, 0.48 m apart, 0.24 m each: a 1.44 m cut.
export const DECKS: Partial<Record<Vehicle, Deck>> = {
  [Vehicle.MOWER]: { front: 1.02, rear: 0.54, half: 0.72 },
};

export function deck_of(vehicle: Vehicle): Deck {
  const deck = DECKS[vehicle];
  if (!deck) throw new Error(`No cutting deck for ${vehicle}`);
  return deck;
}

export function deck_corners(pose: Pose, deck: Deck): Vec[] {
  return [
    { x: deck.front, y: -deck.half },
    { x: deck.front, y: deck.half },
    { x: deck.rear, y: deck.half },
    { x: deck.rear, y: -deck.half },
  ].map((point) => to_world(pose, point));
}

export function deck_centre(pose: Pose, deck: Deck): Vec {
  return to_world(pose, { x: (deck.front + deck.rear) / 2, y: 0 });
}

/** The ground the deck passes over from one pose to the next: the hull of both footprints, exact for a straight step. */
export function swept(from: Pose, to: Pose, deck: Deck): Polygon {
  return hull([...deck_corners(from, deck), ...deck_corners(to, deck)]);
}

export function hull(points: readonly Vec[]): Vec[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (from: Vec[]) => {
    const out: Vec[] = [];
    for (const p of from) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 1e-12) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}
