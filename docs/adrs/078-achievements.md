# ADR-078: Achievements
**Date:** 2026-10-27
**Status:** Implemented

## Context
The App Store's app page shows Goals derived from active time ([App Store design](../brainstorm/2026-10-27_app-store-design.md)). Apps, games above all, have no way to tell the OS what a player did: their stats sit in their own storage and nothing above the app can show or celebrate them. The roadmap item "Achievements API" asks for apps to declare achievements in the manifest, report them through the app context, store them per app in `/var/lib/apps/{id}/`, toast on unlock and show them in the App Store ([brainstorm](../brainstorm/2026-10-27_achievements.md)).

## Decision
A new kernel service, `achievements` (`AchievementsService`), depending on `files`, `notifications`, `apps`. The same class on every platform and in solo.

```ts
// index.ts: plain data, no import
define_app({
  achievements: [
    { id: "first-win", title: "Cleared", text: "Win a game." },
    { id: "wins-25", title: "Veteran", text: "Win 25 games.", goal: 25 },
    { id: "no-flags", title: "Bare hands", text: "Win Expert without a flag.", secret: true },
  ],
});

// in the app
const { achievements } = get_app_context();
achievements.achieve("first-win");
achievements.progress("wins-25", total_wins); // cumulative, merged by max; unlocks at goal

// the OS
const service = $derived(kernel.service<AchievementsService>("achievements"));
service.list("minesweeper"); // [{ def, unlocked_at, progress, … }], reactive
```

- **Declaration:** `define_app({ achievements: Achievement[] })`, `Achievement = { id, title, text, goal?, secret? }`. No tiers, no points.
- **Catalogue:** each entry carries the count (`achievements: 3`); the build writes the definitions to `store/achievements.json` (`{ [app_id]: Achievement[] }`), fetched lazily for apps whose manifest isn't loaded. Definitions are part of the app's hash (ADR-077). Under `bun dev` and in tests the manifests answer directly.
- **App context:** `AppContext.achievements` with `achieve(id)` and `progress(id, n)`, bound to the app's id.
- **Storage:** `/var/lib/apps/{id}/achievements.json`, `{ version: 1, unlocked: { [id]: epoch_ms }, progress: { [id]: number } }`. Every change reads the file and merges (union of unlocked, max of progress) before it writes. Backed up with `/var/lib` (ADR-037).
- **Toast:** on the in-memory transition to unlocked after that merge, a notification with the app's icon titled "Achievement: {title}". An unlock another tab made merges in without a toast.
- **Uninstall with data** keeps `achievements.json`; the rest of `/var/lib/apps/{id}/` is deleted as before.
- **Built-in achievements:** the active-time Goals (opened or played once, an hour, 5 days, 10 hours, 30 days) become built-in achievements every app has, derived from usage, never stored, never toasted.
- **No backfill:** everyone starts at zero.
- **UI:** the App Store app page's section "Achievements · N of M" (built-in plus declared), progress bars, locked greyed, secret ones "Secret" until unlocked; the count on Store cards; a Game Hub tab with every game's achievements.
- **Shell:** `achievements [app]` yields `achievement` values (app, title, unlocked, progress); clicking one opens the app's Store page.
- **Inspector:** apps with records loaded, unlocks, and the definitions source.
- **First adopters:** Minesweeper, Sudoku, Hop, Snake, 2048, Solitaire, Doodlehop.

## Alternatives Considered
- **A games-kit helper writing a file per game.** No OS toast voice, and the Store and shell couldn't list achievements of apps that aren't running.
- **A section of AppsService.** It owns `/var/lib/apps` already, but achievements have their own state, inspector and command; AppsService is big enough.
- **Definitions in a lazy module (`achievements: () => import("./achievements")`).** The Store would load a chunk per app to show a list; a side file from the build answers all apps in one fetch.
- **Definitions inline in the catalogue.** Every boot would read every app's achievement text.
- **Tiers and points.** A scoring model with no use yet.
- **Backfill from existing stats.** Each game's stats have their own shape; starting from zero is honest and simple.

## Consequences
- One more file per app in `/var/lib/apps/{id}/`, one more `store/` file.
- `define_app`, `AppContext` and the catalogue entry each gain an optional, additive field.
- An unlock in another tab shows here after the next change or when this tab becomes visible again.
- Uninstalling with data no longer empties `/var/lib/apps/{id}/` completely.

## Revision 2026-10-27 (build)
Decided within scope while building:
- `idle()` on the service (the shell command waits on it before yielding); entries also carry `unlocked`, `progress_text` and `builtin` so every view formats alike.
- Built-in ids are `os.first`, `os.hour`, `os.days-5`, `os.hours-10`, `os.days-30`; `achievements_problem()` rejects declared ids with the `os.` prefix, empty ids, duplicates and goals that aren't whole numbers above 0. The catalogue test runs it over every app, not `define_app`: a check there put the boot chunk over its budget.
- Uninstall with data deletes the whole folder when there's no `achievements.json`, as before; otherwise everything but that file.
- A tab re-reads the records it holds when it becomes visible again, so another tab's unlocks show without a toast.
- The service worker's `store/` cache holds five entries instead of four.
- Game Hub's tab is labelled "Trophies" to fit four tabs on a phone; its page title is "Achievements".
- Snake, Doodlehop, Alibi, Unsaid and Paint keep a running total in app storage (`eaten`, `recognised`, `closed`, `guessed`, `saved_new`) for their progress achievements; the other apps derive totals from the stats they already keep. The total is a plain `app.{id}.*` value, so two tabs counting at once is last write wins: one can lose the other's increments. The service still keeps the higher progress either reports.

## Revision 2026-10-27 (review fixes)
- Every change runs under a Web Lock per app (`webos.achievements.{id}`): read the file, apply, write and await the write, then update memory. Under the lock the file is the truth, so the merge with memory is gone; two tabs unlocking different achievements at once both keep theirs. A tab toasts only what it added to the file it read, and only after the write landed; a failed write leaves memory unchanged, so the app's next report tries again.
- Uninstalling with data keeps `achievements.json` but empties its `progress` (under the same lock): the app's running totals reset with its data, and kept maxima would have frozen its bars after a reinstall. Unlocks stay.
- A failed definitions fetch retries on the next read after 30 s, as well as on `online`.
- Apps that report on save (Paint, Hopsprite, Tape Sketch, Warren) report only when the document had unsaved changes or had never been saved (for Warren, never saved and not an import or template), so Save on someone else's finished file earns nothing. Paint counts a save as a new image only when no file was at that path before the write. Warren's print achievement is gone: `afterprint` fires on a cancelled dialog too. Hopsprite reports an animation export from the job's done report, which a Retry runs again.
- The shell's `achievements` reads an app's record together with its definitions, so it never prints an unlocked one as locked; a locked secret shows no id or progress.

## Revision 2026-10-27 (sweep: grid puzzles)
- Sokoban, Nonogram, Kakuro, Futoshiki, Nurikabe, Hutches, Plots, Sun & Moon, Tunnels and Word Search derive their `solves-25` totals from the per-size stats they already keep; none needed a new storage key.
- Nonogram's one-offs count a solved `.nonogram` file at its own size (20×20 or larger is "big"), never an editor play-test; its total adds the black-and-white and colour stats, which only free play and dailies record.
