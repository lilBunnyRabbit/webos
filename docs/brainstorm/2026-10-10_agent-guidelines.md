# Agent Guidelines & Project Principles
**Date:** 2026-10-10
**Participants:** @lilbunnyrabbit, Claude

## Context

The owner doesn't have time to write the code by hand anymore. Agents will write most of it, but they have to follow the owner's patterns and way of thinking. The project's value has always been the technical decisions more than the end product. Knowledge was scattered across 17 ADRs, 12 brainstorms, a stale README, a stale `.cursorrules`, and legacy AI-written specs in `docs/to-be-deleted/`.

## What was read

- All ADRs, brainstorms, ROADMAP, CLAUDE.md, README, `.cursorrules`.
- The current code: kernel, every service, window, desktop and file components.
- The owner's own turns in the five Cursor chat exports, plus the legacy TODO and IDEAS files.

## Findings

### Values that recur, with evidence

- **Infrastructure earns its place.** The kernel was questioned as a *"gimmic"*. Capabilities, router, PlatformService and IPC were all cut or deferred.
- **Lightest fit.** Polling over SW/SSE, localStorage over IndexedDB, flat commands, CSS animations.
- **Explicit over magic.** Explicit component import, no manifest lifecycle callbacks.
- **Correct over clever.** The ADR-005 handler cache was reverted.
- **Performance by structure.** React was left because of re-render cascades.
- **Feel counts.** *"feels shitty"*, *"feels cheaty"*.
- **Taste is a valid reason.** snake_case and *"I will never destructure"*.
- **Working style:** asks for mechanisms not benefits, explores options, expects every part of a question answered, rejects AI slop (*"Fix all AI shit"*).

### Drift found

| Where | Problem | Fix |
|-------|---------|-----|
| README.md | Described capabilities, IPC, npm, `src/apps/`, and linked deleted docs | Rewritten |
| `.cursorrules` | Claimed capability-based security, phosphor-first icons | Now points to CLAUDE.md |
| CLAUDE.md | Said file names are snake_case (they're kebab-case), service table missing Version, stale session/ADR lists, referenced `/_old/` (doesn't exist, React is on `master`) | Rewritten |
| ROADMAP | Marked SvelteMap cross-instance sync `[x]` though ADR-005 says it was removed | Unchecked, with a note |
| ADR index | Listed only ADR-001 | Full index with implemented vs accepted |
| ADR-002/003 | camelCase snippets | Noted in index. Rewrite is an open question |
| Code | camelCase leftovers (`windowId`, `Order.toFront`, …), hardcoded red colours, two icon libraries | Listed in CONVENTIONS as known drift |

## Decisions

1. **Three docs, three jobs.** No new folder, no doc-per-topic sprawl.
   - `docs/PRINCIPLES.md`: why and how decisions are made.
   - `docs/CONVENTIONS.md`: how code is written.
   - `CLAUDE.md`: the agent entry point, hard rules, when to ask, documentation duties.
2. **Code is ground truth for conventions.** Where docs and code disagreed, the docs were corrected. The newest area (files, ADR-005) sets the pattern for new code.
3. **ADR status split.** "Accepted" means designed, and "Implemented" means it's in the code. This matters because most ADRs were designed ahead of the code.
4. **Implementing an ADR has rules:**
   - re-check it against the code first
   - record deviations as a dated revision note
   - raise uncovered structural choices instead of deciding them silently
5. **`.cursorrules` and README don't hold rules.** They point to the source of truth.
6. `docs/to-be-deleted/` is marked reference-only. The owner's quotes that still matter now live in PRINCIPLES.

7. **Architecture is the owner's call, always** (added by the owner later in the session). Agents never make broad architectural decisions that aren't already in the guides. They:
   - stop before the first edit
   - present options
   - recommend one and attack their own recommendation
   - grill the owner with hard questions
   - record the outcome as a brainstorm or ADR before implementing

   Simple component work inside existing patterns is exempt. When in doubt, treat it as architectural. The rule lives in CLAUDE.md.

## Owner decisions (later in session)

| Question | Decision | Applied |
|----------|----------|---------|
| Icon library | Phosphor only | Lucide removed, all icons migrated with `NameIcon` aliases. Fixed `className=` on phosphor icons, which was silently ignored |
| Naming | snake_case everywhere | Code and ADR snippets renamed, including `defineApp` → `define_app` and `windowId` → `window_id`. Exception: `version.json` `buildTime`/`buildTimestamp`, because renaming breaks update detection for clients on the previous build |
| ADR-002 lifecycle | One go if simple | Recorded. Not implemented yet |
| Legacy docs | Delete if no value | Deleted |

## Open questions at time of writing (now answered above)

- Keep both icon libraries (`@lucide/svelte`, `phosphor-svelte`) or pick one?
- Rewrite camelCase snippets in ADR-002 and ADR-003, or leave them as historical?
- Implement ADR-002 lifecycle in the kernel in one go, or incrementally?

## Action items

- [x] Write PRINCIPLES.md, CONVENTIONS.md
- [x] Rewrite CLAUDE.md, README.md, `.cursorrules`
- [x] Full ADR index, fix ROADMAP sync entry
- [ ] Owner review: correct anything in PRINCIPLES that misreads intent
- [ ] Resume the files service / OPFS / file explorer review against the new guidelines
- [x] Deleted `docs/to-be-deleted/`. Its value was already preserved: owner quotes are in PRINCIPLES, ideas are in the legacy gap analysis, and the four idea-only items are now in ROADMAP "Unscheduled Ideas". It's recoverable at `6be283e:docs/to-be-deleted/`.

## Next session topics

- Files service review: multi-window sync via event-based invalidation
- ADR-002 lifecycle implementation plan
