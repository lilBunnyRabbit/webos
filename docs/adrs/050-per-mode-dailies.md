# ADR-050: Per-Mode Dailies
**Date:** 2026-10-18
**Status:** Implemented

## Context

ADR-035 gives each app one daily: `/var/lib/games/plays.json` keeps day → app id → best result, ranked by the manifest's `daily_rank`. Color Games is one app with four modes (Recall, Odd one out, Gradient sort, Hex guess), and the owner wants each mode to have its own daily and Game Hub row.

Discussion: [brainstorm](../brainstorm/2026-10-18_color-games.md).

## Decision

- **Mode sub-keys in the daily map.** A mode's result is stored under `"{app_id}/{mode}"`, e.g. `"color-games/recall"`. plays.json stays version 1; existing files stay valid. Per-app play stats (`games`) stay keyed by app id.
- **`daily_rank` may be a per-mode record**, `Record<string, DailyRank>` beside the current single value. An additive widening of a stable field: a minor.
- **The tracker takes an optional mode**, e.g. `tracker.daily(day, ms, score, mode?)`, and reads results the same way. Exact signature is up to implementation, additive only.
- **Game Hub** shows one daily row per mode for an app with a per-mode `daily_rank`, labelled "App · Mode", and opens the app on that mode.
- **Shell:** nothing new.

## Alternatives Considered

- **App per mode:** no contract change, but four launcher entries and duplicated UI. Owner chose one app.
- **One app, only one mode daily:** loses dailies for three modes.
- **Nested day → app → mode, version 2:** cleaner tree, but every reader and the stable format change; a migration and a major.

## Consequences

- The daily map's keys are no longer only app ids; readers that look up a manifest by key split on `/` first.
- Any future multi-mode game reuses this.
- The stable surface grows: optional mode argument and the `daily_rank` record (app-api.md, `app-api.test.ts`).

## Revision 2026-10-18: implemented

- Kit: `daily_key(app_id, mode?)`, `split_daily_key(key)`, `daily_rank_for(rank, mode?)` and the `DailyRanks` type in `$kit/games/daily`; `PlayTracker.daily(day, ms, score?, mode?)`.
- Game Hub keeps the daily contract of ADR-035: a game offers dailies when its props schema has a `daily` key. A per-mode row launches `{ daily, mode }`, and its label is the mode id in sentence case (`odd-one-out` → "Odd one out"), so the manifest needs no label field. The library card shows "Dailies 2/4" for such a game.
- The shell's `game-daily` value gains a `mode` field; clicking a mode's row opens that mode.
- First user: Color Games, whose props are `{ mode, seed, daily, level }`: `daily` for Game Hub, `level` so a Hard practice challenge link replays the same puzzle.
