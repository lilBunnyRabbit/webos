# ADR-027: Testing
**Date:** 2026-10-12
**Status:** Implemented (2026-10-12)

## Context

There were no tests. Services grew subtle: session restore, directory revisions, DirectoryHandler's coalesced reloads. Refactors relied on manual browser checks. The riskiest layer, OPFS, exists only in a real browser, and the bugs so far were browser behaviour that a fake wouldn't reproduce. Brainstorm: [2026-10-12 Testing strategy](../brainstorm/2026-10-12_testing-strategy.md).

## Decision

**Runner: Vitest, two projects in `vite.config.ts`:**

| Project | Files | Environment | For |
|---------|-------|-------------|-----|
| `unit` | `src/**/*.test.ts` | Node | Pure `.ts`, and `.svelte.ts` that touches no browser API |
| `browser` | `src/**/*.browser.test.ts` | Chromium through `@vitest/browser-playwright`, headless | OPFS, FilesService, DirectoryHandler, services that need the platform |

- Both extend the app's Vite config, so `$lib` and the Svelte plugin (runes) work as in the app.
- Test files sit next to their source.
- Browser tests clear the OPFS root before each case. They run on the Vitest server's origin, so they never see the owner's data.

**Scope:** pure `.ts`, OPFS + FilesService, services through a real kernel. No component tests.

**Scripts:** `bun run test` runs both projects. `bun run test:unit` runs Node only.

**CI:** `deploy.yml` runs `bun run test:unit` after `check` and before `build`. Red unit tests block the deploy. No Playwright in CI for now (owner).

**Dependencies:** `vitest`, `@vitest/browser-playwright`, `playwright` (dev). Pinned to releases at least two weeks old when added.

## Alternatives Considered

1. **`bun test` + fake OPFS.** Zero dependencies, fast. Rejected: the fake would need to match `resolve`, `isSameEntry` and move semantics exactly, which is where real bugs were; a custom rune-compiling preload to maintain.
2. **Vitest Node only.** One dependency. Rejected: OPFS stays manual.
3. **Component tests with `@testing-library/svelte`.** Rejected for now: UI churns most and has had the fewest bugs.
4. **Playwright in CI.** Deferred: adds a Chromium install to every push.

## Consequences

### Positive
- OPFS behaviour is tested against the real implementation.
- Unit tests gate every deploy.

### Negative
- Browser tests run only locally; a push can break them without CI noticing.
- Three dev dependencies and a local Chromium download.
- Service tests still need a test-kernel helper, designed when the first one is written.
