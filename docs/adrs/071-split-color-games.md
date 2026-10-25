# ADR-071: Split Color Games and Replaced App Ids
**Date:** 2026-10-25
**Status:** Implemented

## Context

Color Games is one app with four modes: Recall, Odd one out, Gradient sort and Hex guess. ADR-050 chose that shape over an app per mode and gave each mode its own daily, under `"color-games/{mode}"`. The owner now wants each game as its own app, with the colour utilities in one separate app, Color Tools (ADR-072).

Nothing in WebOS maps an old app id to a new one. Old challenge links (`#/solo/color-games?mode=recall`), the installed list (ADR-040) and the offline picks (ADR-065) all name `color-games`.

Discussion: [brainstorm](../brainstorm/2026-10-25_chromatics.md).

## Decision

- **Four apps.**

  | Id | Name | Category |
  |----|------|----------|
  | `color-recall` | Color Recall | Games |
  | `odd-one-out` | Odd One Out | Games |
  | `gradient-sort` | Gradient Sort | Games |
  | `hex-guess` | Hex Guess | Games |

  Each keeps its mode's props (`seed`, `daily`, `level` where it has one), its single `daily_rank` and its share line. `color-games` is removed.
- **Dailies keep their seeds.** A game seeds its daily with `daily_seed(day, "color-games/{mode}")`, so a day's puzzle is the same before and after the split. New results are stored under the new app id. Older days stay under `color-games/{mode}`, which Game Hub's streaks and totals still count, as with Sudoku's move to `sudoku/9x9`.
- **`replaces` manifest field.** `define_app` gains an optional `replaces: { app: string; props?: Record<string, unknown> }[]`. AppsService resolves an unknown id through it:
  - a launch, an open, or a `#/app/` or `#/solo/` link for `color-games` with matching props opens the replacing app with the remaining props;
  - an installed or offline entry for `color-games` becomes the replacing apps.

  A replaced id with no props match (`#/solo/color-games` with no mode) goes to the app whose `replaces` entry has no `props`. That's Color Recall, the first mode.
- **Shared code.** Colour maths come from `color-tools/color.ts`, which wraps the package (ADR-072). The games import it, the same cross-app pattern as Image Tools → PDF Tools under ADR-045. Generic game pieces go to `$kit/games`; pieces only the colour games share stay in one game's module that the others import.
- **Order.** The split ships first, still on culori, with the same behaviour. The swap to chromatics follows once Color Tools exists.
- **Shell:** nothing new.

## Alternatives Considered

- **Keep one app (ADR-050):** no migration, but the owner wants each game reachable on its own.
- **A core rename table in AppsService:** puts app knowledge in core.
- **A hidden `color-games` stub app that relaunches:** leaves a ghost in the registry, and installed lists still name it.
- **Rewrite `plays.json` keys:** a one-off migration in a stable format, for one app.
- **Clean break:** old links fail and streak history stops matching.

## Consequences

- `define_app` grows a stable optional field (app-api.md, `app-api.test.ts`). Future renames use it, for example Wordle → Letterer, which had none.
- ADR-050's per-mode keys remain for Sudoku. Color Games' use of them becomes history.
- There are four launcher entries in Games instead of one.

## Revision 2026-10-25: implemented (3.70)

- **Where the resolving lives.** `apps/replaces.ts` holds three pure helpers: `resolve_replaced(manifests, id, props)`, `replacing_apps` and `current_ids`. AppsService uses them in `launch()`, in `open()` for `.desktop` and `.widget` targets, and in `init()` for the installed list. RouterService and OfflineService call them over `apps.list()`, so the AppsService interface gains no method. A registered id always wins; only an unknown one resolves. When several entries match, the one naming most props wins, and the matched props are dropped from what the app receives.
- **Not rewritten.** The installed list and `/etc/offline.json` are mapped on read and saved in the new shape on their next write.
- **Not covered** (closed by the 2026-10-26 revision below, except old data). Saved session windows, taskbar pins, mobile home and dock entries, the recent list and `file_defaults` naming `color-games` aren't mapped (apps.md, Known gaps). The old `app.color-games.*` localStorage (the slider space, practice level, today's saved daily attempt) isn't carried over, so a daily played on split day before updating can be played again under the new id.
- **Shared code.** Before Color Tools exists, culori stays Color Recall's dependency. `color.ts`, `seed.ts`, `modes.ts` (now with `LEGACY_ID` and the shared prop schemas), `run.ts`, the share helpers, `share-card.svelte` and the shared frame `color-game.svelte` (Daily/Practice, level, New puzzle, status bar) live in `color-recall/`, and the other three import them. Nothing moved to `$kit/games`: no piece was generic beyond these four games.
- **Changelog.** The Color Games release lines are retagged to the four ids, following the precedent for retired apps, so each game's App Library history starts there. Share heads read "Color Recall #12" instead of "Color Games · Recall #12".

## Revision 2026-10-26: every stored app id

The "Not covered" list above is closed, except old data (owner, 2026-10-25: "Map pins + session, drop old data").

- **Mapped on read, written back on the next normal write.** Saved session windows resolve by their props (a Hex Guess window restores as Hex Guess with its other props and window state), and a replaced id's frame goes to each replacing app without one. Taskbar pins, `file_defaults` values and the recent list resolve to the app a bare launch opens, once: one pin stays one pin. Desktop and mobile home `.desktop` and `.widget` files show and open as the new app; the files aren't rewritten.
- **Two new helpers** in `apps/replaces.ts`: `current_target` (known id as is, else resolved, else left for the store's own check), `current_list` (single targets), `current_records` (per-app records). SessionService and the desktop folder reach the manifests through `apps.list()`; AppsService maps the settings pins and defaults at the end of `init()`, the place that already prunes pins on uninstall. No interface changed.
- **Left behind on purpose.** `app.color-games.*` localStorage and any `/var/lib/apps/color-games` data. Scheduler jobs aren't mapped; none of the four apps schedules any.
