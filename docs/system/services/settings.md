# SettingsService

Key `settings` · Depends on: `files` · ADR: [ADR-002](../../adrs/002-service-lifecycle.md) (lifecycle), [ADR-011](../../adrs/011-desktop-enhancements.md) (wallpaper), [ADR-021](../../adrs/021-file-system-hierarchy.md) (`/etc`), [ADR-015](../../adrs/015-customization-theming.md) (theming), [ADR-018](../../adrs/018-file-associations.md) (`file_defaults`), [ADR-024](../../adrs/024-design-system.md) (surface tokens), [ADR-042](../../adrs/042-quick-launch.md) (`taskbar.pinned`) · Source: `src/lib/core/api/services/settings/` · Inspector: `inspector.svelte` (ADR-020)

| File | Contents |
|------|----------|
| `type.ts` | `SettingsService` interface, `Taskbar`, `TaskbarPosition`, `Theme`, `ThemeToken`, `ThemeBaseToken`, `ThemeSurfaceToken`, `ThemeBase`, `FileDefaults`, `Wallpaper`, `WallpaperPreset`, `WallpaperFit` |
| `service.svelte.ts` | The class |
| `persistence.ts` | `SETTINGS_PATH` (`/etc/settings.json`), `SETTINGS_VERSION`, `WALLPAPER_DIRECTORY_NAME` (`wallpaper`), `WALLPAPER_DIRECTORY` (`/var/lib/wallpaper`), `DEFAULT_WALLPAPER`, `parse_settings()`, `parse_wallpaper()`, `serialize_settings()`, `take_legacy_settings()`, `take_v0_settings()`, sanitizing (`merge_theme`) |
| `themes.ts` | `BRAND_DARK`, `BRAND_LIGHT`, `derive_surfaces()`, `derive_theme()`, `THEME_PRESETS`, `ThemePreset`, `ThemeGroup` |
| `taskbar.ts` | `with_pin()`, `without_pin()`: the quick launch list operations (ADR-042) |
| `saved-themes.ts` | `find_saved()`, `with_saved()`, `without_saved()`, `renamed_saved()`: pure helpers over `saved_themes`, names compared trimmed and case-insensitive. Saving an existing name replaces it in place; renaming onto another saved name returns the list unchanged |
| `random-theme.ts` | `generate_theme()`, `DEFAULT_GENERATE`, `Harmony`, `ThemeMode`, `GenerateOptions`, `parse_oklch()`, `is_dark()`, `oklch_lightness()`, `MIN_TEXT_CONTRAST`, `MIN_COLOUR_CONTRAST` (ADR-015 revisions) |
| `shell.ts` | `settings_shell()`, see [Shell](#shell) |

`index.ts` exports `type.ts`, `themes.ts`, `taskbar.ts`, `random-theme.ts` and `saved-themes.ts`. `persistence.ts` stays private to the service.

## Purpose

Owns the user's persisted OS preferences: theme colour tokens, saved themes, taskbar position, per-extension default apps, and the wallpaper. It writes the theme onto `<html>` as CSS variables (plus `color-scheme`) and saves everything to `/etc/settings.json` when anything changes.

## Public API

The API is five plain reactive fields, which consumers assign to directly, plus one method for wallpaper images, which need a file copied.

| Member | Signature | Notes |
|--------|-----------|-------|
| `theme` | `theme: Theme` (`Record<ThemeToken, string>`) | 17 tokens (`snake_case` keys). Replace it wholesale (`settings.theme = { ...settings.theme, primary: v }`) or mutate a key. Both trigger the effects, because it's deep `$state`. |
| `taskbar` | `taskbar: Taskbar` = `{ position: TaskbarPosition, pinned: AppId[] }` | Read by `os.svelte`, `taskbar.svelte`, `window-manager.svelte`. The Settings app mutates `taskbar.position`. `pinned` is the quick launch in order ([taskbar](../shell/taskbar.md#quick-launch)); assign `with_pin(pinned, id, index?)` / `without_pin(pinned, id)`. Written by the quick launch, the start menu, App Library, the window item menu, the `taskbar` commands (AppsService) and `apps.uninstall()`. |
| `file_defaults` | `file_defaults: FileDefaults` (`Record<".ext", AppId>`) | Written by AppsService when the user picks "Always use" in Open-with. Read by `apps.open()`. The Settings app's Default apps page removes entries by reassigning the object. |
| `wallpaper` | `wallpaper: Wallpaper` | `{ kind: "preset", preset: "grid" \| "glow" \| "tint" \| "plain" }` or `{ kind: "image", path, fit: "fill" \| "fit" \| "tile" \| "center", dim: 0–0.6, blur: 0–20 }`. Assign a preset, or spread the image to change fit, dim or blur. Drawn by `components/desktop/wallpaper.svelte` behind the desktop and the phone home ([desktop](../shell/desktop.md#wallpaper)) |
| `saved_themes` | `saved_themes: SavedTheme[]` (`{ name, theme: Theme }`) | Themes the user named, in the order saved. Change through the `saved-themes.ts` helpers and assign the result. Written by Settings › Appearance (Save…, Rename…, Delete…) and `theme save` / `theme delete`. Kept by About › Reset settings |
| `set_wallpaper_image` | `(source: string \| File) => Promise<void>` | Copies a path or a device file (ADR-031 `string \| File`) to `/var/lib/wallpaper/{base36 time}-{name}`, sets `wallpaper` to it keeping the previous image's fit, dim and blur (else fill, 0, 0), then prunes the folder. Throws when the path doesn't exist. Callers: Settings › Appearance, `set_wallpaper()` in `file-actions.ts` (Explorer, desktop, Media Preview) |
| `init` | `init(): Promise<void>` | See Lifecycle. |
| `destroy` | `destroy(): void` | Disposes the effect root. |
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
| `with_pin` / `without_pin` | `(pinned, id, index?) => AppId[]` / `(pinned, id) => AppId[]` | From `taskbar.ts`. `with_pin` moves an already pinned id instead of doubling it; `index` counts without it, clamped, default the end. |
| `generate_theme` | `(options: GenerateOptions, rand?: () => number) => ThemeBase` | From `random-theme.ts` (ADR-015 revision, theme generator). Options: `mode` (`dark`, `light`, `any`: a coin flip), `harmony` (`analogous 0 30 −30`, `complementary 0 180 30`, `triadic 0 120 240`, `split 0 150 210`, or `any`), `vibrance` 0–1, `contrast` 0–1, `locked` (a `Partial<ThemeBase>` kept as given). One base hue (a locked primary's, else a locked background's, else random). Colours: chroma 0.05→0.30 by vibrance (±20%), hue ±8° jitter, L 0.66–0.82 dark / 0.42–0.56 light. Background: L 0.30→0.12 dark / 0.90→0.98 light by contrast, chroma 0.008→0.07 by vibrance, at the base hue. Foreground: L 0.86→0.97 dark / 0.34→0.16 light, near-neutral at the opposite hue. A locked background sets the mode; otherwise, when the locked text and colours can only keep their gap in the other mode (dark text locked into a Dark generation), the mode flips. Locks that fit neither mode keep the asked one. Then the gaps are enforced: an unlocked background moves away from locked text and colours, and generated text and colours move away from the background, so generated values keep text ≥ 0.55 and colours ≥ 0.35 lightness from it. Locks win: a lock that fits neither mode stays as given and its gap can break. Feed it to `derive_theme()`. `DEFAULT_GENERATE` is any harmony, vibrance and contrast 0.5. |
| `is_dark` | `(theme) => boolean` | Background lightness under 0.6; an unparseable (non-`oklch`) background counts as dark. |

Token list and semantics: [theming.md](../theming.md).

## State

```ts
taskbar       = $state<Taskbar>({ position: "bottom", pinned: [] });
theme         = $state<Theme>({ ...BRAND_DARK });
file_defaults = $state<FileDefaults>({});
wallpaper     = $state<Wallpaper>({ kind: "preset", preset: "grid" });
```

Private: `files_service` (`$derived` in the constructor), `dispose_effects`, and `writer: LatestWriter` for `SETTINGS_PATH`.

Nothing is derived inside the service. Consumers derive from it. For example, `os.svelte` derives `position`, and the `@theme` colours in CSS follow the variables.

## Lifecycle

`init()`, async:

1. `files.get_file("/etc/settings.json")`.
2. `take_legacy_settings()`: read and **remove** the old localStorage key `webos.settings`. This runs on every boot, file or not, so a stale legacy copy can never come back later.
   `take_v0_settings()` does the same for the v0 React key `settings` (zustand `{ state: { theme, taskbar } }`): it keeps the taskbar position, and the theme only if it differs from v0's saved defaults (otherwise Brand Dark). `webos.settings` wins if both exist.
3. Use the file's `parse_settings()` result if the file exists, otherwise the legacy result. If that's non-null, assign `theme`, `taskbar`, `file_defaults` and `wallpaper`. Then prune `/var/lib/wallpaper` without awaiting: every file but the current image is deleted, so an image left behind when a preset was chosen goes at the next boot. A file that exists but doesn't parse means defaults, even when a legacy copy was there.
4. Start an `$effect.root` with two effects:
   - **Token writer:** for each `[key, value]` of `theme`, call `document.documentElement.style.setProperty("--" + key.replaceAll("_", "-"), value)`, so `background_dark` is written as `--background-dark`. Then set `documentElement.style.colorScheme` to `light` when the applied background's lightness is above 0.6, otherwise `dark`. The lightness comes from a probe element (`background_lightness()`), so hex and relative colour syntax work too ([theming](../theming.md#color-scheme)).
   - **Saver:** `writer.write(serialize_settings({ version: 1, theme, taskbar, file_defaults, wallpaper }))`. It tracks all four fields deeply, because `JSON.stringify` reads every property.

`destroy()` disposes the root. A write already queued still finishes. Nothing extra is saved on destroy, because the saver has already run after every change.

`get_file` throws only for unexpected OPFS errors (missing file → `null`); such an error rejects `init()` and fails the boot. Parse errors fall back to defaults.

## Persistence

| | |
|-|-|
| Store | OPFS, through FilesService |
| Path | `/etc/settings.json` (ADR-021: OS config lives in `/etc`) |
| Format | `{ "version": 1, "theme": Theme, "taskbar": { "position": …, "pinned": ["app-id"] }, "file_defaults": { ".ext": "app-id" }, "wallpaper": Wallpaper }`, pretty-printed (2 spaces) |
| Images | `/var/lib/wallpaper/`, copies owned by the OS. Only the current image is kept |
| Version | `SETTINGS_VERSION = 1` |
| Written | On every change, after the effect flush. Also once right after `init()`, which creates or normalizes the file. |
| Legacy | localStorage `webos.settings` (same format), then v0 `settings` (zustand). Imported once when `/etc/settings.json` doesn't exist, removed on every boot |

**Write queue.** The saver goes through `LatestWriter` (`files/latest-writer.ts`, shared with [session](session.md), shell history, version state and app `storage.file()`; see [files](files.md#latestwriter)): writes never overlap, and a burst of changes (typing in a token field) collapses to at most one write in flight plus the newest pending one. `/etc` is recreated if missing. Each write bumps the `/etc` revision.

Load and sanitize rules (`parse_settings` in `persistence.ts`):

- Missing file and no legacy key → `null` → in-memory defaults.
- JSON parse error → `console.error("Failed to load settings:")` → defaults.
- `version !== 1` → ignored, not migrated → defaults. The saver then overwrites the file with defaults on the first flush.
- `theme` (`merge_theme`): starts from `BRAND_DARK`, overlaid with a surface ladder, then copies over only known token keys whose value is a `string`. Unknown keys are dropped. The ladder fills tokens a save predates: if the saved `background` equals Brand Dark's or Brand Light's, that palette's exact shades (and its other tokens) are the fallback; otherwise `derive_surfaces()`, so the ladder follows the saved background. Other missing tokens get the Brand Dark value. **Values are not validated as CSS.** A garbage string gets written to the variable as-is.
- `taskbar.position`: must be one of `TaskbarPosition`, otherwise `bottom`.
- `taskbar.pinned`: additive; strings only, deduplicated, else `[]`. Ids aren't checked against the registry; the quick launch skips unknown ones.
- `file_defaults`: keeps entries whose key starts with `.` and whose value is a string. It's an additive field, so v1 blobs without it load as `{}`. The app id is not checked against the registry here. `apps.open()` deals with stale ids.
- `wallpaper` (`parse_wallpaper`, zod): additive like `file_defaults`, so a missing or invalid value is the grid preset. An image path must be inside `/var/lib/wallpaper/`; a bad `fit` becomes `fill`, an out-of-range `dim` or `blur` becomes 0. The image file isn't checked here; a missing one draws the glow.
- Write errors (quota, OPFS failure) → `console.error("Failed to save settings:")`; the writer moves on to the next queued text. A legacy-key read or remove that throws counts as no legacy copy.

## Behaviour & invariants

- The theme is applied before mount: the token effect runs on the first flush after `init()`. Until then, `index.html` and `body` use the hardcoded Brand Dark `#17252c`. Because `init()` now waits for FilesService's OPFS bootstrap and a file read, the splash covers that wait.
- Tokens are only ever set, never removed. A token missing from `theme` keeps its last value on `<html>`. That can't happen through the public flow, because load always fills all 17.
- Derived presets store strings like `oklch(from var(--primary) l 0.14 140)` as the token value. They resolve at use time in CSS, so editing `primary` live re-derives the states.
- No cross-tab sync, and none possible through `storage` events now that the store is OPFS. Two tabs each write their own state, and the last write wins on reload.
- The file isn't watched. Editing or deleting `/etc/settings.json` (File Explorer can delete it) takes effect on the next boot, and the next settings change in this tab overwrites it.
- The Settings app's About → Reset (`sections/about.svelte`) resets `taskbar` (position and pins), `theme`, `file_defaults` and `wallpaper` (grid preset; the image copy is pruned at the next boot). Default apps → Forget / Forget all clears `file_defaults` entries only.
- `color-scheme` is set in the same effect as the tokens, so native controls switch together with the palette.

## Divergence from ADR

- ADR-002's revision note describes a localStorage blob `{ version: 1, theme, taskbar }`. The code stores it in `/etc/settings.json` (ADR-021, CONVENTIONS → Services) and adds `file_defaults` (ADR-018) and `wallpaper` (ADR-011 revision) without a version bump (noted in `persistence.ts`). The six surface tokens (ADR-024) were also added without a bump; `merge_theme` fills them for older saves.

## Shell

Contributes `theme get|list|set|random|save|delete`, the `theme` completer and value type (`settings/shell.ts`). `theme list` yields presets then saved themes (columns name, saved, active), and the `theme` completer lists both (detail `active` or `saved`). `theme get` and `theme set` take either; a preset wins a name clash. `theme save <name…>` saves the current theme (a preset's name is refused; the same saved name replaces it). `theme delete <name…>` removes a saved theme (available while any exist). `theme random` keeps the current mode (`is_dark`), sets `derive_theme(generate_theme({ ...DEFAULT_GENERATE, mode }))` and yields the five base colours. The `taskbar pin|unpin|list` commands live in AppsService's shell, since they need the registry ([apps](apps.md#shell)). See [shell](shell.md#contributions).

## Known gaps

- ADR-015's non-colour settings (radius, shadow, animation, font, icons, sound, export/import) aren't built; deferred by the owner on 2026-10-13. Radius, shadows and easing are constants in `app.css`.
- No migration path. A future `version: 2` would discard v1 saves unless `parse_settings()` learns to migrate.
