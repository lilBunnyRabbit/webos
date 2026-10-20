# ADR-057: Live Wallpapers
**Date:** 2026-10-20
**Status:** Implemented 2026-10-21

> **Revision 2026-10-21: implementation.** Built as decided, with these details the ADR left open:
> - `LiveWallpaperId` is a `string` alias in `settings/type.ts`; validity is membership in `LIVE_WALLPAPERS`. Settings persistence imports the registry, so the ids and zod schemas are in the boot chunk (+0.6 KB gz); every component stays lazy, including the mount (`live-layer.svelte`).
> - `live_options_of(id, saved)` in the registry is the one place options are parsed: on load, in the layer and in the Settings form. Schemas use a `.catch` per field, so a broken field falls back alone.
> - `LiveContext.windows` is measured on read from each visible window's `[data-window-id]` element (ids and visibility from WindowsService), not computed from `bounds`: a dragged window's position lives in its local move state and a snapped or maximized one in CSS. Popped-out windows (ADR-043) are skipped.
> - `cells` are the grid dots' cells, `(columns + 1) × (rows + 1)` centred on the line crossings like the `[data-dots]` CSS; a preview tiles its host in 14px cells.
> - "Fullscreen" is `document.fullscreenElement`; WindowsService has no fullscreen flag.
> - Settings shows live wallpapers in their own section after Wallpaper, per the one-section-per-topic pattern. About › Reset settings also clears `live_options`.
> - Pew Pew clears bolts in flight when paused, so none stay frozen over a maximized window.

> **Revision 2026-10-21: widgets are shields (owner feedback).** "The lasers should hit windows and widgets if the mouse is over them, not the mouse: you hide from them." `LiveContext` gains `widgets: DOMRect[]`, measured on read from each `[data-desktop-widget]` element in the desktop surface, like `windows`. Pew Pew's shield mode treats windows and widgets alike: a cursor inside either can't be hit (before, a bolt stopping just short of a window's edge could still reach a cursor within 6px inside it, and widgets weren't shields at all), and turrets under either hold fire. Bolts and their shield sparks stay on the background layer; the sparks got bigger, longer and a glow so they read at an edge even when partly behind it.

## Context
LaxDOTexe proposed turrets on the grid dots that shoot at the mouse. Generalized: wallpapers that animate and react to the pointer and the windows. Discussion: [brainstorm](../brainstorm/2026-10-20_live-wallpapers.md).

## Decision
- `Wallpaper` gains `{ kind: "live"; id: LiveWallpaperId }`. `SettingsService` keeps `live_options: Partial<Record<LiveWallpaperId, unknown>>` in `/etc/settings.json`, validated by each entry's schema; invalid options fall back to its defaults. An unknown id parses to the grid preset.
- A registry of OS built-ins in `src/lib/core/components/desktop/live/`:
  ```ts
  interface LiveWallpaperEntry<T> {
    name: string;
    authors?: AppAuthor[];
    options: z.ZodType<T>;          // with defaults
    background: () => Promise<{ default: Component<LiveProps<T>> }>;
    overlay?: () => Promise<{ default: Component<LiveProps<T>> }>;
    settings?: () => Promise<{ default: Component<{ value: T; onchange(value: T): void }> }>;
  }
  interface LiveContext {
    pointer: { x: number; y: number } | null;  // page coordinates, null when outside
    windows: DOMRect[];
    cells: DOMRect[];
    paused: boolean;
    preview: boolean;
  }
  ```
- `wallpaper.svelte` mounts `background` behind the desktop (preview renders with `preview` and `paused` true). The desktop mounts `overlay` in one full-screen layer above windows, below the taskbar and dialogs, with `pointer-events: none`.
- Paused while the tab is hidden or a maximized or fullscreen window covers the desktop.
- Desktop only: mobile hides live wallpapers and draws the grid in their place.
- Settings › Wallpaper lists live wallpapers with a still preview, a byline from `authors`, and the selected one's options form.
- No shell commands.

## Alternatives Considered
- App-contributed wallpapers through `define_app`: a public API change; deferred.
- A canvas draw callback the framework drives: canvas only.
- Pausing on motion off and idle: not picked.

## Consequences
- Code loads only when a live wallpaper is picked; boot weight is unchanged.
- The overlay layer is a new z-level in the shell, owned by the active wallpaper only.
- Pew Pew (turrets) is the first entry.
