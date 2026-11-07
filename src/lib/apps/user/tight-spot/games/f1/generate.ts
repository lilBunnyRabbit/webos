import { create_rng } from "$lib/core/utils/random";
import { lerp } from "$kit/games/play2d/geometry";
import { hash } from "$kit/games/play2d/seed";
import { GRID, HALF_WIDTH, KERB, RUNOFF, trace, type Piece, type TrackDef } from "./track";

/** Raised whenever a change moves the circuits a seed lays, so saved ghosts of the old ones are left behind. */
export const GENERATOR_VERSION = 1;
const ATTEMPTS = 400;
const MIN_STRAIGHT = 40;
const MIN_LINE_STRAIGHT = 160;
const MAX_LENGTH = 4800;
const CLEAR = 2 * (HALF_WIDTH + KERB) + 12;
const CLEAR_GAP = 120;
const SAMPLE = 16;

function run_of(piece: Piece): number {
  return "straight" in piece ? piece.straight : (piece.radius * Math.abs(piece.degrees) * Math.PI) / 180;
}

// Two straights' lengths absorb the miss, as on the hand-laid tracks: the pair whose headings are furthest from parallel.
function close(pieces: Piece[]): Piece[] | null {
  const { end } = trace(pieces);
  const straights: { index: number; heading: number }[] = [];
  let heading = 0;
  pieces.forEach((piece, index) => {
    if ("straight" in piece) straights.push({ index, heading });
    else heading += (piece.degrees * Math.PI) / 180;
  });
  let best: { a: number; b: number; det: number } | null = null;
  for (let i = 0; i < straights.length; i++) {
    for (let j = i + 1; j < straights.length; j++) {
      const det = Math.sin(straights[j].heading - straights[i].heading);
      if (!best || Math.abs(det) > Math.abs(best.det)) best = { a: i, b: j, det };
    }
  }
  if (!best || Math.abs(best.det) < 0.3) return null;
  const ha = straights[best.a].heading;
  const hb = straights[best.b].heading;
  // da · (cos ha, sin ha) + db · (cos hb, sin hb) = −end, by Cramer's rule.
  const da = (-end.x * Math.sin(hb) + end.y * Math.cos(hb)) / best.det;
  const db = (-end.y * Math.cos(ha) + end.x * Math.sin(ha)) / best.det;
  const out = [...pieces];
  for (const [at, by] of [
    [straights[best.a].index, da],
    [straights[best.b].index, db],
  ] as const) {
    const length = (out[at] as { straight: number }).straight + by;
    if (length < MIN_STRAIGHT) return null;
    out[at] = { straight: length };
  }
  return out;
}

// No two parts of the lap nearer than two track widths and a strip of grass, unless they're the same stretch.
function clear_of_itself(pieces: Piece[]): boolean {
  const points = trace(pieces).points.filter((_, i) => i % SAMPLE === 0);
  const step = (0.25 * SAMPLE);
  const n = points.length;
  const gap = Math.ceil(CLEAR_GAP / step);
  for (let i = 0; i < n; i++) {
    for (let j = i + gap; j < n; j++) {
      if (n - (j - i) < gap) continue;
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < CLEAR) return false;
    }
  }
  return true;
}

/**
 * A closed circuit from a seed, right-handed like the hand-laid ones: a ring of bends, some left among the rights, with
 * straights between them; two straights solved so it closes, and the start/finish on the longest. `difficulty` 0 to 1
 * tightens the bends, adds more of them and more lefts (chicanes), shortens the straights and brings the walls in.
 * Deterministic: the next attempt of the same seed is taken until one closes and stays clear of itself.
 */
export function generate_track(seed: number, difficulty: number, id: string, name: string): TrackDef {
  const d = Math.max(0, Math.min(1, difficulty));
  const rng = create_rng(hash(seed, 0xf1a9));
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const count = 5 + Math.round(d * 4) + Math.floor(rng() * 2);
    const left = (i: number) => i > 0 && rng() < 0.12 + 0.28 * d;
    const lefts = Array.from({ length: count }, (_, i) => left(i));
    if (lefts.filter((each) => !each).length < 3) continue;
    const left_degrees = lefts.map((is) => (is ? lerp(25, 60 + 40 * d, rng()) : 0));
    const raw = lefts.map((is) => (is ? 0 : lerp(0.4, 1.6, rng())));
    const total = raw.reduce((sum, each) => sum + each, 0);
    const need = 360 + left_degrees.reduce((sum, each) => sum + each, 0);
    const degrees = lefts.map((is, i) => (is ? -left_degrees[i] : (raw[i] / total) * need));
    if (degrees.some((each) => Math.abs(each) > 178 || Math.abs(each) < 15)) continue;
    const tight = lerp(120, 45, d);
    const wide = lerp(300, 140, d);
    const pieces: Piece[] = [];
    degrees.forEach((each) => {
      pieces.push({ straight: lerp(70, 420, rng()) * lerp(1, 0.65, d) });
      // A long bend is a sweeper; a hairpin is tight.
      const sweep = Math.abs(each) / 180;
      pieces.push({ radius: lerp(wide, tight, Math.min(1, rng() * 0.35 + sweep * 0.5 + d * 0.4)), degrees: each });
    });
    const closed = close(pieces);
    if (!closed) continue;
    const length = closed.reduce((sum, piece) => sum + run_of(piece), 0);
    if (length > MAX_LENGTH) continue;
    let longest = -1;
    let start = 0;
    let at = 0;
    closed.forEach((piece, i) => {
      if ("straight" in piece && (longest < 0 || piece.straight > (closed[longest] as { straight: number }).straight)) {
        longest = i;
        start = at;
      }
      at += run_of(piece);
    });
    const straight = (closed[longest] as { straight: number }).straight;
    if (straight < MIN_LINE_STRAIGHT) continue;
    if (!clear_of_itself(closed)) continue;
    return { id, name, pieces: closed, line: start + Math.max(GRID + 30, straight * 0.6), runoff: Math.round(lerp(RUNOFF, 7, d)) };
  }
  throw new Error(`No circuit closes for seed ${seed}`);
}
