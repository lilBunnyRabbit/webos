# ADR-048: App Kit Layer
**Date:** 2026-10-18
**Status:** Implemented

## Context

`src/lib/core` held helpers only apps use: undo history, QR encode and scan, the EXIF reader, the CodeMirror setup with `CodeView`, the image helpers and the games kit. Core is what the OS itself runs on, and these blurred that line. Usage on 2026-10-18: `utils/history`, `qr`, `qr-scan`, `exif` and `components/code` had no core importer; `utils/image` only the app API test (38 app files); `games/*` one core import, `DailyRank` in `apps/type.ts` (56 app files). `utils/zip` backs File Explorer's Compress / Extract here and Backup. `app-api.test.ts` pinned `$lib/core/utils/image` and `$lib/core/games` as stable since 1.0.

Discussion: [brainstorm](../brainstorm/2026-10-18_app-kit-layer.md).

## Decision

- **`src/lib/kit`, imported as `$kit`.** The alias sits next to `$lib` in `vite.config.ts`, `tsconfig.json` and `tsconfig.app.json`. The tree mirrors core's: `$kit/utils/{history,qr,qr-scan.svelte,exif,image,image-format}`, `$kit/components/code`, `$kit/games`.
- **What moved:** history, qr, qr-scan, exif, components/code (with `CodeView`), image with image-format (only image and apps used it), games. Zip stays in core.
- **Core never imports `$kit`.** `src/lib/core/kit-boundary.test.ts` reads every core source and fails on an import of `$kit`, `$lib/kit` or a relative `../kit`. Its allow list is exactly the shims below and `app-api.test.ts`, which pins both paths. Apps import core and kit.
- **`DailyRank` lives in core.** The const and type moved to `core/api/services/apps/type.ts` beside `AppCategory`, because `AppConfig.daily_rank` needs it. `$kit/games/daily` (and the barrel) re-export it, so every import path keeps working.
- **Stable like core.** [app-api.md](../system/app-api.md) has a `$kit` section and `app-api.test.ts` pins the kit's stable exports. What was stable stays stable at the new path (the games kit, the image helpers); what was internal (history, qr, qr-scan, exif, code, image-format) stays internal. Promoting one is a minor, as before.
- **Old stable paths are shims until 3.0.** `$lib/core/games`, `games/time`, `games/daily`, `games/direction` and `$lib/core/utils/image` are one-line `export * from "$kit/…"` files. They are pinned by the same test. Removing them is the 3.0 break.
- **Packages stay in the root `package.json`.** The kit's CodeMirror, `uqr` and `jsqr` resolve from the root like core's packages (ADR-045 workspaces cover `src/lib/apps/*/*` only).
- **Shell:** nothing. The kit has no user-facing surface.

## Alternatives Considered

- **A workspace package (`@webos/kit`).** Package boundaries enforced by the linker, but build plumbing (its own `package.json`, exports map, TS project) for code that never leaves the repo.
- **`src/lib/apps/lib`.** No alias and it sits inside the apps tree, which blurs the fork test (delete `src/lib/apps/user`, core still builds).
- **Moving only what core doesn't use.** Leaves `image` and `games`, the two biggest app-only modules, in core.
- **Breaking the old paths now.** A 3.0 for a folder move. Shims cost five one-line files.

## Consequences

- Core's tree is what the OS runs on. The fork test is unchanged: deleting `src/lib/apps/user` leaves core and kit building.
- An app author imports from two roots, `$lib/core/…` and `$kit/…`. app-api.md says which one per module.
- `$lib/core/api` (through `services/apps/type`) now exports `DailyRank` too.
- A new app-only helper goes into `src/lib/kit`, not core (CONVENTIONS, Where code goes). A helper core needs later moves back to core with a kit shim, never a core → kit import.
- The shims and the allow-list entries go together at 3.0.
