# Lazy app metadata

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

`src/lib/apps/index.ts` discovers manifests with an eager glob, so every `index.ts` and what it imports sits in the boot chunk. The entry was 168.0 / 190 KB gz. Measured from a sourcemap build: manifests ~23.8 KB gz, code they import ~11 KB (icons, badges, props modules). Roadmap option (a), lazy `shell`, already shipped in 2.0.0 (`842e859`): 39 apps use `shell: () => import("./commands")`, 38 have no shell, so the "~10 KB of shell" estimate on the roadmap was stale.

What boot never needs, measured on source text: `pitch` ~4.8 KB gz, `keywords` ~3.4, `description` ~1.7, together ~9.5. `props` schemas are ~0.7 KB on their own, but Algorithms' `z.enum(ALGORITHM_IDS)` pulls its 4.1 KB catalog into boot.

Sync readers of the text: launcher search (`apps/search.ts`), the `apps` command (`apps/shell.ts`), App Library and Showcase, the new-app announcement, and the first-boot intro dialog.

Earlier: [lazy shell commands](../ROADMAP.md) (P4 › Performance), [app showcase](./2026-10-18_app-showcase.md) (added `pitch`).

## Topics and decisions

1. **Scope.** Options: lazy text meta; outliers only; lazy text + props; build-step registry. **Decided: lazy text meta.** `description`, `keywords`, `pitch` and `authors` move to a per-app `meta.ts`, loaded through `meta: () => import("./meta")`. `props` stays eager, so launch validation, the router, widgets, session restore and deep links don't change.
2. **Loading.** **Idle prefetch:** AppsService loads every meta in `requestIdleCallback` after first paint; readers await one shared promise. Rejected: load on first need (first launcher keystroke could miss keyword matches).
3. **Chunks.** **One shared `app-meta` chunk** through Vite `manualChunks`: one request instead of 77, and better compression than 77 tiny files.
4. **Intro and announcements.** **Await meta before opening.** They already wait for the Restore answer, so the delay is near zero and there's no text pop-in.
5. **Shell.** **`apps` / `apps info` await meta** before yielding description. Completion uses id and name only, unchanged. No new commands.
6. **Algorithms outlier.** **Fix regardless:** `section: z.string()`, and the app checks the id against its catalog on mount; an unknown id gets a toast and the first section.
7. **Stable API.** `description`, `keywords`, `pitch` are stable manifest fields (app-api.md). Options: additive with the inline fields deprecated, or a hard break. **Decided: hard break, 3.0.0.** Same precedent as removing the eager shell form in 2.0.
8. **Authors.** **Into meta too.** Every display-only text field lives in one place.
9. **Shims.** **The `$lib/core/games*` and `$lib/core/utils/image` shims are removed in 3.0 as well** (ADR-048 kept them "until 3.0"). One major carries every pending break.

## Key takeaways

- The cheap win (lazy shell) was already taken; the remaining weight is display text and props imports.
- The per-app growth is text (`pitch` especially), so moving text scales; props stay eager to keep every launch path sync.
- A stable-surface change means a major, even when the motive is internal perf.

## Action items

- [x] ADR-049, revising ADR-008 and ADR-034 (and closing ADR-048's shims).
- [x] Implement: `AppMeta` type, `meta` field, `meta.ts` for all apps, AppsService `meta_ready` + `meta(id)`, readers await, `manualChunks`, Algorithms props, shim removal, app-api.md + `app-api.test.ts`, manifest.md, writing-an-app.md, changelog 3.0.0.
- [x] Re-measure the budget after: entry chunk 168.2 → 154.4 KB gz (~9.9 KB from the text, ~4 KB from Algorithms' catalog), `app-meta` chunk 36.6 KB raw.

## Next session topics

- Lazy `props` if the budget gets tight again (rejected for now: every launch path goes async).

## Follow-up (after 3.0.0 shipped)

1. **Merge helper.** The internal `apps/meta.ts` (`load_metas`, `with_meta`) is replaced. **Decided: AppsService owns listings.** It keeps the loaded metas in reactive state and exposes a derived `listings()` (manifest + meta merged). Readers drop the helper.
2. **`meta_ready` / `meta(id)`:** stay internal (only Game Hub uses them; promoting later is a minor).
3. **`author`, `license`, `repository`:** stable, unset, unread. **Deprecated now** (`@deprecated` + app-api.md), removed in 4.0.
4. **Bugs from the docs pass, all fixed next:** solo tab back, Activity Monitor `section` optional, paste caught under an open sheet (Forms, Image Tools), Showcase overline colour.
