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
