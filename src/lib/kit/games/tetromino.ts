import { shuffle, type Rng } from "$lib/core/utils/random";

export const Piece = { I: "i", O: "o", T: "t", S: "s", Z: "z", J: "j", L: "l" } as const;
export type Piece = (typeof Piece)[keyof typeof Piece];
export const PIECES: readonly Piece[] = Object.values(Piece);

export type Rotation = 0 | 1 | 2 | 3;

export interface Point {
  x: number;
  y: number;
}

export const PIECE_TOKENS: Record<Piece, string> = {
  i: "info",
  o: "warning",
  t: "primary",
  s: "success",
  z: "error",
  j: "secondary",
  l: "accent",
};

const BASE: Record<Piece, readonly string[]> = {
  i: ["....", "####", "....", "...."],
  o: ["##", "##"],
  t: [".#.", "###", "..."],
  s: [".##", "##.", "..."],
  z: ["##.", ".##", "..."],
  j: ["#..", "###", "..."],
  l: ["..#", "###", "..."],
};

function rotations(piece: Piece): Point[][] {
  const rows = BASE[piece];
  const size = rows.length;
  const states: Point[][] = [rows.flatMap((row, y) => [...row].flatMap((char, x) => (char === "#" ? [{ x, y }] : [])))];
  for (let i = 1; i < 4; i++) states.push(states[i - 1].map(({ x, y }) => ({ x: size - 1 - y, y: x })));
  return states;
}

export const SHAPES: Record<Piece, readonly (readonly Point[])[]> = {
  i: rotations(Piece.I),
  o: rotations(Piece.O),
  t: rotations(Piece.T),
  s: rotations(Piece.S),
  z: rotations(Piece.Z),
  j: rotations(Piece.J),
  l: rotations(Piece.L),
};

type Kick = readonly [number, number];

const parse_kicks = (table: Record<string, string>): Record<string, readonly Kick[]> =>
  Object.fromEntries(
    Object.entries(table).map(([turn, list]) => [
      turn,
      list.split(" ").map((pair): Kick => {
        const [x, y] = pair.split(",").map(Number);
        return [x, y];
      }),
    ])
  );

// SRS tables as published, with y pointing up; a board whose rows grow downwards flips y.
const JLSTZ_KICKS = parse_kicks({
  "0>1": "0,0 -1,0 -1,1 0,-2 -1,-2",
  "1>0": "0,0 1,0 1,-1 0,2 1,2",
  "1>2": "0,0 1,0 1,-1 0,2 1,2",
  "2>1": "0,0 -1,0 -1,1 0,-2 -1,-2",
  "2>3": "0,0 1,0 1,1 0,-2 1,-2",
  "3>2": "0,0 -1,0 -1,-1 0,2 -1,2",
  "3>0": "0,0 -1,0 -1,-1 0,2 -1,2",
  "0>3": "0,0 1,0 1,1 0,-2 1,-2",
});

const I_KICKS = parse_kicks({
  "0>1": "0,0 -2,0 1,0 -2,-1 1,2",
  "1>0": "0,0 2,0 -1,0 2,1 -1,-2",
  "1>2": "0,0 -1,0 2,0 -1,2 2,-1",
  "2>1": "0,0 1,0 -2,0 1,-2 -2,1",
  "2>3": "0,0 2,0 -1,0 2,1 -1,-2",
  "3>2": "0,0 -2,0 1,0 -2,-1 1,2",
  "3>0": "0,0 1,0 -2,0 1,-2 -2,1",
  "0>3": "0,0 -1,0 2,0 -1,2 2,-1",
});

const NO_KICKS: readonly Kick[] = [[0, 0]];

export function kicks(piece: Piece, from: Rotation, to: Rotation): readonly Kick[] {
  if (piece === Piece.O) return NO_KICKS;
  return (piece === Piece.I ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`] ?? NO_KICKS;
}

/** Appends whole shuffled bags until the queue holds `min`, so every run of seven pieces holds each piece once. */
export function fill_queue(queue: readonly Piece[], rng: Rng, min: number): Piece[] {
  const next = [...queue];
  while (next.length < min) next.push(...shuffle([...PIECES], rng));
  return next;
}
