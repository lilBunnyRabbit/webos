# Brainstorm: Desktop wallpaper, auto-arrange and theming (block 6)

**Date:** 2026-10-13
**Participants:** owner, agent

## Context

Roadmap block 6 is what's left of ADR-011 (desktop) and ADR-015 (theming). Multi-select was done on 2026-10-12. Both ADRs date from February and predate the Svelte rewrite and the brand revision.

What exists today:

- **Desktop background:** fixed CSS in `desktop.svelte` (`.desktop-surface`): `background-darkest`, a dot grid marking icon cells, and a soft glow from `background-dark`. No setting.
- **Desktop layout:** `/var/lib/desktop/layout.json` holds `{ name: {x, y} }`. `GridDesktopService.move_items(moves)` writes it once. The background menu has New folder, Paste, Gather windows and Change theme. No sort or arrange.
- **Mobile home:** ordered pages and a dock in its own layout (`home-layout.ts`). No grid cells, so arranging doesn't apply.
- **Settings:** `/etc/settings.json`, version 1, `{ theme, taskbar, file_defaults }`. `theme` is the 11 brand colour tokens plus the surface ladder, written to `:root` as CSS variables. `file_defaults` was added after v1 as an additive field.
- **Radius, shadow and motion:** fixed tokens in `app.css` (`--radius-*`, `--shadow-*`, `--ease-*`, the `pop-in`/`sheet-in` durations). `prefers-reduced-motion` already collapses all motion to 1ms.
- **Settings app:** sections About, Appearance, Files, Taskbar, What's new.

ADR-011 asks for solid, gradient and image wallpapers (fit modes, blur, tint, brightness), and auto-arrange "from top-left, column by column". ADR-015 asks for radius, shadow, animation speed and font settings, plus export and import as JSON. Sound, taskbar size/auto-hide and icon size are in ADR-015 too, but they're not on the block 6 line.

## Topics discussed

### 1. Wallpaper kinds
- **Token presets + a user image** (chosen). Presets are CSS built from theme tokens (today's dot grid is one), so they follow every theme. An image has fit, dim and blur.
- Rejected: the full ADR-011 set (free solid colours and gradients add colours outside the token system and don't follow theme changes); presets only (no own photo).

### 2. Where an image lives
- **Copied into `/var/lib/wallpaper/`** (chosen); settings stores that path, and the old copy is deleted on replace. Moving or deleting the original doesn't break the wallpaper.
- Rejected: referencing the user's file in `/home` (silently breaks on move/delete), a data URL in settings (MBs rewritten on every settings change).

### 3. Auto-arrange
- **One-shot "Sort by"** in the desktop background menu (chosen): rewrites `layout.json` once through `move_items`, column by column from the top left. Icons stay free to drag afterwards. No new state.
- Rejected: a persistent "Keep arranged" mode (new persisted state, drag forks into two modes), a bare "Arrange icons" without sort keys.

### 4. Theme settings (radius, motion, shadows, font, export/import)
- **Skipped for now** (owner). Block 6 is wallpaper and sort only; ADR-015's non-colour settings stay Accepted, not built.

### 5. Where the wallpaper setting lives
- **An additive `wallpaper` field in `/etc/settings.json`** on SettingsService (chosen), sanitized on load like `file_defaults`; settings stay version 1. `set_wallpaper_image(source)` copies the image into `/var/lib/wallpaper/` and deletes the previous copy. `source` is `string | File`, the ADR-031 pattern, so a device file goes straight in without an upload first.
- Rejected: its own `/etc/wallpaper.json` owned by DesktopService (two places for appearance, both desktop implementations would need it).

### 6. Phone home screen
- **Same wallpaper** (chosen), one shared `Wallpaper` component behind the desktop and the mobile home. The phone has no icon cells, so the grid preset draws without its dots there.
- Rejected: desktop only (the setting silently does nothing on a phone), a separate phone wallpaper (double UI and storage).

### 7. How an image is set
- **Settings › Appearance** (preset tiles, Choose image…, From device…, fit, dim, blur) **and "Set as wallpaper"** in the menu of image files (chosen).
- Rejected: Settings only.

### 8. Sort keys
- **Name, Kind and Date modified** (owner, over the agent's Name and Kind). OPFS folders have no modified time, so folders sort first and undated, then files newest first. Kind order: folders, app shortcuts, then files by extension, each by name.

## Key takeaways

- Wallpapers stay inside the token system: presets are drawn from theme tokens; the only foreign colours are the user's own photo.
- Sorting is a one-shot rewrite of `layout.json`; there's no arranged mode to keep in sync.
- ADR-015's non-colour settings and export/import are deferred, not dropped.

## Action items

- [x] ADR-011 revision: wallpaper and Sort by
- [x] Settings: `wallpaper` field, `set_wallpaper_image`, parse/sanitize, tests
- [x] `Wallpaper` component behind desktop and mobile home
- [x] Settings › Appearance › Wallpaper; "Set as wallpaper" on image files
- [x] Desktop background menu: Sort by Name / Kind / Date modified
- [x] docs/system, design patterns, ROADMAP, changelog

## Next session topics

- ADR-015 theme settings (radius, motion, shadows, font) and export/import, when the owner picks them up.
