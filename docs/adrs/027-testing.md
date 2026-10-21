# ADR-027: Testing
**Date:** 2026-10-12
**Status:** Implemented (2026-10-12)

> **Revision 2026-10-12: service tests** (owner)
> - `kernel/test-kernel.ts`: `boot_test_kernel(services)` fills a real `Kernel`'s public `services` map with real service classes, constructed and initialised in the order the test lists. No Kernel API change. `stub_service(name, members)` stands in for a service that only resolves through UI (dialogs).
> - Rejected: `init({ only })` on the Kernel (an API change only for tests) and a full boot (polling, dialogs and a mounted shell). Cost: the test writes the order by hand, so a broken dependency graph isn't caught here; every page load still boots the real graph.
> - The helper imports `Kernel` through the `$lib/core/api` barrel. Importing `kernel.svelte` directly starts the service graph mid-cycle (`Cannot access 'Kernel' before initialization`).
> - The browser project pre-bundles zod, phosphor-svelte, uuid, tailwind-merge and tailwind-variants (`optimizeDeps.include`); found mid-run, Vite reloads the test page.

> **Revision 2026-10-19: async test shutdown** (owner, [brainstorm](../brainstorm/2026-10-19_test-kernel-shutdown.md))
> - `IService.destroy?()` may return a promise. `boot_test_kernel().shutdown()` is async and awaits each service's `destroy()`; ShellService's returns its pending history save. The production kernel still doesn't await.
> - Replaces the `vi.waitFor` retry around `clear_opfs()` in the shell tests and the `shell.remember` stub in the mounts tests.

> **Revision 2026-10-21: core browser tests in CI's fork job** (owner, [brainstorm](../brainstorm/2026-10-21_health-pass.md))
> - The `fork` job (user apps deleted) installs Playwright Chromium and runs the browser tests under `src/lib/core`, `src/lib/kit` and `src/lib/apps/system`. The `deploy` job still runs unit tests only.
> - Core tests never launch a real user app: `TestAppsService` (`services/apps/test-apps.ts`) drops the user apps and registers stand-ins (`example` with props, `board` with a widget, `notes` with shell commands, `game`). The version tests mock `./changelog` with a fixture.

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
- Browser tests outside core, kit and system apps run only locally; a push can break them without CI noticing.
- Three dev dependencies and a local Chromium download.
- Service tests build a real Kernel by hand (`boot_test_kernel`); see the revision note.
