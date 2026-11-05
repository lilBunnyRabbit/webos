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

const PrefsSchema = z.object({
  tool: z.enum(TOOLS).catch(Tool.PENCIL),
  size: z.number().int().min(1).max(MAX_BRUSH).catch(1),
  shape: z.enum([BrushShape.SQUARE, BrushShape.ROUND]).catch(BrushShape.SQUARE),
  pixel_perfect: z.boolean().catch(true),
  pattern: z.enum(PATTERNS).catch(Pattern.SOLID),
  contiguous: z.boolean().catch(true),
  filled: z.boolean().catch(false),
  mirror_x: z.boolean().catch(false),
  mirror_y: z.boolean().catch(false),
  grid: z.boolean().catch(true),
  tile: z.number().int().min(0).max(256).catch(0),
  onion: OnionSchema.catch({ enabled: false, before: 1, after: 1, opacity: 40, tint: true }),
  play_mode: z.enum(PLAY_MODES).catch(PlayMode.LOOP),
  side: PanelSchema.catch({ size: SIDE.default, collapsed: false }),
  strip: PanelSchema.catch({ size: STRIP.default, collapsed: false }),
});
type Stored = z.infer<typeof PrefsSchema>;

/** Must run during component init: `storage.file` releases the file with the component. Defaults show until it is read. */
export function create_prefs(storage: StorageHandle): Prefs {
  const file = storage.file("storage.json", PrefsSchema.parse({}), PrefsSchema);
  const box = <K extends keyof Stored>(key: K): Box<Stored[K]> => ({
    get value() {
      return file.value[key];
    },
    set value(value: Stored[K]) {
      file.value[key] = value;
    },
  });
  return {
    tool: box("tool"),
    size: box("size"),
    shape: box("shape"),
    pixel_perfect: box("pixel_perfect"),
    pattern: box("pattern"),
    contiguous: box("contiguous"),
    filled: box("filled"),
    mirror_x: box("mirror_x"),
    mirror_y: box("mirror_y"),
    grid: box("grid"),
    tile: box("tile"),
    onion: box("onion"),
    play_mode: box("play_mode"),
    side: box("side"),
    strip: box("strip"),
  };
}
