# Brainstorm: Testing strategy

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

Block 1 of the [agreed order](2026-10-12_roadmap-order.md). Nothing is tested. CONVENTIONS said "No test runner yet. When it lands: Vitest, pure `.ts` first."

Inventory:

- About 30 pure `.ts` modules (about 2,100 lines): parsers, helpers, semver, path, associations, layout and snap math.
- `opfs.ts` (394 lines), the riskiest code: moves, copies, auto-rename.
- 19 `.svelte.ts` files (about 3,000 lines) that need the Svelte compiler for runes.
- Bun 1.4.2 is the runtime. No test dependency is installed.

The core problem is that OPFS exists only in a real browser. The bugs so far were browser behaviour (`resolve()`, `isSameEntry`, move semantics, revision bumps), exactly where a fake OPFS would pass.

## Topics discussed

### Scope

Chosen:

- **Pure `.ts`**: cheap, fast, stable.
- **OPFS + FilesService**: `opfs.ts`, revisions, DirectoryHandler (coalesced reload, `exists`).
- **Services (runes)**: Session, Version, Notifications, Windows wired through a real kernel.

Rejected:

- **Components** (`@testing-library/svelte`): UI churns most, and it has had the fewest bugs so far.

### Runner

- **Vitest with two projects** (chosen): `*.test.ts` in Node, `*.browser.test.ts` in real Chromium through Playwright. Runes compile through the existing `vite.config` (`$lib`, svelte plugin).
- `bun test` with a preload that compiles runes and a fake OPFS. Zero dependencies, but the fake would have to mimic exactly the behaviour where bugs were, and the preload is plumbing to maintain.
- Vitest Node only. No OPFS tests, so the riskiest layer stays manual.

Dependencies approved by the owner: `vitest`, `@vitest/browser-playwright`, `playwright`.

### CI

The owner picked a deploy gate, with a note: "i wouldnt put playwright in the ci for now". So `deploy.yml` runs the Node project only (`bun run test:unit`) between check and build. Browser tests run locally (`bun run test`).

### Safety

Browser tests run on the Vitest server's own origin (its own port, not the dev server's 5173), so their OPFS is separate from the owner's WebOS data. Tests still clear the OPFS root before each case.

## Key takeaways

- Real Chromium for anything touching OPFS; no fake.
- Test files sit next to their source.
- CI gates on unit tests only for now.

## Action items

- [x] ADR-027
- [x] Vitest setup, scripts, CI step
- [x] First tests: pure helpers, opfs, FilesService revisions, DirectoryHandler
- [ ] Service tests through a real kernel: needs a test-kernel helper (shape decided when the first one is written)

## Next session topics

- The test-kernel helper for service tests.
- Playwright in CI, once the browser suite is stable.
