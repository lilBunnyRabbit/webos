import type { Component } from "svelte";
import type { ZodType } from "zod";
import type { AppAuthor } from "$lib/core/api/services/apps/type";
import type { LiveWallpaperId } from "$lib/core/api/services/settings/type";
import { OWNER } from "$lib/core/api/services/apps/authors";
import { turrets_options } from "./turrets/options";

/** What a live wallpaper sees (ADR-057). Coordinates are the page's, like `getBoundingClientRect()`. */
export interface LiveContext {
  readonly pointer: { x: number; y: number } | null;
  /** Visible windows, measured on read. */
  readonly windows: DOMRect[];
  /** The desktop grid as the dots tile it: one cell per dot, the dot at its centre. */
  readonly cells: DOMRect[];
  /** Tab hidden, a maximized window or a fullscreen element covers the desktop, or a preview. Draw nothing new. */
  readonly paused: boolean;
  /** A Settings thumbnail: draw one still frame. */
  readonly preview: boolean;
}

export interface LiveProps<T> {
  context: LiveContext;
  options: T;
}

export interface LiveSettingsProps<T> {
  value: T;
  onchange(value: T): void;
}

type Lazy<P extends object> = () => Promise<{ default: Component<P> }>;

export interface LiveWallpaperEntry<T> {
  name: string;
  authors?: AppAuthor[];
  /** Fills defaults, so `parse({})` is the default options. */
  options: ZodType<T>;
  background: Lazy<LiveProps<T>>;
  /** Above windows, below the taskbar and dialogs; never takes the pointer. */
  overlay?: Lazy<LiveProps<T>>;
  settings?: Lazy<LiveSettingsProps<T>>;
}

export type LiveLayer = "background" | "overlay";

// Options always pass through the entry's own schema before reaching its components, so erasing T here is safe.
function define_live<T>(entry: LiveWallpaperEntry<T>): LiveWallpaperEntry<unknown> {
  return entry as unknown as LiveWallpaperEntry<unknown>;
}

/** OS built-ins, in Settings order. Only `options` is read at boot; the components load when picked. */
export const LIVE_WALLPAPERS: Record<LiveWallpaperId, LiveWallpaperEntry<unknown>> = {
  turrets: define_live({
    name: "Pew Pew",
    authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
    options: turrets_options,
    background: () => import("./turrets/turrets-background.svelte"),
    overlay: () => import("./turrets/turrets-overlay.svelte"),
    settings: () => import("./turrets/turrets-settings.svelte"),
  }),
};

/** The entry's options from a saved value: invalid fields fall back to their defaults, anything else to all defaults. */
export function live_options_of(id: LiveWallpaperId, saved: unknown): unknown {
  const schema = LIVE_WALLPAPERS[id]?.options;
  if (!schema) return undefined;
  const result = schema.safeParse(saved ?? {});
  return result.success ? result.data : schema.parse({});
}
