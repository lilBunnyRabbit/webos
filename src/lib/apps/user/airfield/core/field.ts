import { hash } from "$kit/games/play2d/seed";
import { ground_speed, ROLL_ASPHALT, ROLL_GRASS, type Plane } from "./plane";

export interface Span {
  x0: number;
  x1: number;
}

export interface Tree {
  x: number;
  height: number;
  r: number;
}

export interface Field {
  runway: Span;
  apron: Span;
  hangar: Span & { height: number };
  /** Where a flight starts and a crash puts you back: on the apron, facing the runway. */
  start: number;
  windsock: number;
  trees: Tree[];
}

export function build_field(): Field {
  const trees: Tree[] = [];
  const grove = (from: number, to: number, seed: number) => {
    for (let x = from, i = 0; x < to; i++) {
      const h = hash(seed, i);
      trees.push({ x, height: 7 + (h % 9), r: 2.5 + ((h >> 4) % 3) });
      x += 9 + ((h >> 8) % 14);
    }
  };
  grove(-520, -230, 1);
  grove(980, 1300, 2);
  return {
    runway: { x0: 0, x1: 650 },
    apron: { x0: -175, x1: 0 },
    hangar: { x0: -160, x1: -118, height: 9 },
    start: -95,
    windsock: 340,
    trees,
  };
}

export function surface_roll(field: Field, x: number): number {
  return x >= field.apron.x0 && x <= field.runway.x1 ? ROLL_ASPHALT : ROLL_GRASS;
}

export function in_hangar(field: Field, plane: Plane): boolean {
  return plane.main_on && Math.abs(ground_speed(plane)) < 3 && plane.x > field.hangar.x0 + 2 && plane.x < field.hangar.x1 - 1;
}
