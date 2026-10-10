import { z } from "zod";
import type { Position } from "$lib/core/utils/type";

import { PATHS } from "../files/hierarchy";

/** Icon positions are OS state about the desktop, so they live in system storage, not among the user's files. */
export const LAYOUT_DIRECTORY = `${PATHS.var_lib}/desktop`;
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
