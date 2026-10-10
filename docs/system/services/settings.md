# SettingsService

Key `settings` · Depends on: `files` · ADR: [ADR-002](../../adrs/002-service-lifecycle.md) (lifecycle), [ADR-021](../../adrs/021-file-system-hierarchy.md) (`/etc`), [ADR-015](../../adrs/015-customization-theming.md) (theming), [ADR-018](../../adrs/018-file-associations.md) (`file_defaults`) · Source: `src/lib/core/api/services/settings/` · Inspector: `inspector.svelte` (ADR-020)

| File | Contents |
|------|----------|
| `type.ts` | `SettingsService` interface, `Taskbar`, `TaskbarPosition`, `Theme`, `ThemeToken`, `ThemeBase`, `FileDefaults` |
| `service.svelte.ts` | The class |
| `persistence.ts` | `SETTINGS_PATH` (`/etc/settings.json`), `SETTINGS_VERSION`, `parse_settings()`, `serialize_settings()`, `take_legacy_settings()`, sanitizing |
| `themes.ts` | `BRAND_DARK`, `BRAND_LIGHT`, `derive_theme()`, `THEME_PRESETS`, `ThemePreset` |

`index.ts` exports `type.ts` and `themes.ts`. `persistence.ts` stays private to the service.

## Purpose

Owns the user's persisted OS preferences: theme colour tokens, taskbar position, and per-extension default apps. It writes the theme onto `<html>` as CSS variables and saves everything to `/etc/settings.json` when anything changes.

## Public API

The API is three plain reactive fields. There are no setter methods. Consumers assign to them directly.

| Member | Signature | Notes |
|--------|-----------|-------|
| `theme` | `theme: Theme` (`Record<ThemeToken, string>`) | 11 tokens. Replace it wholesale (`settings.theme = { ...settings.theme, primary: v }`) or mutate a key. Both trigger the effects, because it's deep `$state`. |
| `taskbar` | `taskbar: Taskbar` = `{ position: TaskbarPosition }` | Read by `os.svelte`, `taskbar.svelte`, `window-manager.svelte`. The Settings app mutates `taskbar.position`. |
| `file_defaults` | `file_defaults: FileDefaults` (`Record<".ext", AppId>`) | Written by AppsService when the user picks "Always use" in Open-with. Read by `apps.open()`. |
| `init` | `init(): Promise<void>` | See Lifecycle. |
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

Private: `files_service` (`$derived` in the constructor), `dispose_effects`, and `writer: LatestWriter` for `SETTINGS_PATH`.

Nothing is derived inside the service. Consumers derive from it. For example, `os.svelte` derives `position`, and the `@theme` colours in CSS follow the variables.

## Lifecycle

`init()`, async:

1. `files.get_file("/etc/settings.json")`.
2. `take_legacy_settings()`: read and **remove** the old localStorage key `webos.settings`. This runs on every boot, file or not, so a stale legacy copy can never come back later.
3. Use the file's `parse_settings()` result if the file exists, otherwise the legacy result. If that's non-null, assign `theme`, `taskbar` and `file_defaults`. A file that exists but doesn't parse means defaults, even when a legacy copy was there.
4. Start an `$effect.root` with two effects:
   - **Token writer:** for each `[key, value]` of `theme`, call `document.documentElement.style.setProperty("--" + key, value)`.
   - **Saver:** `writer.write(serialize_settings({ version: 1, theme, taskbar, file_defaults }))`. It tracks all three fields deeply, because `JSON.stringify` reads every property.

`destroy()` disposes the root. A write already queued still finishes. Nothing extra is saved on destroy, because the saver has already run after every change.

`get_file` throws only for unexpected OPFS errors (missing file → `null`); such an error rejects `init()` and fails the boot. Parse errors fall back to defaults.

## Persistence

| | |
|-|-|
| Store | OPFS, through FilesService |
| Path | `/etc/settings.json` (ADR-021: OS config lives in `/etc`) |
| Format | `{ "version": 1, "theme": Theme, "taskbar": { "position": … }, "file_defaults": { ".ext": "app-id" } }`, pretty-printed (2 spaces) |
| Version | `SETTINGS_VERSION = 1` |
| Written | On every change, after the effect flush. Also once right after `init()`, which creates or normalizes the file. |
| Legacy | localStorage `webos.settings` (same format). Imported once when `/etc/settings.json` doesn't exist, removed on every boot |

**Write queue.** The saver goes through `LatestWriter` (`files/latest-writer.ts`, shared with [session](session.md); see [files](files.md#latestwriter)): writes never overlap, and a burst of changes (typing in a token field) collapses to at most one write in flight plus the newest pending one. `/etc` is recreated if missing. Each write bumps the `/etc` revision.

Load and sanitize rules (`parse_settings` in `persistence.ts`):

- Missing file and no legacy key → `null` → in-memory defaults.
- JSON parse error → `console.error("Failed to load settings:")` → defaults.
- `version !== 1` → ignored, not migrated → defaults. The saver then overwrites the file with defaults on the first flush.
- `theme`: starts from `BRAND_DARK` and copies over only known token keys whose value is a `string`. Unknown keys are dropped. Missing tokens get the Brand Dark value. **Values are not validated as CSS.** A garbage string gets written to the variable as-is.
- `taskbar.position`: must be one of `TaskbarPosition`, otherwise `bottom`.
- `file_defaults`: keeps entries whose key starts with `.` and whose value is a string. It's an additive field, so v1 blobs without it load as `{}`. The app id is not checked against the registry here. `apps.open()` deals with stale ids.
- Write errors (quota, OPFS failure) → `console.error("Failed to save settings:")`; the writer moves on to the next queued text. A legacy-key read or remove that throws counts as no legacy copy.

## Behaviour & invariants

- The theme is applied before mount: the token effect runs on the first flush after `init()`. Until then, `index.html` and `body` use the hardcoded Brand Dark `#17252c`. Because `init()` now waits for FilesService's OPFS bootstrap and a file read, the splash covers that wait.
- Tokens are only ever set, never removed. A token missing from `theme` keeps its last value on `<html>`. That can't happen through the public flow, because load always fills all 11.
- Derived presets store strings like `oklch(from var(--primary) l 0.14 140)` as the token value. They resolve at use time in CSS, so editing `primary` live re-derives the states.
- No cross-tab sync, and none possible through `storage` events now that the store is OPFS. Two tabs each write their own state, and the last write wins on reload.
- The file isn't watched. Editing or deleting `/etc/settings.json` (File Explorer can delete it) takes effect on the next boot, and the next settings change in this tab overwrites it.
- The Settings app's "Reset Settings" (`settings.app.svelte:30`) resets `taskbar`, `theme` and `file_defaults`.

## Divergence from ADR

- ADR-002's revision note describes a localStorage blob `{ version: 1, theme, taskbar }`. The code stores it in `/etc/settings.json` (ADR-021, CONVENTIONS → Services) and adds `file_defaults` without a version bump (ADR-018; noted in `persistence.ts`).

## Known gaps

- ADR-015's non-colour settings (radius, shadow, animation, font, icons, sound, export/import) aren't built. `--radius` is a constant in `app.css`.
- No migration path. A future `version: 2` would discard v1 saves unless `parse_settings()` learns to migrate.
- `ROADMAP.md` still lists "Theme persistence (blocked on ADR-002 lifecycle)" as open, but it's done.
