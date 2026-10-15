import { z } from "zod";
import type { StorageHandle } from "$lib/core/contexts/app";
import { BrushShape, Pattern, PATTERNS } from "./raster";
import { PLAY_MODES, PlayMode } from "./sequence";
import { Tool, TOOLS } from "./tools";

export interface Onion {
  enabled: boolean;
  before: number;
  after: number;
  opacity: number;
  tint: boolean;
}

interface Box<T> {
  value: T;
}

export interface Prefs {
  tool: Box<Tool>;
  size: Box<number>;
  shape: Box<BrushShape>;
  pixel_perfect: Box<boolean>;
  pattern: Box<Pattern>;
  contiguous: Box<boolean>;
  filled: Box<boolean>;
  mirror_x: Box<boolean>;
  mirror_y: Box<boolean>;
  grid: Box<boolean>;
  tile: Box<number>;
  onion: Box<Onion>;
  play_mode: Box<PlayMode>;
  side: Box<Panel>;
  strip: Box<Panel>;
}

export interface Panel {
  size: number;
  collapsed: boolean;
}

export const SIDE = { rest: 56, min: 152, default: 200, max: 360 } as const;
export const STRIP = { rest: 44, min: 60, default: 84, max: 280 } as const;

const PanelSchema = z.object({ size: z.number().min(0).max(2000), collapsed: z.boolean() });

export const MAX_BRUSH = 16;

const OnionSchema = z.object({
  enabled: z.boolean(),
  before: z.number().int().min(0).max(4),
  after: z.number().int().min(0).max(4),
  opacity: z.number().min(5).max(90),
  tint: z.boolean(),
});

/** Must run during component init: `persisted` saves through an effect. */
export function create_prefs(storage: StorageHandle): Prefs {
  return {
    tool: storage.persisted<Tool>("tool", Tool.PENCIL, z.enum(TOOLS)),
    size: storage.persisted("size", 1, z.number().int().min(1).max(MAX_BRUSH)),
    shape: storage.persisted<BrushShape>("shape", BrushShape.SQUARE, z.enum([BrushShape.SQUARE, BrushShape.ROUND])),
    pixel_perfect: storage.persisted("pixel_perfect", true, z.boolean()),
    pattern: storage.persisted<Pattern>("pattern", Pattern.SOLID, z.enum(PATTERNS)),
    contiguous: storage.persisted("contiguous", true, z.boolean()),
    filled: storage.persisted("filled", false, z.boolean()),
    mirror_x: storage.persisted("mirror_x", false, z.boolean()),
    mirror_y: storage.persisted("mirror_y", false, z.boolean()),
    grid: storage.persisted("grid", true, z.boolean()),
    tile: storage.persisted("tile", 0, z.number().int().min(0).max(256)),
    onion: storage.persisted<Onion>("onion", { enabled: false, before: 1, after: 1, opacity: 40, tint: true }, OnionSchema),
    play_mode: storage.persisted<PlayMode>("play_mode", PlayMode.LOOP, z.enum(PLAY_MODES)),
    side: storage.persisted<Panel>("side", { size: SIDE.default, collapsed: false }, PanelSchema),
    strip: storage.persisted<Panel>("strip", { size: STRIP.default, collapsed: false }, PanelSchema),
  };
}
