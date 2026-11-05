import { z } from "zod";
import { Carver } from "./maze";
import { Solver } from "./solve";

export const Mode = { BUILD: "build", SOLVE: "solve", PLAY: "play" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const MODE_LABELS: Record<Mode, string> = { build: "Build", solve: "Solve", play: "Play" };

export const Size = { SMALL: "10", MEDIUM: "16", LARGE: "24", HUGE: "32", GIANT: "48" } as const;
export type Size = (typeof Size)[keyof typeof Size];

export const SIZES: readonly Size[] = Object.values(Size);

export const Speed = { SLOW: "slow", NORMAL: "normal", FAST: "fast" } as const;
export type Speed = (typeof Speed)[keyof typeof Speed];

export const SPEED_LABELS: Record<Speed, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };

/** Steps per second per cell, so a run takes about as long whatever the maze size. */
export const SPEED_RATES: Record<Speed, number> = { slow: 0.25, normal: 1, fast: 4 };

export const CARVER_LABELS: Record<Carver, string> = {
  backtracker: "Backtracker",
  prim: "Prim",
  kruskal: "Kruskal",
  wilson: "Wilson",
};

export const SOLVER_LABELS: Record<Solver, string> = { bfs: "BFS", "a-star": "A*" };

export interface Prefs {
  carver: Carver;
  size: Size;
  speed: Speed;
  solver: Solver;
}

export const DEFAULT_PREFS: Prefs = {
  carver: Carver.BACKTRACKER,
  size: Size.MEDIUM,
  speed: Speed.NORMAL,
  solver: Solver.A_STAR,
};

export const prefs_schema = z.object({
  carver: z.enum(Carver),
  size: z.enum(Size),
  speed: z.enum(Speed),
  solver: z.enum(Solver),
});

export const best_ms_schema = z.record(z.string(), z.number().positive());

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  best_ms: best_ms_schema.catch(() => ({})),
  escapes: z.number().int().nonnegative().catch(0),
  prefs: prefs_schema.catch(() => ({ ...DEFAULT_PREFS })),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { best_ms: {}, escapes: 0, prefs: { ...DEFAULT_PREFS } };
}

export function size_label(size: Size): string {
  return `${size} × ${size}`;
}
