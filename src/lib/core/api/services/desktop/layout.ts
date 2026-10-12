import { z } from "zod";
import type { Position } from "$lib/core/utils/type";

import { PATHS } from "../files/hierarchy";

/** Icon positions are OS state about the desktop, so they live in system storage, not among the user's files. */
export const LAYOUT_DIRECTORY_NAME = "desktop";
export const LAYOUT_DIRECTORY = `${PATHS.var_lib}/${LAYOUT_DIRECTORY_NAME}`;
export const LAYOUT_FILE = "layout.json";
export const LAYOUT_PATH = `${LAYOUT_DIRECTORY}/${LAYOUT_FILE}`;
const LAYOUT_VERSION = 1;

const layout_schema = z.object({
  version: z.literal(LAYOUT_VERSION),
  positions: z.record(z.string(), z.object({ x: z.int().min(0), y: z.int().min(0) })),
});

export type Positions = Record<string, Position>;

/** Unknown version or a corrupt file means no saved positions; icons then take the first free cells. */
export function parse_layout(text: string): Positions {
  try {
    const result = layout_schema.safeParse(JSON.parse(text));
    return result.success ? result.data.positions : {};
  } catch {
    return {};
  }
}

export function serialize_layout(positions: Positions): string {
  return JSON.stringify({ version: LAYOUT_VERSION, positions }, null, 2);
}

/** The React version (branch `v0-react`) kept pinned apps and their grid cells in a zustand store under this key. */
const V0_STORAGE_KEY = "desktop";

const v0_schema = z.object({
  state: z.object({
    items: z.record(z.string(), z.object({ grid: z.object({ x: z.int().min(0), y: z.int().min(0) }) })),
  }),
});

export interface V0Pin {
  app_id: string;
  position: Position;
}

/** Reads and removes the v0 desktop pins, so the first seed keeps what the user had pinned. */
export function take_v0_pins(): V0Pin[] | null {
  try {
    const raw = localStorage.getItem(V0_STORAGE_KEY);
    if (raw === null) return null;
    localStorage.removeItem(V0_STORAGE_KEY);

    const result = v0_schema.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    return Object.entries(result.data.state.items).map(([app_id, item]) => ({ app_id, position: item.grid }));
  } catch {
    return null;
  }
}
