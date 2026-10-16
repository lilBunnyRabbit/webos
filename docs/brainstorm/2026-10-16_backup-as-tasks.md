# Backup as tasks

**Date:** 2026-10-16
**Participants:** owner, agent

## Context

BackupService (ADR-037) zipped and restored without TasksService, so a big backup showed a spinner in Settings and nothing else: no progress, no Cancel, no Activity Monitor row. The owner added "backup as a task" to the roadmap and picked it up next. Restore was the hard part: it wipes an area and then writes it, so a Cancel halfway would leave the area half restored.

## Topics discussed

### Create: task tree
- Options: a task per area plus a save step; a task per top-level item (like Explorer's Compress); one task.
- **Decision: a task per picked area, then "Save to device".** Rows match the areas the user picked. Against: a big `/home` is one long row.

### Restore: what Cancel means
- Options: stage then swap; check (decompress and CRC) then replace; leave restore alone.
- **Decision: stage then swap.** Unpack each area into `/tmp/restore` (Cancel safe, nothing live touched), then hold writes, wipe and move the staged files in natively, ignoring Cancel, and reload. Against: double disk for a moment; a crash mid-swap still leaves a half state, the same as before.

### Shell
- Options: Ctrl+C cancels via the run's signal; nothing; return immediately.
- **Decision: nothing.** The commands stay as they are; Cancel is on the toast and in Activity Monitor.

### Fixed either way
- Pickers and the restore question stay before the job (user activation).
- BackupService gains a `tasks` dependency.

## Key takeaways
- The swap reloads from inside its task, so a Retry that reaches it reloads too, and a Cancel during the swap can't strand held writes.

## Action items
- [x] Build it, ADR-037 revision, system reference.

## Next session topics
- Window extraction (next on the roadmap).
