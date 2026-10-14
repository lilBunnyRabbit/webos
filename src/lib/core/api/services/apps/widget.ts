import { z } from "zod";
import type { AppId, AppProps, WidgetSize, WidgetSizeLimits } from "./type";

/** `.widget` files: an app's widget on the desktop, `w × h` grid cells (ADR-034). */
export const WIDGET_EXTENSION = ".widget";
export const WIDGET_MAX_SPAN = 8;
/** What `pin_widget` writes for an app that declares no `widget_size`. */
export const WIDGET_FALLBACK_SIZE: WidgetSize = { w: 2, h: 2 };

const span = z.int().min(1).max(WIDGET_MAX_SPAN);
const size_schema = z.object({ w: span, h: span });
const widget_schema = z.object({
  app: z.string().min(1),
  props: z.record(z.string(), z.unknown()).optional(),
  w: span,
  h: span,
});

const within = (size: WidgetSize, min: WidgetSize, max: WidgetSize) =>
  size.w >= min.w && size.h >= min.h && size.w <= max.w && size.h <= max.h;

/** A manifest's `widget_size`: every span 1–8 and `min ≤ default ≤ max` on both axes. */
export const widget_size_schema = z
  .object({ min: size_schema, max: size_schema, default: size_schema })
  .refine(({ min, max, default: initial }) => within(initial, min, max), "widget_size needs min ≤ default ≤ max");

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

/** `size` pulled into the app's range on each axis. Without limits the size stands. */
export function clamp_widget_size(size: WidgetSize, limits: WidgetSizeLimits | undefined): WidgetSize {
  if (!limits) return size;
  return {
    w: Math.min(limits.max.w, Math.max(limits.min.w, size.w)),
    h: Math.min(limits.max.h, Math.max(limits.min.h, size.h)),
  };
}

/** The size a new widget gets: the one asked for, clamped, else the app's default, else 2×2. */
export function initial_widget_size(limits: WidgetSizeLimits | undefined, size?: WidgetSize): WidgetSize {
  if (size) return clamp_widget_size(size, limits);
  return limits ? { ...limits.default } : { ...WIDGET_FALLBACK_SIZE };
}
