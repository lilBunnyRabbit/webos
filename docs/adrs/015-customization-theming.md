# ADR-015: Customization & Theming

**Date:** 2026-02-01
**Status:** Accepted

> **Revision 2026-10-10: colours follow the lilBunnyRabbit brand** ([brainstorm](../brainstorm/2026-10-10_brand-theming.md))
> - A theme is a palette of 11 colour tokens: `background`, `foreground`, `primary`, `secondary`, `tertiary`, `accent`, `cottontail`, `success`, `warning`, `error`, `info`. Values are OKLCH.
> - **Brand Dark** (default) and **Brand Light** are the brand palettes. The other presets are kept as user themes.
> - "Light vs dark" is a choice of palette, not a separate `mode` field. `mode` and `accent_color` below are superseded.
> - Presets that only define the five base colours get the rest derived with the brand formula (`derive_theme()`). No hand-picked extra colours.
> - Tailwind's default palette is disabled. No background ladder (the owner's choice).
> - The non-colour settings below (radius, shadow, animation, font, taskbar, icons, sound, export/import) are unchanged.

## Context

WebOS currently has basic theme support (light/dark) and taskbar position. The legacy plan included extensive customization: wallpapers (covered in ADR-011), sound effects, window appearance, theme export/import, and more. This ADR covers non-wallpaper customization managed by SettingsService.

### Related ADRs

- **ADR-011** (Desktop Enhancements) — wallpaper settings
- **ADR-012** (Shortcuts Service) — shortcut customization

## Decision

### Theme System

SettingsService manages a theme configuration:

```typescript
interface ThemeSettings {
  mode: "light" | "dark" | "system";
  accent_color: string;         // CSS color for accent/primary
  window_border_radius: number; // px, 0-16
  window_shadow: "none" | "subtle" | "medium" | "strong";
  animation_speed: "none" | "reduced" | "normal";
  font_family: "system" | "mono" | string;
  font_size: "small" | "medium" | "large";
}
```

Theme values are applied as CSS custom properties on the root element. Components reference these variables rather than hardcoded values.

### Taskbar Customization

Extends existing taskbar settings:

```typescript
interface TaskbarSettings {
  position: "top" | "bottom" | "left" | "right";
  size: "small" | "medium" | "large";
  auto_hide: boolean;
  show_clock: boolean;
  show_labels: boolean;     // show app names next to icons
}
```

**Auto-hide behavior:**
- Taskbar slides out of view after 2 seconds of no hover
- Shows on hover near the edge
- Shows when an app requests attention (notification badge)

### Desktop Icon Settings

```typescript
interface DesktopIconSettings {
  size: "small" | "medium" | "large";  // 48, 64, 80px
  show_labels: boolean;
  grid_spacing: "compact" | "normal" | "wide";
}
```

### Sound Effects (Optional / Low Priority)

```typescript
interface SoundSettings {
  enabled: boolean;
  volume: number;           // 0-1
  window_open: boolean;
  window_close: boolean;
  notification: boolean;
}
```

Sounds are short audio files bundled with the app or uploaded by the user. Played via Web Audio API.

### Theme Export/Import

Themes can be exported as JSON and imported:

```typescript
interface ThemeExport {
  version: 1;
  theme: ThemeSettings;
  taskbar: TaskbarSettings;
  desktop_icons: DesktopIconSettings;
  wallpaper: WallpaperSettings;
}
```

- **Export:** Settings > Appearance > Export Theme → downloads JSON file
- **Import:** Settings > Appearance > Import Theme → upload JSON, preview, apply
- **Share via URL:** `#/theme?data={base64_encoded_json}` (see ADR-010)

## Alternatives Considered

1. **CSS-only theming with presets** — simpler but no user customization. Rejected for flexibility.
2. **Separate Theming Service** — adds another service. Rejected — SettingsService already handles all user preferences, theming is just another category.
3. **No sound effects** — valid for v1. Marked as low priority, can be added later.

## Consequences

### Positive
- Highly personalized experience
- Theme sharing creates community engagement potential
- CSS custom properties make theming performant
- Export/import enables easy backup and sharing

### Negative
- Many settings to manage and test
- Sound effects increase bundle size (mitigate with lazy loading)
- Theme export format needs versioning for forward compatibility
