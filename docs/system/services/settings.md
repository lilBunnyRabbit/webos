# SettingsService

Key `settings` · Depends on: none · ADR: [ADR-002](../../adrs/002-service-lifecycle.md) (persistence), [ADR-015](../../adrs/015-customization-theming.md) (theming), [ADR-018](../../adrs/018-file-associations.md) (`file_defaults`) · Source: `src/lib/core/api/services/settings/`

| File | Contents |
|------|----------|
| `type.ts` | `SettingsService` interface, `Taskbar`, `TaskbarPosition`, `Theme`, `ThemeToken`, `ThemeBase`, `FileDefaults` |
| `service.svelte.ts` | The class |
| `persistence.ts` | `load_settings()` / `save_settings()`, `SETTINGS_VERSION`, sanitizing |
| `themes.ts` | `BRAND_DARK`, `BRAND_LIGHT`, `derive_theme()`, `THEME_PRESETS`, `ThemePreset` |

`index.ts` exports `type.ts` and `themes.ts`. `persistence.ts` stays private to the service.

## Purpose

Owns the user's persisted OS preferences: theme colour tokens, taskbar position, and per-extension default apps. It writes the theme onto `<html>` as CSS variables and saves everything to localStorage when anything changes.

## Public API

The API is three plain reactive fields. There are no setter methods. Consumers assign to them directly.

| Member | Signature | Notes |
|--------|-----------|-------|
| `theme` | `theme: Theme` (`Record<ThemeToken, string>`) | 11 tokens. Replace it wholesale (`settings.theme = { ...settings.theme, primary: v }`) or mutate a key. Both trigger the effects, because it's deep `$state`. |
| `taskbar` | `taskbar: Taskbar` = `{ position: TaskbarPosition }` | Read by `os.svelte`, `taskbar.svelte`, `window-manager.svelte`. The Settings app mutates `taskbar.position`. |
| `file_defaults` | `file_defaults: FileDefaults` (`Record<".ext", AppId>`) | Written by AppsService when the user picks "Always use" in Open-with (`apps/service.svelte.ts:95`). Read by `apps.open()` (line 72). |
| `init` | `init(): void` | See Lifecycle. |
| `destroy` | `destroy(): void` | Disposes the effect root. |
| `to_string` | `to_string(): string` | Taskbar position plus the JSON of the theme. |
| `name` / `description` | `"SettingsService"` | |

Exports from `themes.ts`, re-exported through `$lib/core/api`:

| Export | Signature | Notes |
|--------|-----------|-------|
| `BRAND_DARK` | `Theme` | Default. All OKLCH literals. |
| `BRAND_LIGHT` | `Theme` | All OKLCH literals. |
| `derive_theme` | `(base: ThemeBase) => Theme` | Fills `tertiary`, `cottontail` and the four state tokens with relative-colour CSS that references `var(--primary)` / `var(--secondary)`. |
| `THEME_PRESETS` | `ThemePreset[]` (`{ name, theme }`) | Brand Dark, Brand Light, then 21 `derive_theme()` presets. All base colours are OKLCH. |
| `TaskbarPosition` | const enum `top \| bottom \| left \| right` | From `type.ts`. |

Token list and semantics: [theming.md](../theming.md).

## State

```ts
taskbar       = $state<Taskbar>({ position: "bottom" });
theme         = $state<Theme>({ ...BRAND_DARK });
file_defaults = $state<FileDefaults>({});
```

Nothing is derived inside the service. Consumers derive from it. For example, `os.svelte` derives `position`, and the `@theme` colours in CSS follow the variables.

## Lifecycle

`init()`, synchronous:

1. `load_settings()`. If it returns data, assign `theme`, `taskbar` and `file_defaults`.
2. Start an `$effect.root` with two effects:
   - **Token writer:** for each `[key, value]` of `theme`, call `document.documentElement.style.setProperty("--" + key, value)`.
   - **Saver:** call `save_settings({ version: 1, theme, taskbar, file_defaults })`. It tracks all three fields deeply, because `JSON.stringify` reads every property.

`destroy()` disposes the root. Nothing gets saved on destroy, because the saver has already run after every change.

Init can't fail. Load errors are caught and fall back to defaults.

## Persistence

| | |
|-|-|
| Store | `localStorage` |
| Key | `webos.settings` |
| Format | `{ "version": 1, "theme": Theme, "taskbar": { "position": … }, "file_defaults": { ".ext": "app-id" } }` |
| Version | `SETTINGS_VERSION = 1` |
| Written | On every change, after the effect flush. Also once right after `init()`, which normalizes the stored blob. |

Load and sanitize rules (`persistence.ts`):

- Missing key → `null` → in-memory defaults.
- JSON parse error → `console.error("Failed to load settings:")` → defaults.
- `version !== 1` → ignored, not migrated → defaults. The saver then overwrites the stored blob with defaults on the first flush.
- `theme`: starts from `BRAND_DARK` and copies over only known token keys whose value is a `string`. Unknown keys are dropped. Missing tokens get the Brand Dark value. **Values are not validated as CSS.** A garbage string gets written to the variable as-is.
- `taskbar.position`: must be one of `TaskbarPosition`, otherwise `bottom`.
- `file_defaults`: keeps entries whose key starts with `.` and whose value is a string. It's an additive field, so v1 blobs without it load as `{}`. The app id is not checked against the registry here. `apps.open()` deals with stale ids.
- Write errors (quota, disabled storage) → `console.error("Failed to save settings:")`.

## Behaviour & invariants

- The theme is applied before mount: the token effect runs on the first flush after `init()`. Until then, `index.html` and `body` use the hardcoded Brand Dark `#17252c`.
- Tokens are only ever set, never removed. A token missing from `theme` keeps its last value on `<html>`. That can't happen through the public flow, because load always fills all 11.
- Derived presets store strings like `oklch(from var(--primary) l 0.14 140)` as the token value. They resolve at use time in CSS, so editing `primary` live re-derives the states.
- No cross-tab sync. Two tabs each write their own state, and the last write wins on reload.
- The Settings app's "Reset Settings" (`settings.app.svelte:30`) resets `taskbar`, `theme` and `file_defaults`.

## Divergence from ADR

- ADR-002's revision note describes the stored blob as `{ version: 1, theme, taskbar }`. The code adds `file_defaults`, without a version bump (ADR-018; noted in `persistence.ts:49`).

## Known gaps

- ADR-015's non-colour settings (radius, shadow, animation, font, icons, sound, export/import) aren't built. `--radius` is a constant in `app.css`.
- No migration path. A future `version: 2` would discard v1 saves unless `load_settings()` learns to migrate.
- `ROADMAP.md` still lists "Theme persistence (blocked on ADR-002 lifecycle)" as open, but it's done.
