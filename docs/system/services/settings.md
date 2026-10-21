# SettingsService

Key `settings` · Depends on: `files`, `notifications` · ADR: [ADR-002](../../adrs/002-service-lifecycle.md) (lifecycle), [ADR-011](../../adrs/011-desktop-enhancements.md) (wallpaper), [ADR-021](../../adrs/021-file-system-hierarchy.md) (`/etc`), [ADR-015](../../adrs/015-customization-theming.md) (theming), [ADR-018](../../adrs/018-file-associations.md) (`file_defaults`), [ADR-024](../../adrs/024-design-system.md) (surface tokens), [ADR-042](../../adrs/042-quick-launch.md) (`taskbar.pinned`), [ADR-057](../../adrs/057-live-wallpapers.md) (`live` wallpaper, `live_options`), ADR-015 revisions (`taskbar.size`, `taskbar.auto_hide`, `taskbar.seconds`; app fonts, 2026-10-21) · Source: `src/lib/core/api/services/settings/` · Inspector: `inspector.svelte` (ADR-020)

| File | Contents |
|------|----------|
| `type.ts` | `SettingsService` interface, `Taskbar`, `TaskbarPosition`, `TaskbarSize`, `Theme`, `ThemeToken`, `ThemeBaseToken`, `ThemeSurfaceToken`, `ThemeBase`, `SavedTheme`, `FileDefaults`, `Wallpaper`, `WallpaperPreset`, `WallpaperFit`, `LiveWallpaperId`, `LiveOptions`, `Appearance`, `AppearanceRadius`, `AppearanceMotion`, `AppearanceShadow`, `AppearanceText`, `AppearanceFont`, `FontRole`, `FontChoice` |
| `fonts.ts` | `FONT_DIRECTORY` (`/etc/fonts`), `FONT_EXTENSIONS`, `FONT_FILE_ACCEPT`, `BUILTIN_FONTS` (`burrow`: two variable faces, upright and italic), `DEFAULT_FONT_NAMES` (`Inter`, `Hack`), `DEFAULT_FONT`, `is_font_file_name()`, `font_label()`, `same_font()` |
| `font-loader.ts` | Lazy (`import()` on the first non-default font): `sfnt_style()` reads weight (`OS/2` `usWeightClass`, or a variable font's `fvar` `wght` range) and italic (`OS/2` `fsSelection` bit 0 or `head` `macStyle` bit 1); `file_faces()` splits a `.ttc` with `split_collection()` (`core/utils/font-collection.ts`); `load_faces()` builds and loads the `FontFace`s |
| `service.svelte.ts` | The class |
| `persistence.ts` | `SETTINGS_PATH` (`/etc/settings.json`), `SETTINGS_VERSION`, `WALLPAPER_DIRECTORY_NAME` (`wallpaper`), `WALLPAPER_DIRECTORY` (`/var/lib/wallpaper`), `DEFAULT_WALLPAPER`, `PersistedSettings`, `parse_settings()`, `parse_wallpaper()`, `parse_live_options()`, `parse_appearance()`, `serialize_settings()`, `take_legacy_settings()`, `take_v0_settings()`, sanitizing (`merge_theme`) |
| `themes.ts` | `BRAND_DARK`, `BRAND_LIGHT`, `WHILE_TRUE`, `derive_surfaces()`, `derive_theme()`, `THEME_PRESETS`, `ThemePreset`, `ThemeGroup` |
| `appearance.ts` | `DEFAULT_APPEARANCE`, `RADIUS_SCALE` (`sharp` 0.4, `default` 1, `round` 1.5), `SHADOW_STRENGTH` (`none` 0, `subtle` 0.5, `default` 1, `strong` 1.4), `TEXT_SCALE` (`s` 0.9375, `m` 1, `l` 1.0625) |
| `taskbar.ts` | `with_pin()`, `without_pin()`: the quick launch list operations (ADR-042) |
| `saved-themes.ts` | `find_saved()`, `with_saved()`, `without_saved()`, `renamed_saved()`: pure helpers over `saved_themes`, names compared trimmed and case-insensitive. Saving an existing name replaces it in place; renaming onto another saved name returns the list unchanged |
| `random-theme.ts` | `generate_theme()`, `DEFAULT_GENERATE`, `Harmony`, `ThemeMode`, `GenerateOptions`, `parse_oklch()`, `is_dark()`, `oklch_lightness()`, `MIN_TEXT_CONTRAST`, `MIN_COLOUR_CONTRAST` (ADR-015 revisions) |
| `shell.ts` | `settings_shell()`, see [Shell](#shell) |

`index.ts` exports `type.ts`, `themes.ts`, `taskbar.ts`, `random-theme.ts`, `saved-themes.ts`, `appearance.ts` and `fonts.ts`. `persistence.ts` stays private to the service. It imports `LIVE_WALLPAPERS` and `live_options_of()` from `components/desktop/live/registry.ts` (ADR-057), so the live wallpaper ids and option schemas are in the boot chunk; their components aren't ([desktop › Live wallpapers](../shell/desktop.md#live-wallpapers)).

## Purpose

Owns the user's persisted OS preferences: theme colour tokens, saved themes, taskbar position, pins, size, auto-hide and clock seconds, per-extension default apps, the wallpaper and the live wallpapers' options, and the non-colour appearance (corners, shadows, text size, motion, the UI and code fonts). It writes the theme onto `<html>` as CSS variables (plus `color-scheme`), loads the chosen fonts, and saves everything to `/etc/settings.json` when anything changes.

## Public API

The API is seven plain reactive fields, which consumers assign to directly, plus methods for what needs a file copied: wallpaper images and fonts.

| Member | Signature | Notes |
|--------|-----------|-------|
| `theme` | `theme: Theme` (`Record<ThemeToken, string>`) | 17 tokens (`snake_case` keys). Replace it wholesale (`settings.theme = { ...settings.theme, primary: v }`) or mutate a key. Both trigger the effects, because it's deep `$state`. |
| `taskbar` | `taskbar: Taskbar` = `{ position: TaskbarPosition, pinned: AppId[], size: TaskbarSize, auto_hide: boolean, seconds: boolean }` | Read by `desktop-shell.svelte`, `taskbar.svelte`, `window-manager.svelte`, `taskbar-clock.svelte`. The Settings app and the `taskbar position|size|autohide|seconds` commands (AppsService) mutate `position`, `size`, `auto_hide` and `seconds` ([taskbar](../shell/taskbar.md#size), [auto-hide](../shell/taskbar.md#auto-hide), [clock](../shell/taskbar.md#clock)). `pinned` is the quick launch in order ([taskbar](../shell/taskbar.md#quick-launch)); assign `with_pin(pinned, id, index?)` / `without_pin(pinned, id)`. Written by the quick launch, the start menu, App Library, the window item menu, the `taskbar` commands (AppsService) and `apps.uninstall()`. |
| `file_defaults` | `file_defaults: FileDefaults` (`Record<".ext", AppId>`) | Written by AppsService when the user picks "Always use" in Open-with. Read by `apps.open()`. The Settings app's Default apps page removes entries by reassigning the object. |
| `wallpaper` | `wallpaper: Wallpaper` | `{ kind: "preset", preset: "grid" \| "glow" \| "tint" \| "plain" }` or `{ kind: "image", path, fit: "fill" \| "fit" \| "tile" \| "center", dim: 0–0.6, blur: 0–20 }`, or `{ kind: "live", id }` with an id from the live registry (ADR-057; desktop only, the phone draws the grid). Assign a preset or a live wallpaper, or spread the image to change fit, dim or blur. Drawn by `components/desktop/wallpaper.svelte` behind the desktop and the phone home ([desktop](../shell/desktop.md#wallpaper)) |
| `saved_themes` | `saved_themes: SavedTheme[]` (`{ name, theme: Theme }`) | Themes the user named, in the order saved. Change through the `saved-themes.ts` helpers and assign the result. Written by Settings › Appearance (Save…, Rename…, Delete…, importing a `.webos-theme` file) and `theme save` / `theme delete`. Exported and imported as `.webos-theme` files by the Settings app ([Settings](../system-apps.md#settings)); the service has no file format of its own for them. Kept by About › Reset settings |
| `appearance` | `appearance: Appearance` = `{ radius: "sharp" \| "default" \| "round", motion: "system" \| "off", shadow: "none" \| "subtle" \| "default" \| "strong", text: "s" \| "m" \| "l", font: { sans: FontChoice, mono: FontChoice } }` | The non-colour look (ADR-015 revision). Not part of a theme: presets, the generator and saved themes never touch it. Mutate a field (`settings.appearance.radius = "round"`); replace `font` wholesale (`settings.appearance.font = { ...font, sans: choice }`). `FontChoice` is `{ kind: "default" }` (Inter / Hack), `{ kind: "builtin", id }` (a `BUILTIN_FONTS` key) or `{ kind: "file", name }` (a file in `/etc/fonts`). Written by Settings › Appearance › Interface and Fonts; reset by About › Reset settings |
| `live_options` | `live_options: LiveOptions` (`Partial<Record<LiveWallpaperId, unknown>>`) | Each live wallpaper's options by id (ADR-057), kept when switching away so switching back restores them. Replace an entry wholesale (`settings.live_options = { ...settings.live_options, [id]: next }`). Values are parsed by the entry's schema on load; readers parse again with `live_options_of(id, value)`, which gives the defaults for a missing entry. Written by the selected wallpaper's options form in Settings › Appearance › Live wallpapers; cleared by About › Reset settings |
| `set_wallpaper_image` | `(source: string \| File) => Promise<void>` | Copies a path or a device file (ADR-031 `string \| File`) to `/var/lib/wallpaper/{base36 time}-{name}`, sets `wallpaper` to it keeping the previous image's fit, dim and blur (else fill, 0, 0), then prunes the folder. Throws when the path doesn't exist. Callers: Settings › Appearance, `set_wallpaper()` in `file-actions.ts` (Explorer, desktop, Media Preview) |
| `use_font` | `(role: FontRole, source: string \| File) => Promise<void>` | Copies a path or a device file (`.ttc .ttf .otf .woff .woff2`, checked by name) to `/etc/fonts/{name}`, overwriting a file of that name (creating the folder on first use), and sets `appearance.font[role]` to it. Reinstalling a name a role already uses loads it again. Throws when the path doesn't exist or the name isn't a font file. Callers: Settings › Appearance › Fonts, Font Viewer and Font Maker "Use as app font" |
| `remove_font` | `(name: string) => Promise<void>` | Deletes `/etc/fonts/{name}`; every role that used it goes back to `default` |
| `installed_fonts` | `() => Promise<string[]>` | Font file names in `/etc/fonts`, sorted. Settings › Fonts re-reads it on the folder's revision |
| `init` | `init(): Promise<void>` | See Lifecycle. |
| `destroy` | `destroy(): void` | Disposes the effect root, removes the loaded font faces and `--app-font-*`. |
| `to_string` | `to_string(): string` | Taskbar position plus the JSON of the theme. |
| `name` / `description` | `"SettingsService"` | |

Exports from `themes.ts`, re-exported through `$lib/core/api`:

| Export | Signature | Notes |
|--------|-----------|-------|
| `BRAND_DARK` | `Theme` | Default. All OKLCH literals, including the brand's exact surface ladder. |
| `BRAND_LIGHT` | `Theme` | All OKLCH literals, including the brand's exact surface ladder. |
| `derive_surfaces` | `() => Record<ThemeSurfaceToken, string>` | The six ladder shades as `oklch(from var(--background) …)` at ±n·0.034 lightness, reflecting at 0 and 1 with `abs()` ([theming](../theming.md#the-surface-ladder)). Used by `derive_theme()` and for older saves. |
| `derive_theme` | `(base: ThemeBase) => Theme` | Spreads `derive_surfaces()` and fills `tertiary`, `cottontail` and the four state tokens with relative-colour CSS that references `var(--primary)` / `var(--secondary)`. |
| `THEME_PRESETS` | `ThemePreset[]` (`{ name, theme, group }`) | Brand Dark, Brand Light, then 19 `derive_theme()` presets in group `webos`; then group `projects`: Speed Reader Light, Speed Reader Dark and While True (`WHILE_TRUE`, written out like the brand themes: the style guide's `#ff9f58` as `background_darkest` (desktop), white and cream windows, `#090919` text and primary; neubrutalist in colour only, hard borders and offset shadows need ADR-015). All base colours are OKLCH. |
| `TaskbarPosition` | const enum `top \| bottom \| left \| right` | From `type.ts`. |
| `TaskbarSize` | const enum `small \| medium \| large` | From `type.ts`. The taskbar's `--taskbar-item`: 2rem, 2.5rem, 3rem. |
| `with_pin` / `without_pin` | `(pinned, id, index?) => AppId[]` / `(pinned, id) => AppId[]` | From `taskbar.ts`. `with_pin` moves an already pinned id instead of doubling it; `index` counts without it, clamped, default the end. |
| `generate_theme` | `(options: GenerateOptions, rand?: () => number) => ThemeBase` | From `random-theme.ts` (ADR-015 revision, theme generator). Options: `mode` (`dark`, `light`, `any`: a coin flip), `harmony` (`analogous 0 30 −30`, `complementary 0 180 30`, `triadic 0 120 240`, `split 0 150 210`, or `any`), `vibrance` 0–1, `contrast` 0–1, `locked` (a `Partial<ThemeBase>` kept as given). One base hue (a locked primary's, else a locked background's, else random). Colours: chroma 0.05→0.30 by vibrance (±20%), hue ±8° jitter, L 0.66–0.82 dark / 0.42–0.56 light. Background: L 0.30→0.12 dark / 0.90→0.98 light by contrast, chroma 0.008→0.07 by vibrance, at the base hue. Foreground: L 0.86→0.97 dark / 0.34→0.16 light, near-neutral at the opposite hue. A locked background sets the mode; otherwise, when the locked text and colours can only keep their gap in the other mode (dark text locked into a Dark generation), the mode flips. Locks that fit neither mode keep the asked one. Then the gaps are enforced: an unlocked background moves away from locked text and colours, and generated text and colours move away from the background, so generated values keep text ≥ 0.55 and colours ≥ 0.35 lightness from it. Locks win: a lock that fits neither mode stays as given and its gap can break. Feed it to `derive_theme()`. `DEFAULT_GENERATE` is any harmony, vibrance and contrast 0.5. |
| `is_dark` | `(theme) => boolean` | Background lightness under 0.6; an unparseable (non-`oklch`) background counts as dark. |

Token list and semantics: [theming.md](../theming.md).

## State

```ts
taskbar       = $state<Taskbar>({ position: "bottom", pinned: [], size: "medium", auto_hide: false, seconds: false });
theme         = $state<Theme>({ ...BRAND_DARK });
file_defaults = $state<FileDefaults>({});
wallpaper     = $state<Wallpaper>({ kind: "preset", preset: "grid" });
saved_themes  = $state<SavedTheme[]>([]);
appearance    = $state<Appearance>({ ...DEFAULT_APPEARANCE });
live_options  = $state<LiveOptions>({});
```

Private: `files_service` (`$derived` in the constructor), `dispose_effects`, and `writer: LatestWriter` for `SETTINGS_PATH`.

Nothing is derived inside the service. Consumers derive from it. For example, `desktop-shell.svelte` derives `position`, and the `@theme` colours in CSS follow the variables.

## Lifecycle

`init()`, async:

1. `files.get_file("/etc/settings.json")`.
2. `take_legacy_settings()`: read and **remove** the old localStorage key `webos.settings`. This runs on every boot, file or not, so a stale legacy copy can never come back later.
   `take_v0_settings()` does the same for the v0 React key `settings` (zustand `{ state: { theme, taskbar } }`): it keeps the taskbar position, and the theme only if it differs from v0's saved defaults (otherwise Brand Dark). `webos.settings` wins if both exist.
3. Use the file's `parse_settings()` result if the file exists, otherwise the legacy result. If that's non-null, assign `theme`, `taskbar`, `file_defaults`, `wallpaper`, `saved_themes`, `appearance` and `live_options`. Then prune `/var/lib/wallpaper` without awaiting: every file but the current image is deleted, so an image left behind when a preset was chosen goes at the next boot. A file that exists but doesn't parse means defaults, even when a legacy copy was there.
4. Start an `$effect.root` with five effects:
   - **Token writer:** for each `[key, value]` of `theme`, call `document.documentElement.style.setProperty("--" + key.replaceAll("_", "-"), value)`, so `background_dark` is written as `--background-dark`. Then set `documentElement.style.colorScheme` to `light` when the applied background's lightness is above 0.6, otherwise `dark`. The lightness comes from a probe element (`background_lightness()`), so hex and relative colour syntax work too ([theming](../theming.md#color-scheme)). The probe forces a style recalc, so it's skipped (the previous `color-scheme` kept) when `theme.background` is the same string as last run and contains no `var(`: editing any other token doesn't probe.
   - **Appearance writer:** sets `--radius-scale`, `--shadow-strength` and `--text-scale` on `<html>` from `RADIUS_SCALE`, `SHADOW_STRENGTH` and `TEXT_SCALE`, and `data-motion="off"` on `<html>` while `appearance.motion` is `off` (removed otherwise).
   - **Font loaders**, one per role (`sans`, `mono`): when `appearance.font[role]` changes to another choice (or `use_font` reinstalled its file), load it without blocking. See [Fonts](#fonts).
   - **Saver:** `writer.write(serialize_settings({ version: 1, theme, taskbar, file_defaults, wallpaper, saved_themes, appearance, live_options }))`. It tracks every field deeply, because `JSON.stringify` reads every property.

`destroy()` disposes the root. A write already queued still finishes. Nothing extra is saved on destroy, because the saver has already run after every change.

`get_file` throws only for unexpected OPFS errors (missing file → `null`); such an error rejects `init()` and fails the boot. Parse errors fall back to defaults.

## Persistence

| | |
|-|-|
| Store | OPFS, through FilesService |
| Path | `/etc/settings.json` (ADR-021: OS config lives in `/etc`) |
| Format | `{ "version": 1, "theme": Theme, "taskbar": { "position": …, "pinned": ["app-id"], "size": "medium", "auto_hide": false, "seconds": false }, "file_defaults": { ".ext": "app-id" }, "wallpaper": Wallpaper, "saved_themes": [{ "name": …, "theme": Theme }], "appearance": { "radius": …, "motion": …, "shadow": …, "text": …, "font": { "sans": FontChoice, "mono": FontChoice } }, "live_options": { "turrets": { "mode": "shield", "pace": "normal", "sound": false, "volume": 0.5 } } }`, pretty-printed (2 spaces) |
| Images | `/var/lib/wallpaper/`, copies owned by the OS. Only the current image is kept |
| Fonts | `/etc/fonts/`, copies owned by the OS, kept until removed in Settings › Fonts. Backups carry them with `/etc` |
| Version | `SETTINGS_VERSION = 1` |
| Written | 300 ms after the last change (debounced), flushed when the tab hides. Also right after `init()` when the file is missing or its normalized text differs from what was read; an unchanged file isn't rewritten. |
| Legacy | localStorage `webos.settings` (same format), then v0 `settings` (zustand). Imported once when `/etc/settings.json` doesn't exist, removed on every boot |

**Write queue.** The saver goes through `LatestWriter` with `delay: 300` (`files/latest-writer.ts`, shared with [session](session.md), shell history, version state and app `storage.file()`; see [files](files.md#latestwriter)): writes never overlap, and a burst of changes (typing in a token field, dragging a slider) saves once, after the last. It is seeded with the text read at `init()`. `/etc` is recreated if missing. Each write bumps the `/etc` revision.

Load and sanitize rules (`parse_settings` in `persistence.ts`):

- Missing file and no legacy key → `null` → in-memory defaults.
- JSON parse error → `console.error("Failed to load settings:")` → defaults.
- `version !== 1` → ignored, not migrated → defaults. The saver then overwrites the file with defaults on the first flush.
- `theme` (`merge_theme`): starts from `BRAND_DARK`, overlaid with a surface ladder, then copies over only known token keys whose value is a `string`. Unknown keys are dropped. The ladder fills tokens a save predates: if the saved `background` equals Brand Dark's or Brand Light's, that palette's exact shades (and its other tokens) are the fallback; otherwise `derive_surfaces()`, so the ladder follows the saved background. Other missing tokens get the Brand Dark value. **Values are not validated as CSS.** A garbage string gets written to the variable as-is.
- `taskbar.position`: must be one of `TaskbarPosition`, otherwise `bottom`.
- `taskbar.pinned`: additive; strings only, deduplicated, else `[]`. Ids aren't checked against the registry; the quick launch skips unknown ones.
- `taskbar.size`: additive; one of `TaskbarSize`, else `medium`.
- `taskbar.auto_hide`: additive; `true` only when stored as `true`, else `false`.
- `taskbar.seconds`: additive; `true` only when stored as `true`, else `false`.
- `file_defaults`: keeps entries whose key starts with `.` and whose value is a string. It's an additive field, so v1 blobs without it load as `{}`. The app id is not checked against the registry here. `apps.open()` deals with stale ids.
- `wallpaper` (`parse_wallpaper`, zod): additive like `file_defaults`, so a missing or invalid value is the grid preset. An image path must be inside `/var/lib/wallpaper/`; a bad `fit` becomes `fill`, an out-of-range `dim` or `blur` becomes 0. The image file isn't checked here; a missing one draws the glow. A `live` wallpaper must name an id in `LIVE_WALLPAPERS` (own keys only), else it's the grid preset.
- `live_options` (`parse_live_options`): additive; missing or not an object → `{}`. Ids not in the registry are dropped; each kept entry goes through `live_options_of()`: the entry's zod schema with a `.catch` per field, so a broken field falls back alone, and a value that isn't an object is all defaults.
- `saved_themes`: additive; entries need a non-empty trimmed name, the first of each name (case ignored) wins, each theme merged like `theme`. Missing → `[]`.
- `appearance` (`parse_appearance`, zod): additive; each field falls back to its default (`default`, `system`, `default`, `m`) on its own, so one unknown value doesn't reset the others. Missing or not an object → `DEFAULT_APPEARANCE`. `font.sans` and `font.mono` fall back to `default` on their own too: a `builtin` id must be a `BUILTIN_FONTS` key, a `file` name a plain base name (no `/` or `\`, not dotted, at most 120 characters) ending in a font extension. Whether the file exists is found out when it loads.
- Write errors (quota, OPFS failure) → `console.error("Failed to save settings:")`; the writer moves on to the next queued text. A legacy-key read or remove that throws counts as no legacy copy.

## Behaviour & invariants

- The theme is applied before mount: the token effect runs on the first flush after `init()`. Until then, `index.html` and `body` use the hardcoded Brand Dark `#17252c`. Because `init()` now waits for FilesService's OPFS bootstrap and a file read, the splash covers that wait.
- Tokens are only ever set, never removed. A token missing from `theme` keeps its last value on `<html>`. That can't happen through the public flow, because load always fills all 17.
- Derived presets store strings like `oklch(from var(--primary) l 0.14 140)` as the token value. They resolve at use time in CSS, so editing `primary` live re-derives the states.
- No cross-tab sync, and none possible through `storage` events now that the store is OPFS. Two tabs each write their own state, and the last write wins on reload.
- The file isn't watched. Editing or deleting `/etc/settings.json` (File Explorer can delete it) takes effect on the next boot, and the next settings change in this tab overwrites it.
- The Settings app's About → Reset (`sections/about.svelte`) resets `taskbar` (position, pins, size, auto-hide and seconds), `theme`, `file_defaults`, `wallpaper` (grid preset; the image copy is pruned at the next boot), `appearance` and `live_options`. Saved themes stay. Default apps → Forget / Forget all clears `file_defaults` entries only.
- `color-scheme` is set in the same effect as the tokens, so native controls switch together with the palette.
- **Radius:** every `@theme` radius in `app.css` (`--radius`, `xs` … `3xl`) is `calc(<px> * var(--radius-scale, 1))`, so the utilities follow the variable on `<html>`. `rounded-full` and arbitrary values (`rounded-[5px]`) aren't scaled.
- **Shadows:** the darkest-shade percentage inside each `@theme` shadow's `color-mix` is `calc(<n>% * var(--shadow-strength, 1))`. Tailwind's `--tw-shadow-color` rewrite keeps the `calc()` intact (checked in the built CSS, inside its `@supports (color: color-mix(…))` block). A percentage past 100% (Strong on `shadow-window-focused`) clamps to 100%. The 1px `foreground/16` hairline in `shadow-popover`, the desktop glyph drop-shadows and the `--overlay` scrim aren't scaled.
- **Fonts:** see [Fonts](#fonts).
- **Text size:** the base layer gives `html` `font-size: calc(100% * var(--text-scale, 1))`: 15, 16 or 17px at the browser's default. Every size and most spacing is in rem, so the whole UI scales with it, inside windows whose sizes stay in px; `@container` layouts react to the content, not the window.
- **Motion:** `appearance.motion` only ever removes motion. `off` sets `html[data-motion="off"]`, which gets the same 1ms rule as `prefers-reduced-motion: reduce` in the base layer; `system` leaves the OS setting in charge, and it always wins. Script-driven motion checks `motion_reduced()` (`$lib/core/utils/motion.ts`, either condition): `view_transition()` skips, and the shell's Svelte transitions (window open/close, toasts, the mobile app drawer, the update overlay) run with duration 0, since they use the Web Animations API, which the CSS rule doesn't reach.

## Fonts

The UI font (`sans`) and the code font (`mono`) are chosen per role in `appearance.font` ([brainstorm](../../brainstorm/2026-10-21_app-font.md)). Inter and Hack stay the defaults.

- **CSS.** `app.css` declares `--font-sans: var(--app-font-sans, "Inter"), ui-sans-serif, system-ui, sans-serif` and `--font-mono: var(--app-font-mono, "Hack"), ui-monospace, monospace` in `@theme inline`, so the `font-sans` / `font-mono` utilities and every `var(--font-*)` follow two runtime variables. The service sets `--app-font-{role}` on `<html>` to `"webos-{role}-{n}", "Inter"` (or `"Hack"`): the default stays behind the chosen family, so characters it lacks still show. A default choice removes the variable. CodeMirror (`$kit/components/code/editor.ts`) and Diff's theme use `var(--font-mono)` / `var(--font-sans)` too.
- **Loading.** Off the boot path: `init()` doesn't wait, the page paints in Inter and Hack and swaps when the faces are in. The effect for a role starts a request (a counter per role; a newer one makes an older one drop its result), then reads the faces and `import()`s `font-loader.ts`:
  - `builtin`: each face in `BUILTIN_FONTS[id].faces` is fetched from `${BASE_URL}{path}` and registered with its own descriptors. Burrow ships as two variable fonts, `fonts/burrow-vf.ttf` (`300 700`, normal) and `fonts/burrow-italic-vf.ttf` (`300 700`, italic), because the UI asks for 500 and 600 too; `fonts/burrow.ttc` ships beside them as the family file.
  - `file`: `/etc/fonts/{name}` is read and split with `split_collection()`. Chromium's `FontFace` loads only the first face of a `.ttc` (checked in `font-maker.browser.test.ts`), so each face becomes its own sfnt buffer. Each face's descriptors come from its tables: `weight` from `OS/2` (or the `fvar` `wght` range of a variable font), `style` italic from `fsSelection` / `macStyle`. WOFF and WOFF2 load with no descriptors (400, normal).
  - Every face is a `FontFace("webos-{role}-{n}", bytes, descriptors)`; faces that fail to load are skipped, none loading is an error. The new faces are added to `document.fonts`, the role's previous ones deleted, then `--app-font-{role}` is set. CSS bold and italic pick real faces when the family has them, and the browser synthesizes the rest.
- **Failure.** Either way the role shows the default for now and an error notification is posted ("Couldn't load {name}", "… Using Inter instead."), which is why the service depends on `notifications`. A file choice (missing, or a file the browser can't read) is also set back to `default` if it's still the choice, and settings are saved that way, so a broken file doesn't fail at every boot. A built-in that failed to download keeps its choice and loads on the next boot.
- **Offline.** The built-in files in `public/fonts/` aren't precached (about 0.5 MB for Burrow's two variable faces, which most installs never use). A Workbox runtime rule in `vite.config.ts` caches `/fonts/*.ttf|ttc` CacheFirst in its own `webos-fonts` cache (200 responses only, 8 entries) on first download, so a built-in font chosen once keeps working offline. Fonts in `/etc/fonts` are in OPFS and always offline.
- **Installed fonts.** `/etc/fonts/` holds copies the OS owns, like wallpaper images: moving or deleting the original doesn't break the choice, editing it means using it again. Nothing prunes the folder; Settings › Fonts lists and removes them.

## Divergence from ADR

- ADR-002's revision note describes a localStorage blob `{ version: 1, theme, taskbar }`. The code stores it in `/etc/settings.json` (ADR-021, CONVENTIONS → Services) and adds `file_defaults` (ADR-018), `wallpaper` (ADR-011 revision), `taskbar.pinned` (ADR-042), `taskbar.size` / `taskbar.auto_hide` / `taskbar.seconds`, `saved_themes` and `appearance` (ADR-015 revisions) and `live_options` (ADR-057) without a version bump (noted in `persistence.ts`). The six surface tokens (ADR-024) were also added without a bump; `merge_theme` fills them for older saves.

## Shell

Contributes `theme get|list|set|random|save|delete`, the `theme` completer and value type (`settings/shell.ts`). `theme list` yields presets then saved themes (columns name, saved, active), and the `theme` completer lists both (detail `active` or `saved`). `theme get` and `theme set` take either; a preset wins a name clash. `theme save <name…>` saves the current theme (a preset's name is refused; the same saved name replaces it). `theme delete <name…>` removes a saved theme (available while any exist). `theme random` keeps the current mode (`is_dark`), sets `derive_theme(generate_theme({ ...DEFAULT_GENERATE, mode }))` and yields the five base colours. The `taskbar pin|unpin|list|position|size|autohide|seconds` commands live in AppsService's shell, beside the pin commands that need the registry ([apps](apps.md#shell)). See [shell](shell.md#contributions).

## Known gaps

- ADR-015's font family, desktop icon and sound settings, and the taskbar's `show_clock` and `show_labels`, aren't built. Easing and durations are constants in `app.css`.
- Every field added since v1 is additive and parsed with its own default, so no migration has been needed. Only a `version` other than 1 is discarded: a breaking change to the format would need `parse_settings()` to learn to migrate.
