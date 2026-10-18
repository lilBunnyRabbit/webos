# ADR-049: Lazy App Metadata
**Date:** 2026-10-18
**Status:** Accepted

## Context

App discovery is an eager glob (`src/lib/apps/index.ts`), so every manifest and what it imports is in the boot chunk (168 / 190 KB gz on 2026-10-18; manifests ~24 KB gz plus ~11 KB of code they import). Shell commands are already lazy (ADR-034, revised 2026-10-17). The rest boot never reads is display text: `description`, `keywords`, `pitch`, `authors`, ~9.5 KB gz and growing with every app's pitch. Algorithms' props enum pulls its 4 KB catalog into boot.

Discussion: [brainstorm](../brainstorm/2026-10-18_lazy-app-metadata.md).

## Decision

- **`meta` manifest field.** `define_app({ meta: () => import("./meta") })`; `meta.ts` default-exports an `AppMeta`:
  ```ts
  export interface AppMeta {
    description?: string;
    keywords?: string[];
    pitch?: AppPitch;
    authors?: AppAuthor[];
  }
  ```
  The inline `description`, `keywords`, `pitch` and `authors` fields are removed from `AppConfig` / `AppManifest`.
- **`props` stays eager** (ADR-008 unchanged): `launch()` validation, router, widgets, session restore and deep links stay sync.
- **AppsService loads all metas once,** in `requestIdleCallback` after first paint, into a map; `meta_ready` is the shared promise, `meta(id)` resolves an app's `AppMeta` (`{}` without one). Static per app, so two windows, mobile and solo all share it.
- **One chunk.** Vite `manualChunks` puts every `apps/*/*/meta.ts` into `app-meta`.
- **Readers await:** launcher search, App Library and Showcase, the `apps` command, the new-app announcement and the first-boot intro (both open after `meta_ready`). Completion uses id and name only.
- **Algorithms:** `section` becomes `z.string()`; the app checks it against its catalog on mount, unknown ids get a toast and fall back to the first section.
- **3.0.0.** Removing stable manifest fields is a major (app-api.md). The `$lib/core/games*` and `$lib/core/utils/image` shims left by ADR-048 are removed in the same release.
- **Shell:** no new commands. `apps` / `apps info` await `meta_ready`.

## Alternatives Considered

- **Outliers only** (~5 KB, no shape change): kicks the can; every new pitch still lands on boot.
- **Lazy text + props** (~14–15 KB): every launch path goes async (launch, router, widgets, restore).
- **Build-step registry:** same saving as text + props, custom Vite plugin to maintain.
- **Additive, inline fields deprecated until 3.0:** no break, but two paths and a merge in AppsService. Owner chose the clean break.
- **Load on first need:** first launcher keystroke could miss keyword matches.
- **Per-app chunks:** 77 requests, worse compression.

## Consequences

- ~9.5 KB gz off boot now, plus ~4 KB from Algorithms; new apps' text never lands on boot.
- Every app has a second file (`meta.ts`); writing-an-app.md and the manifest page say so.
- A major release for an internal perf change. External forks must move four fields.
- Revises ADR-008 (props stay eager, Algorithms validates `section` in-app) and ADR-034 (manifest shape); closes ADR-048's shim period.
