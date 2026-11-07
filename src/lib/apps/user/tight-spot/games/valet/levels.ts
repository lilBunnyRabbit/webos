import { ChunkKind } from "../../core/lot";
import { hash } from "$kit/games/play2d/seed";
import type { Goals, Rules, Shift } from "./game";
import { build_street } from "./street";

export interface ShiftLevel extends Goals {
  name: string;
  rules: Rules;
  garage: boolean;
}

const calm = (arrivals: number, start_gap: number, min_gap: number): Rules => ({ arrivals, start_gap, min_gap, ramp: arrivals, bus: null });

export const LEVELS: readonly ShiftLevel[] = [
  { name: "First shift", rules: calm(4, 75_000, 65_000), garage: false, target: 40, high: 50 },
  { name: "Lunch", rules: calm(5, 70_000, 55_000), garage: false, target: 60, high: 75 },
  { name: "Afternoon", rules: calm(6, 65_000, 45_000), garage: false, target: 65, high: 85 },
  { name: "The bus", rules: { ...calm(6, 65_000, 45_000), bus: { at: [3] } }, garage: false, target: 70, high: 90 },
  { name: "Down below", rules: calm(7, 65_000, 45_000), garage: true, target: 70, high: 90 },
  { name: "Tour group", rules: { ...calm(8, 60_000, 40_000), bus: { at: [2, 6] } }, garage: true, target: 110, high: 145 },
  { name: "Rush hour", rules: { ...calm(8, 70_000, 50_000), rush: { from: 3, count: 3, gap: 22_000 } }, garage: false, target: 75, high: 95 },
  { name: "Theatre night", rules: { ...calm(9, 60_000, 45_000), bus: { at: [5] }, rush: { from: 2, count: 3, gap: 22_000 } }, garage: true, target: 90, high: 120 },
  { name: "Wedding", rules: { ...calm(10, 55_000, 35_000), bus: { at: [4] } }, garage: true, target: 105, high: 140 },
  { name: "Conference", rules: { ...calm(11, 55_000, 35_000), rush: { from: 4, count: 4, gap: 22_000 } }, garage: true, target: 110, high: 140 },
  { name: "Match day", rules: { ...calm(12, 55_000, 34_000), bus: { at: [8] }, rush: { from: 3, count: 3, gap: 22_000 } }, garage: true, target: 120, high: 160 },
  { name: "Gala", rules: { ...calm(14, 60_000, 36_000), bus: { at: [5] }, rush: { from: 8, count: 3, gap: 24_000 } }, garage: true, target: 145, high: 195 },
];

export const LEVEL_COUNT = LEVELS.length;

export function has_floors(seed: number): boolean {
  return build_street(seed).world.chunks.some((chunk) => chunk.kind === ChunkKind.FLOOR);
}

const seeds = new Map<number, number>();

export function level_seed(level: number): number {
  let found = seeds.get(level);
  if (found === undefined) {
    const want = LEVELS[level - 1].garage;
    let k = 0;
    while (has_floors(hash(0x7a1e7, level, k)) !== want) k++;
    found = hash(0x7a1e7, level, k);
    seeds.set(level, found);
  }
  return found;
}

export function level_shift(level: number): Shift {
  return { seed: level_seed(level), level, rules: LEVELS[level - 1].rules };
}
