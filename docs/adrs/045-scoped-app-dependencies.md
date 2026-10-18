# ADR-045: Scoped App Dependencies
**Date:** 2026-10-17
**Status:** Implemented

## Context

Every package sits in the root `package.json`, so a dependency one app needs becomes a dependency of the whole OS, survives the fork test (deleting `src/lib/apps/user`) and can be imported by core by accident. The roadmap carries "Scoped app dependencies" for this. SVG Workbench is the first app that needs a package (SVGO), which the owner accepted on the condition that it's scoped to the app ([brainstorm](../brainstorm/2026-10-17_app-wave-7.md)).

## Decision

- **Bun workspaces.** The root `package.json` lists `"workspaces": ["src/lib/apps/*/*"]`. An app that needs a package gets its own `package.json` (`{ "name": "@webos/<id>", "private": true, "dependencies": { … } }`); apps without dependencies have none.
- **Isolated linker.** `bunfig.toml` sets `[install] linker = "isolated"`, so a package resolves only from the workspace that declares it: core and other apps can't import it.
- **Boot budget.** An app's packages are imported only from its lazy code, never from its manifest (`index.ts`); the boot budget gate (`bun run budget`) catches a slip.
- **Install.** `bun install` at the root installs every workspace; CI stays as is.

## Alternatives Considered

- **Hoisted workspaces plus a lint rule:** simpler install, but isolation rests on a rule instead of resolution.
- **Root `package.json`:** no setup, but the roadmap item stays open and the fork test carries every app's packages.
- **Vendoring the package's source:** no install step, but updates are manual and the code is ours to maintain.

## Consequences

- Removing an app's folder removes its dependencies with it.
- Tooling that assumes a hoisted `node_modules` (svelte-check, Vitest, Vite) has to work with the isolated layout; if it doesn't, fall back to the hoisted linker and record a revision note here.
- The first scoped package is `svgo` in SVG Workbench, loaded from `svgo/browser` on demand.

## Revision 2026-10-17: app-only packages moved

The isolated linker works with svelte-check, Vitest (both projects) and Vite as is; no fallback was needed. Packages that only apps imported left the root `package.json`:

| Package | Now declared by |
|---------|-----------------|
| `@codemirror/merge` | `user/diff` |
| `pdf-lib`, `pdfjs-dist` | `user/pdf-tools` |
| `marked` | `system/text-editor`, `user/markdown-pdf` |
| `svgo`, `@codemirror/merge` | `user/svg-workbench` (new) |

- Image Tools' Poster Print uses pdf-lib through PDF Tools' `pdf.ts` (`pdf_lib()` and re-exported types) instead of declaring it. A cross-app import resolves the package from the file that imports it, so another app's module carries its own packages.
- Root keeps what core imports: `codemirror` and the other `@codemirror/*`, `@lezer/highlight`, `uqr`, `jsqr`, `uuid`, `zod`, `@lilbunnyrabbit/task-manager`. `@lilbunnyrabbit/utils` was imported nowhere and was removed on 2026-10-18.
- Moving a package out of the root leaves its old link in `node_modules` on an incremental `bun install`, so a stray import still resolves locally. `rm -rf node_modules && bun install` shows the real layout; CI always installs fresh.
