import { z } from "zod";
import { build_track, type Piece, type Track, type TrackDef } from "./track";

export const TrackId = { MEADOW: "meadow", HARBOUR: "harbour", RIDGE: "ridge" } as const;
export type TrackId = (typeof TrackId)[keyof typeof TrackId];
export const track_id_schema = z.enum([TrackId.MEADOW, TrackId.HARBOUR, TrackId.RIDGE]);

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

const built = new Map<TrackId, Track>();

export function track_of(id: TrackId): Track {
  let found = built.get(id);
  if (!found) {
    found = build_track(TRACK_DEFS.find((def) => def.id === id) ?? TRACK_DEFS[0]);
    built.set(id, found);
  }
  return found;
}

export const TRACK_IDS = TRACK_DEFS.map((def) => def.id as TrackId);

export function track_name(id: TrackId): string {
  return TRACK_DEFS.find((def) => def.id === id)?.name ?? id;
}
