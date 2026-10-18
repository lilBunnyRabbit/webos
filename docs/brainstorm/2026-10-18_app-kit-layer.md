# App kit layer

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

Roadmap P4: move app-only helpers out of core. Usage (2026-10-18): `utils/history`, `qr`, `qr-scan`, `exif`, `components/code` (with CodeView) have no core importers; `utils/image` only the app-api test (38 app files); `games/*` one core import (`apps/type.ts`, 56 app files); `utils/zip` backs Explorer (`file-actions.ts`) and Backup. Workspaces exist (ADR-045). `app-api.test.ts` pins `image` and `games` as stable for app authors since 1.0.

## Decisions

- **`src/lib/kit` with a `$kit` alias.** Core never imports `$kit` (enforced by a test); apps import both.
- **What moves:** history, qr, qr-scan, exif, components/code, image, games. Zip stays core. The `apps/type.ts` → games import is untangled by moving that type into core.
- **Stable like core.** `app-api.md` gets a `$kit` section, `app-api.test.ts` pins its exports. The old stable paths (`$lib/core/utils/image`, `$lib/core/games`, …) re-export from `$kit` until 3.0.
- **Shell:** nothing (no user-facing surface).
- Rejected: a workspace package (build plumbing for in-repo code), `src/lib/apps/lib` (no alias, blurs the fork test), moving only the unused-by-core set, breaking the old paths now.

## Action items

- [x] `src/lib/kit` with the `$kit` alias in `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`; layout mirrors core (`kit/utils/*`, `kit/components/code`, `kit/games`)
- [x] Moved with `git mv`: history, qr, qr-scan, exif, image and image-format (only image and apps used it), components/code, games; every app import points at `$kit`
- [x] `DailyRank` moved into `core/api/services/apps/type.ts`; `$kit/games/daily` re-exports it
- [x] `src/lib/core/kit-boundary.test.ts`: core may not import `$kit`, except the five shims and `app-api.test.ts`
- [x] Shims at `$lib/core/games` (+ `time`, `daily`, `direction`) and `$lib/core/utils/image`, until 3.0; `app-api.test.ts` pins both paths
- [x] [ADR-048](../adrs/048-app-kit-layer.md), app-api.md `$kit` section, CONVENTIONS, system reference pages, ROADMAP

## Next session topics

- Promotion: `history` and `qr` are used by three user apps each, which meets the utilities rule for stable; they stayed internal in the move. Owner's call whether to promote (a minor).
