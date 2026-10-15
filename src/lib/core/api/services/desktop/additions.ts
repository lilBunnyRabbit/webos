import { z } from "zod";
import type { AppId, AppManifest } from "$lib/core/api";
import { LAYOUT_DIRECTORY } from "./layout";

/** Widgets the desktop gets by default: on first boot, and once on desktops set up before they existed. */
export interface DefaultWidget {
  /** Recorded in the additions file once placed, so removing the widget sticks. */
  id: string;
  app_id: AppId;
  label: string;
}

/** Every installed app with `default_widget`, so deleting the app drops its widget too. */
export function default_widgets(apps: Iterable<[AppId, AppManifest]>): DefaultWidget[] {
  return [...apps].filter(([, app]) => app.default_widget && app.widget).map(([id, app]) => ({ id, app_id: id, label: app.name }));
}

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
export function pending_widgets(applied: string[], defaults: DefaultWidget[]): DefaultWidget[] {
  return defaults.filter((widget) => !applied.includes(widget.id));
}
