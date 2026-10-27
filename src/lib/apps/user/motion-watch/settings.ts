import { z } from "zod";

export const APP_ID = "motion-watch";

export const GRID = { COLUMNS: 16, ROWS: 12 } as const;
export const CELLS = GRID.COLUMNS * GRID.ROWS;
/** Detection runs on a 160×120 grey picture: each zone cell is 10×10 of it. */
export const DETECT = { WIDTH: 160, HEIGHT: 120 } as const;
export const CELL_SIZE = DETECT.WIDTH / GRID.COLUMNS;

export const KEEP_DAYS = [1, 3, 7, 14, 30] as const;

export interface WatchSettings {
  /** 0 (only big, clear motion) to 100 (the smallest change). */
  sensitivity: number;
  /** One character per cell, row by row: "1" watched, "0" ignored. */
  zones: string;
  keep_days: number;
}

export const ALL_ZONES = "1".repeat(CELLS);

export const DEFAULT_SETTINGS: WatchSettings = { sensitivity: 50, zones: ALL_ZONES, keep_days: 7 };

export const SettingsSchema: z.ZodType<WatchSettings> = z.object({
  sensitivity: z.number().min(0).max(100),
  zones: z.string().regex(new RegExp(`^[01]{${CELLS}}$`)),
  keep_days: z.number().int().min(1).max(365),
});

export interface DetectConfig {
  /** Grey levels a pixel has to differ from the background by. */
  threshold: number;
  /** Pixels of the 160×120 picture the biggest changed blob needs. */
  min_area: number;
  /** Per pixel of the detection picture: 1 watched, 0 ignored. */
  mask: Uint8Array;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export function detect_config(settings: Pick<WatchSettings, "sensitivity" | "zones">): DetectConfig {
  const t = Math.min(100, Math.max(0, settings.sensitivity)) / 100;
  return {
    threshold: Math.round(lerp(45, 12, t)),
    min_area: Math.round(lerp(160, 10, t)),
    mask: zone_mask(settings.zones),
  };
}

export function zone_mask(zones: string): Uint8Array {
  const mask = new Uint8Array(DETECT.WIDTH * DETECT.HEIGHT);
  for (let y = 0; y < DETECT.HEIGHT; y++) {
    const row = Math.floor(y / CELL_SIZE) * GRID.COLUMNS;
    for (let x = 0; x < DETECT.WIDTH; x++) mask[y * DETECT.WIDTH + x] = zones[row + Math.floor(x / CELL_SIZE)] === "0" ? 0 : 1;
  }
  return mask;
}

/** Sets every cell of the rectangle between two cells to `on`. */
export function paint_zones(zones: string, from: number, to: number, on: boolean): string {
  const left = Math.min(from % GRID.COLUMNS, to % GRID.COLUMNS);
  const right = Math.max(from % GRID.COLUMNS, to % GRID.COLUMNS);
  const top = Math.min(Math.floor(from / GRID.COLUMNS), Math.floor(to / GRID.COLUMNS));
  const bottom = Math.max(Math.floor(from / GRID.COLUMNS), Math.floor(to / GRID.COLUMNS));
  const cells = zones.split("");
  for (let row = top; row <= bottom; row++)
    for (let column = left; column <= right; column++) cells[row * GRID.COLUMNS + column] = on ? "1" : "0";
  return cells.join("");
}

export const watched_count = (zones: string) => zones.split("").filter((cell) => cell === "1").length;
