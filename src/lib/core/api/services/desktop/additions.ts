import { z } from "zod";
import type { AppId } from "$lib/core/api";
import { LAYOUT_DIRECTORY } from "./layout";

/** Widgets the desktop gets by default: on first boot, and once on desktops set up before they existed. */
export interface DefaultWidget {
  /** Recorded in the additions file once placed, so removing the widget sticks. */
  id: string;
  app_id: AppId;
  label: string;
  size: { w: number; h: number };
}

export const DEFAULT_WIDGETS: DefaultWidget[] = [{ id: "game-hub", app_id: "game-hub", label: "Game Hub", size: { w: 4, h: 2 } }];

export const ADDITIONS_FILE = "additions.json";
export const ADDITIONS_PATH = `${LAYOUT_DIRECTORY}/${ADDITIONS_FILE}`;

const AdditionsSchema = z.object({ version: z.literal(1), applied: z.array(z.string()) });

/** The default ids already placed. Missing or invalid → none. */
export function parse_additions(text: string | null): string[] {
  if (text === null) return [];
  try {
    const result = AdditionsSchema.safeParse(JSON.parse(text));
    return result.success ? result.data.applied : [];
  } catch {
    return [];
  }
}

export function serialize_additions(applied: string[]): string {
  return JSON.stringify({ version: 1, applied: [...new Set(applied)].sort() }, null, 2) + "\n";
}

/** Defaults not placed yet. */
export function pending_widgets(applied: string[], defaults: DefaultWidget[] = DEFAULT_WIDGETS): DefaultWidget[] {
  return defaults.filter((widget) => !applied.includes(widget.id));
}
