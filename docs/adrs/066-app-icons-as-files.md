# ADR-066: App Icons as Files
**Date:** 2026-10-22
**Status:** Reverted (2026-10-24)

> **Revision 2026-10-24: reverted.** Owner: "the skeletons we have for icons. lets drop this idea and bring back the manifest loading in the initial load", "this load shouldn't take ages its just text and icons". The code of 3.59 was reverted in 3.61: `icon.svelte` components in the manifest again, `ai_icon` back, `AppIcon` and the offline icon sync gone. `app-boot` 6.9 → 13.7 KB gz; the boot budget went to 215 KB gz with ADR-049's revision of the same day. The scale rule (boot must not grow with the app count) gives way here: icons and listing text are small per app. Discussion: [2026-10-22_app-registry-scale](../brainstorm/2026-10-22_app-registry-scale.md#revisited-2026-10-24-reverted).

> **Revision 2026-10-22: implementation.**
> - **Colour layers.** 25 of the 94 icons draw an accent in `primary` (one in `secondary`), and the AI sparkle is `primary`. One mask in `currentColor` would have turned all of them monochrome, and a `var()` doesn't resolve inside an image anyway. The owner picked layered masks: `AppIcon` draws `icon.svg` in `currentColor`, `icon.svg#primary` in `--primary` and `icon.svg#secondary` in `--secondary`. Every file carries `<view id="primary"/><view id="secondary"/>` and one `:target` style rule, and marks its accent `class="primary"` or `class="secondary"`, colour written as `currentColor`. One request per file whatever the fragment; no JS per icon. Rejected: one monochrome mask (accents lost), fetching the SVG text and inlining it (JS per icon). `src/lib/apps/icons.test.ts` checks the convention. Before and after rendered within 7/255 per channel for all 94 at 16 and 48 px.
> - **Renderer.** `AppIcon` in the UI kit (Game Hub draws other apps' icons too), a stable export from 3.59. An `Image` probe on the same URL decides the placeholder: a drawn icon is in the memory cache and `complete` at once, so later draws don't flash. `app_icon(src)` (`ui/app-icon.ts`) wraps it for slots that take an icon component (`MenuItem`, `EmptyState`), keeping `MenuItem`'s type.
> - **Offline.** The build maps each user app's icon module to its file through Vite's asset placeholder, keeps it out of `core.json` and lists it with the app; `svg` joined the precache glob for the system apps' icons. `save_icons` runs at the start of every sync, quietly, not as part of the task.
> - **Version.** Changing a stable field's type is a major by app-api.md's semver rule. Shipped in 3.59.0 as a recorded exception, with the migration in app-api.md.
> - Measured: `app-boot` 13.6 → 6.9 KB gz, boot 189.0 → 182.0 KB gz; a fresh desktop boot fetches 4 icons (the 4 drawn).

## Context
Every app's icon is a Svelte component compiled into `app-boot`, which loads at boot: 94 icons, most of its 13.5 KB gz, growing with every app, though most are never drawn in a session. The scale rule from ADR-065 says boot must not grow with the app count. Manifests themselves stay eager (owner: "the manifest is fine to load"). Discussion: [2026-10-22_app-registry-scale](../brainstorm/2026-10-22_app-registry-scale.md).

## Decision
- **Icon files.** Each app's `icon.svelte` becomes `icon.svg` (same artwork, `currentColor`). `define_app`'s `icon` is a URL string: `import icon from "./icon.svg?no-inline"`, so it's never inlined as a data URI.
- **One renderer.** A shared app-icon component draws `<span>` with `mask: url(icon) center / contain no-repeat` and `background: currentColor`, at the size and colour every current call site uses. A skeleton square (theme tokens) shows until the image has loaded. Every place that renders `manifest.icon` uses it.
- **AI sparkle.** Baked into the four AI apps' SVG files. `ai_icon()` goes if nothing else uses it.
- **Offline.** OfflineService's sync (ADR-065) also fetches the icon of every installed app. Until then, offline tiles show the skeleton.
- **Stable API.** `icon` changes from `Component` to `string`; `app-api.test.ts` and the app API docs change with it.

## Alternatives Considered
- **Installed-only boot with a sharded catalog:** scales fully, but too much machinery for the gain; the owner pulled back.
- **Lazy Svelte icon** (`icon: () => import("./icon.svelte")`): a JS module per icon, and logic nobody uses.
- **Keep as is and set a budget:** cheap now, grows with each app.
- **An icon object `{ url, ai }` or a manifest `ai` flag:** API for one badge.

## Consequences
- `app-boot` loses the icons; an icon costs nothing until drawn.
- Tiles show a skeleton briefly the first time an icon is drawn.
- Icon markup can't use Svelte props anymore; the taskbar's `weight` switch no longer reaches app icons (they already ignored it).
- The AI sparkle is copied into four SVGs.
