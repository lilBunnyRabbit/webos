import { z } from "zod";
import type { AppId, AppProps } from "./type";

/** `.desktop` shortcut files: JSON pointing at an app (ADR-022). */
export const SHORTCUT_EXTENSION = ".desktop";

const shortcut_schema = z.object({
  app_id: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
});

export interface Shortcut {
  app_id: AppId;
  props?: AppProps;
}

export function parse_shortcut(text: string): Shortcut | null {
  try {
    const result = shortcut_schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serialize_shortcut(shortcut: Shortcut): string {
  return JSON.stringify(shortcut, null, 2);
}

/** `"Settings.desktop"` → `"Settings"`. */
export function shortcut_label(file_name: string): string {
  return file_name.slice(0, -SHORTCUT_EXTENSION.length);
}
