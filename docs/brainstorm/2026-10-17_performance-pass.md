# Brainstorm: Performance pass

**Date:** 2026-10-17
**Participants:** owner, agent

## Context

After 1.15–1.17 the owner asked for a sweep for unnecessary logic and re-renders. Three read-only audits (core services, shell UI, apps), measured with Playwright + CDP in headless Chromium against the dev build.

Already fine: idle desktop runs nothing; no app ticks while minimized (44 apps checked); dragging a window touches only that window; game loops pause when hidden; puzzle boards are `$state.raw`; every `{#each}` keyed; manifests lean; no leaks across open/close; drag writes the session once on pointerup.

## Topics discussed

### Save timing

Every focus click, calculator key and theme slider step rewrote the whole `session.json` / `settings.json`; each write walked the path twice per segment.

- **Debounce in `LatestWriter`** (chosen): optional `delay`, 300 ms for session, settings and app `storage.file`; pending text flushed at once on `visibilitychange` → hidden and `pagehide`. A crash within 300 ms loses that change.
- Session only; keep as is: rejected.

Local fixes alongside: cache the parent folder handle (re-walk on `NotFoundError`), skip identical text, seed with the loaded text so boot doesn't rewrite unchanged files.

### View transitions

All windows carried `window-{id}`, so every minimize/maximize snapshotted all of them: ~50 ms frames with 10 windows. Measured 67 → 33 ms max frame with only the moving window named.

- **Focused window only** (chosen), plus the target window gets its name just before a transition that acts on an unfocused one (shell `win min`, Show desktop), so it still flies. Never on minimized or popped-out windows.
- Name on demand via `view_transition(fn, { name })`; keep all: rejected.
- Element-scoped `element.startViewTransition()` noted for later.

### Covered widgets

~3 ms/s for 5 widgets under a maximized window. **Leave it**: an occlusion signal would be a new core mechanism for no visible gain.

### Command failures shown twice

PDF Tools / Archive commands print the reason in the terminal and the job toast offers Retry. **Keep both**: by design.

## Action items

- [ ] Core + shell fixes (writer, settings probe, json_file handle, job progress throttle, Explorer history, raw state, transition names, Terminal button, drag frame id, window.svelte cleanup, resize handle clipped by the corner)
- [ ] App fixes (Lunar Lander readouts, Minesweeper cells, Recorder meter, Pomodoro stats, Time Since tick, PersistedCell first run, Quick Notes badge guard, Kanban day tick, Hopsprite writable derived)
- [ ] docs/system updates, ROADMAP, release

## Next session topics

- Element-scoped view transitions
- Cross-tab file sync (FileSystemObserver probe passed 2026-10-16)
