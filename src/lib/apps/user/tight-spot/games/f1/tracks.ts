import { z } from "zod";
import { build_track, type Piece, type Track, type TrackDef } from "./track";

export const TrackId = { MEADOW: "meadow", HARBOUR: "harbour", RIDGE: "ridge" } as const;
export type TrackId = (typeof TrackId)[keyof typeof TrackId];
export const track_id_schema = z.enum([TrackId.MEADOW, TrackId.HARBOUR, TrackId.RIDGE]);

const S = (straight: number): Piece => ({ straight });
const B = (radius: number, degrees: number): Piece => ({ radius, degrees });

// Laid by hand to close on themselves. No bend is tighter than 16 m on the centreline (the car's lock is 8 m), and no
// two parts of a track come closer than their run-off.
export const TRACK_DEFS: readonly TrackDef[] = [
  {
    id: TrackId.MEADOW,
    name: "Meadow",
    line: 30,
    pieces: [S(130), B(18, 90), S(32.3), B(18, 90), S(15), B(16, -45), B(16, 45), S(92.4), B(18, 90), S(41.7), B(18, 90)],
  },
  {
    id: TrackId.HARBOUR,
    name: "Harbour",
    line: 30,
    pieces: [
      S(140),
      B(16, 180),
      S(50),
      B(25, -90),
      S(20),
      B(25, 90),
      S(30),
      B(20, 60),
      B(20, -60),
      S(20),
      B(18, 90),
      S(34),
      B(30, 90),
      S(32.6),
    ],
  },
  {
    id: TrackId.RIDGE,
    name: "Ridge",
    line: 30,
    pieces: [
      S(90),
      B(50, 45),
      B(50, -45),
      S(20),
      B(20, 135),
      S(30),
      B(30, -45),
      S(20),
      B(22, 90),
      S(40),
      B(40, 30),
      B(40, -30),
      S(20),
      B(25, 90),
      S(15),
      B(20, -90),
      S(10),
      B(25, 90),
      S(22),
      B(30, 90),
      S(7.1),
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
