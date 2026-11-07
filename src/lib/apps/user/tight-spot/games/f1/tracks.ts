import { z } from "zod";
import { generate_track, GENERATOR_VERSION } from "./generate";
import { build_track, type Piece, type Track, type TrackDef } from "./track";

/** In ladder order: the three laid by hand, then the seeded ones, their corners tougher as they go. */
export const TrackId = {
  MEADOW: "meadow",
  HARBOUR: "harbour",
  RIDGE: "ridge",
  QUARRY: "quarry",
  ORCHARD: "orchard",
  ESTUARY: "estuary",
  MOORLAND: "moorland",
  PINEWOOD: "pinewood",
  VIADUCT: "viaduct",
  SALTMARSH: "saltmarsh",
  FOUNDRY: "foundry",
  SUMMIT: "summit",
} as const;
export type TrackId = (typeof TrackId)[keyof typeof TrackId];
export const TRACK_IDS = Object.values(TrackId);
export const track_id_schema = z.enum(TRACK_IDS as [TrackId, ...TrackId[]]);
/** The daily's pool, pinned so a past day keeps its track. */
export const CLASSIC_IDS: readonly TrackId[] = [TrackId.MEADOW, TrackId.HARBOUR, TrackId.RIDGE];
export const RANDOM = "random";

const S = (straight: number): Piece => ({ straight });
const B = (radius: number, degrees: number): Piece => ({ radius, degrees });

// Laid by hand to close on themselves: two straights per track were solved for it. No bend is tighter than 45 m on the
// centreline, and no two parts of a track come closer than their run-off.
export const TRACK_DEFS: readonly TrackDef[] = [
  {
    id: TrackId.MEADOW,
    name: "Meadow",
    line: 180,
    pieces: [S(1150.6), B(170, 100), S(250), B(400, -20), B(400, 20), S(120), B(160, 80), S(350), B(220, 40), S(940.6), B(180, 140)],
  },
  {
    id: TrackId.HARBOUR,
    name: "Harbour",
    line: 180,
    runoff: 5,
    pieces: [
      S(1137.3),
      B(45, 180),
      S(250),
      B(60, -90),
      S(180),
      B(60, 90),
      S(150),
      B(60, -90),
      S(150),
      B(60, 90),
      S(120),
      B(45, -45),
      B(45, 90),
      B(45, -45),
      S(250),
      B(60, 90),
      S(540),
      B(60, 90),
    ],
  },
  {
    id: TrackId.RIDGE,
    name: "Ridge",
    line: 150,
    pieces: [
      S(342.1),
      B(130, 40),
      B(130, -80),
      B(130, 40),
      S(200),
      B(110, 80),
      S(120),
      B(110, 100),
      S(150),
      B(90, -60),
      B(90, 120),
      B(90, -60),
      S(250),
      B(200, -50),
      S(150),
      B(90, 120),
      S(83.2),
      B(130, 50),
      S(300),
      B(100, 60),
    ],
  },
];

interface Seeded {
  id: TrackId;
  name: string;
  seed: number;
  difficulty: number;
}

// The seeds were picked so the autopilot laps each one clean at three-star pace (the tests hold it).
export const SEEDED: readonly Seeded[] = [
  { id: TrackId.QUARRY, name: "Quarry", seed: 4, difficulty: 0.1 },
  { id: TrackId.ORCHARD, name: "Orchard", seed: 5, difficulty: 0.2 },
  { id: TrackId.ESTUARY, name: "Estuary", seed: 6, difficulty: 0.3 },
  { id: TrackId.MOORLAND, name: "Moorland", seed: 7, difficulty: 0.4 },
  { id: TrackId.PINEWOOD, name: "Pinewood", seed: 8, difficulty: 0.5 },
  { id: TrackId.VIADUCT, name: "Viaduct", seed: 9, difficulty: 0.62 },
  { id: TrackId.SALTMARSH, name: "Saltmarsh", seed: 10, difficulty: 0.74 },
  { id: TrackId.FOUNDRY, name: "Foundry", seed: 11, difficulty: 0.87 },
  { id: TrackId.SUMMIT, name: "Summit", seed: 12, difficulty: 1 },
];

export function def_of(id: TrackId): TrackDef {
  const hand = TRACK_DEFS.find((def) => def.id === id);
  if (hand) return hand;
  const seeded = SEEDED.find((each) => each.id === id) ?? SEEDED[0];
  return generate_track(seeded.seed, seeded.difficulty, seeded.id, seeded.name);
}

const built = new Map<TrackId, Track>();

export function track_of(id: TrackId): Track {
  let found = built.get(id);
  if (!found) {
    found = build_track(def_of(id));
    built.set(id, found);
  }
  return found;
}

export const RANDOM_DIFFICULTY = 0.5;
let random_built: { seed: number; track: Track } | null = null;

// Kept for the last seed only, so Again reuses the same track (and its racing line).
export function random_track(seed: number): Track {
  if (random_built?.seed !== seed) random_built = { seed, track: build_track(generate_track(seed, RANDOM_DIFFICULTY, RANDOM, "Random")) };
  return random_built.track;
}

export function track_name(id: TrackId): string {
  return TRACK_DEFS.find((def) => def.id === id)?.name ?? SEEDED.find((each) => each.id === id)?.name ?? id;
}

export function track_level(id: TrackId): number {
  return TRACK_IDS.indexOf(id) + 1;
}

/** In the app's `f1/` folder; a seeded track's names the generator version, so a regenerated circuit never races an old ghost. */
export function ghost_file_name(id: TrackId): string {
  return CLASSIC_IDS.includes(id) ? `ghost-v2-${id}.json` : `ghost-v2-${id}-g${GENERATOR_VERSION}.json`;
}
