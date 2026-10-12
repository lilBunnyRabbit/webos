# Brainstorm: Roadmap order

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

The roadmap had grown by priority bands (P0–P4) with no order inside them, and several items were stale. The owner asked to look at the whole roadmap and every open ADR and agree on what comes next, in order. It started from ADR-014 single-instance apps, which the owner questioned.

## Topics discussed

### Single-instance apps (ADR-014)

The owner asked: "Why would we need the single instance apps?"

Nothing breaks without them. Settings is one shared reactive store, and per-window state ([2026-10-11 window state](2026-10-11_window-state.md)) made two Settings windows behave correctly. The only unasked-for duplicate comes from the update toast's "What's new" action. Doing it properly needs a manifest flag, a relaunch path for props (focus-only breaks "What's new"; replacing props misses identical repeats, so a `window.on_relaunch` hook) and a restore check: three API changes for a convention.

**Decision:** parked. ADR-014 revision.

### Stale roadmap items

All of these were already done or no longer applied:

- window overlays and the desktop context menu (ADR-025)
- multi-window sync ([explorer sync](2026-10-12_explorer-sync.md))
- the settings storage line (now `/etc`)
- the service worker (VitePWA)
- the reason `kernel.swap` was deferred

All were corrected.

### Order

The open work was grouped by what it unlocks:

- Shortcuts unlocks four features.
- The notification center and tray give tasks a home.
- Tasks feed the tray and Activity Monitor.
- The command palette needs both shortcuts and the shell.

**Testing:** first, as its own block (owner). Services got subtle (session, revisions, DirectoryHandler), and tests lock that down before more is built on top. Cost: one block with nothing user-visible.

**Mobile:** only the interface split early (owner): platform detection and `IWindowsService` extraction in the foundations block, the mobile shell last. Rationale: every window feature added before the split grows what has to be split. Against: an interface with one implementation for a while.

Agreed order is in [ROADMAP → Order](../ROADMAP.md#order).

## Key takeaways

- The February ADRs predate the Svelte rewrite; re-check each against the code when its block starts (ADR-014 already was out of date).
- Small apps go between infra blocks as visible releases.
- Parked: single-instance, `get_state` / `kernel.swap`, AppDataHandle, WindowHandle status bar, theme sharing via URL, app store, Shadow DOM isolation.

## Action items

- [x] ROADMAP: Order section, stale items fixed, parked list
- [x] ADR-014 revision: single-instance parked
- [ ] Block 1: testing strategy brainstorm

## Next session topics

- Testing strategy: what to test, OPFS outside a browser, runner, CI.
