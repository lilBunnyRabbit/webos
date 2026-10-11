# Brainstorm: File Explorer sync

**Date:** 2026-10-12
**Participants:** owner, agent

## Context

`962dd9c` made File Explorer watch `files.revision(handler.path)` (ADR-021) from `file-explorer.svelte` and reload. The owner pushed back: it wasn't thought through. Three gaps:

1. **Double listing.** Freshness had two owners: `DirectoryHandler`'s mutations reloaded directly, and the explorer's watcher reloaded again on the bump.
2. **Gone folder unnoticed.** Deleting or moving a folder bumps its *parent* (`changed(parent)`), so an explorer showing that folder never wakes up.
3. **Other tabs.** Revisions are per tab, in memory.

## Topics discussed

### Who owns freshness

- Revision-aware reload in the handler, watcher stays in the explorer (agent's pick: private fields only).
- **Handler watches itself** (chosen): `DirectoryHandler` runs its own `$effect.root` on its revision and gets `dispose()`.
- Watcher only: drop the handler's direct reloads. Rejected: mutations would resolve before the list is fresh.

Owner: "encapsulate the freshness logic in the handler".

Implementation: the handler's watcher and its mutations both call `reload()`, which joins a listing already in flight for the same revision instead of starting another. Mutations still await a fresh list, and no path depends on the effect firing (a `changed()` that can't resolve a path bumps nothing). Handlers in Back history keep watching, so Back no longer reloads by hand. The explorer disposes every handler it holds when it unmounts.

### Gone folder

- **Jump to nearest existing ancestor + info toast** (chosen).
- Empty state with Go up.
- Leave it.

Detection lives in the handler too: it watches every ancestor's revision (a deleted grandparent bumps only the great-grandparent), and on a bump checks `get_directory(path)` + `isSameEntry`. `exists` is reactive state on the handler. The explorer reacts, and Back skips gone folders.

### Other tabs

Separate brainstorm. `FileSystemObserver` exists in the owner's Chrome 154 but froze the tab in the agent's probe (`observe()` on the OPFS root never returned control). BroadcastChannel relay is the other candidate.

## Key takeaways

- Freshness is the handler's job; the explorer only reacts to `exists`.
- `DirectoryHandler` gains a lifecycle (`dispose()`); whoever creates one disposes it.

## Action items

- [x] Handler-owned watching, coalesced reload, `exists`, `dispose()`
- [x] Explorer: jump to nearest ancestor with a toast, Back skips gone folders, dispose on unmount
- [ ] Cross-tab sync brainstorm (ROADMAP)

## Next session topics

- Cross-tab file sync: FileSystemObserver vs BroadcastChannel.
