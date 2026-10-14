import { z } from "zod";
import type { AppId, AppProps } from "./type";

/** `.widget` files: an app's widget on the desktop, `w × h` grid cells (ADR-034). */
export const WIDGET_EXTENSION = ".widget";
export const WIDGET_MAX_SPAN = 8;

const span = z.int().min(1).max(WIDGET_MAX_SPAN);
const widget_schema = z.object({
  app: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
  w: span,
  h: span,
});

export interface WidgetFile {
  app: AppId;
  props?: AppProps;
  w: number;
  h: number;
}

export function parse_widget(text: string): WidgetFile | null {
  try {
    const result = widget_schema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serialize_widget(widget: WidgetFile): string {
  return JSON.stringify(widget, null, 2);
}

/** `"Call Bob.widget"` → `"Call Bob"`. */
export function widget_label(file_name: string): string {
  return file_name.slice(0, -WIDGET_EXTENSION.length);
}
