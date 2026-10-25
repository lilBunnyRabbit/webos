# ADR-071: Split Color Games and Replaced App Ids
**Date:** 2026-10-25
**Status:** Accepted

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
