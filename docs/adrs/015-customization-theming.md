# ADR-015: Customization & Theming

**Date:** 2026-02-01
**Status:** Implemented (colours, appearance, export/import, taskbar size and auto-hide; no icon or sound settings)

> **Revision 2026-10-16: the rest of the theme system** ([brainstorm](../brainstorm/2026-10-13_desktop-theming.md#session-2026-10-16-the-rest-of-the-theme-system)). A separate `appearance` field in `/etc/settings.json`, sibling of `theme`, no version bump; presets, the generator and saved themes stay colour-only. Built: corners (`radius: sharp | default | round` → `--radius-scale` 0.4 / 1 / 1.5 inside the `@theme` radii, `rounded-full` excluded) and motion (`system | off`; `off` sets `html[data-motion="off"]`, which reuses the reduced-motion rule, and `motion_reduced()` stops View Transitions and the shell's Svelte transitions; the OS setting always wins). Shadows (`shadow: none | subtle | default | strong` → `--shadow-strength` 0 / 0.5 / 1 / 1.4 on the darkest-shade percentage inside each `@theme` shadow's `color-mix`; the `shadow-popover` hairline isn't scaled; Tailwind's shadow-colour rewrite keeps the `calc()`) and text size (`text: s | m | l` → `--text-scale` 0.9375 / 1 / 1.0625 on the root font-size, 15/16/17px; everything in rem scales with it). `animation_speed` became the motion on/off switch, `window_border_radius` the three-step scale, `window_shadow` the four steps, `font_size` the text size. `mode` and `accent_color` stay superseded; `font_family` is not now (the brand fixes Inter and Hack). Desktop icon and sound settings aren't built; taskbar size and auto-hide have their own revision.
>
> Export/import replaces the `ThemeExport` above: a `.webos-theme` file is one saved theme, `{ format: "webos-theme", version: 1, name, theme }` with all 17 colour tokens, nothing else (no taskbar, icons or wallpaper). Export from a saved theme's menu writes `~/Documents/{name}.webos-theme` (no overwrite: a taken name gets ` (1)`); no download, the file lives in OPFS like any other. Import is a file association: opening the file launches Settings with a `path` prop, which shows a preview in Appearance; Import saves it to Your themes (a name taken by a saved theme or a preset gets " (2)") and applies it. Every token is checked with `CSS.supports("color", …)`. The `#/theme?data=` share URL isn't built.

> **Revision 2026-10-15: what's built.** Only the colour system above, plus the taskbar position that predates this ADR. Radius, shadow, motion speed and export/import were deferred by the owner on 2026-10-13. Fonts, taskbar size and auto-hide, desktop icon settings and sounds aren't built.

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

## Revision 2026-10-16 (random theme)

Decided with the owner ([brainstorm](../brainstorm/2026-10-16_quick-launch-and-random-theme.md)). `random_theme(dark, rand?)` in `settings/random-theme.ts` makes a `ThemeBase` under rules, not at random: it keeps the current light or dark mode (`is_dark`, background lightness under 0.6); one base hue and a random harmony (analogous, complementary, triadic, split complementary) place primary, secondary and accent; the background is a low-chroma tint of the base hue and the foreground a near-neutral of the opposite hue; lightness ranges keep text at least 0.55 and colours at least 0.35 OKLCH lightness from the background. `derive_theme` expands it. Ways in: Settings › Appearance **Shuffle** and `theme random`. No new persistence: the result is an ordinary customised `settings.theme`.

## Revision 2026-10-16 (theme generator)

Decided with the owner ([brainstorm](../brainstorm/2026-10-16_theme-generator.md)): Shuffle read as "just shuffle". `generate_theme(options, rand?)` replaces `random_theme`. Options are mode (dark, light, any), harmony (or any), vibrance and contrast (0–1), and locked colours. The readable gaps stay (text 0.55, colours 0.35 lightness from the background) for every generated value. The range is wider: chroma up to 0.3, tinted backgrounds, either mode. Locked colours are kept as given and the rest are placed around them. Settings › Appearance gets a Generate panel (controls, a lock per base colour, live preview, Generate, Apply, the last 8 generations) in place of the Shuffle button. The recent list is module state in the Settings app, so it outlives the window but not a reload. `theme random` runs the generator with defaults in the current mode. No persistence change: Apply writes an ordinary customised `settings.theme`.

## Revision 2026-10-16 (saved themes)

Owner, after trying the generator ([brainstorm](../brainstorm/2026-10-16_theme-generator.md#saved-themes)): keep 3 recent generations, and save themes. Settings gains `saved_themes: { name, theme }[]` in `/etc/settings.json`, same `SETTINGS_VERSION` (a missing field parses as `[]`). Pure helpers in `saved-themes.ts` change it. Appearance gets Save… (a name prompt) in Generate and on Recent cards, and a "Your themes" grid above the presets with Apply, Rename… and Delete…. The shell's `theme list`, `theme set` and the `theme` completer include saved themes after presets, plus new `theme save <name>` and `theme delete <name>`. About › Reset settings keeps saved themes.

## Revision 2026-10-16 (locks pick the mode)

A locked foreground or colour that can only keep its gap in the other mode flips the generated mode, the way a locked background already set it. Locks that fit neither mode keep the asked mode and stay as given.

## Revision 2026-10-16 (taskbar size and auto-hide)

Decided with the owner ([brainstorm](../brainstorm/2026-10-16_taskbar-polish.md)). `Taskbar` gains `size: "small" | "medium" | "large"` (default `medium`) and `auto_hide: boolean` (default `false`), additive in `/etc/settings.json` under the same `SETTINGS_VERSION`. `show_clock` and `show_labels` aren't built.

- **Size** is one CSS variable on the taskbar's `<nav>`: `--taskbar-item` 2rem, 2.5rem or 3rem. The bar, buttons, icons, separators, quick launch and the show desktop sliver derive from it; medium is the bar as it was.
- **Auto-hide is an overlay revealed with CSS.** The bar leaves its grid track and goes `position: fixed`, slid off its edge but for 4px. `:hover`, `:focus-within` and `:has(:popover-open)` reveal it; `transition-delay: 2s` hides it. One `dragenter` handler sets `data-reveal` so drag to pin works, and a window item sets `data-reveal` while a window minimizes into it, so the bar is in place for the fly-in. Windows and maximize get the full screen, and flush mode is off. Rejected: a reserved 4px track with a JS `revealed` state.
- Revealing when an app requests attention waits on a `request_attention` API that doesn't exist.
- Ways in: Settings › Taskbar (a Size segmented control, an Auto-hide switch, both shown in the preview) and `taskbar position|size|autohide` in the shell, which print the current value with no argument.

## Revision 2026-10-21 (app fonts)

Decided with the owner ([brainstorm](../brainstorm/2026-10-21_app-font.md)). `Appearance` gains `font: { sans: FontChoice, mono: FontChoice }`, `FontChoice = { kind: "default" } | { kind: "builtin", id } | { kind: "file", name }`, additive in `/etc/settings.json` with a per-role fallback to `default`.

- **Copies in `/etc/fonts/`.** Choosing a font file copies it there (`use_font(role, path | File)`), so moving or deleting the original doesn't break it and backups carry it. A family is one file: a `.ttc` whose faces are split into single-face buffers when loading, because Chromium's `FontFace` only loads a collection's first face. Each face registers with its own weight and style, so CSS bold and italic use real faces.
- **Built-in Burrow**, made with Font Maker, ships in `public/fonts/` and loads as two variable faces (upright and italic, `wght` 300–700), since the UI uses 500 and 600 as well. They aren't precached; a Workbox runtime rule caches `/fonts/*.ttf|ttc` CacheFirst (`webos-fonts`) on first use, so a built-in works offline once chosen.
- **Off the boot path.** The loader is a lazy module; Inter and Hack paint first and the chosen family swaps in. `--font-sans` / `--font-mono` read `--app-font-sans` / `--app-font-mono`, falling back to Inter and Hack, so `@theme inline` utilities follow at runtime.
- **A broken or missing font** falls back to the default with an error notification: SettingsService now depends on `notifications`.
- Ways in: Settings › Appearance › Fonts (UI font and code font pickers, a font file per role, installed fonts with Remove), Font Viewer and Font Maker "Use as app font". No shell commands.
