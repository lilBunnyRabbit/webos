# AchievementsService

Key `achievements` · Depends on: `files`, `notifications`, `apps` · ADR: [078](../../adrs/078-achievements.md) · Source: `src/lib/core/api/services/achievements/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Apps declare achievements in their manifest and report them; the OS stores them, toasts the unlock and shows them in the App Store, Game Hub and the shell. Every app also has five built-in achievements derived from its active time (they replaced the App Store's Goals). One class on every platform and in solo: an unlock in a solo link counts. `kernel/init.ts` `import()`s it beside the boot chunk, the way it loads `speech`.

## Declaring and reporting

```ts
// index.ts: plain data, no import
define_app({
  achievements: [
    { id: "first-win", title: "All clear", text: "Win a game." },
    { id: "wins-25", title: "Sweeper", text: "Win 25 games.", goal: 25 },
    { id: "bare-hands", title: "Bare hands", text: "Win on Expert without a flag.", secret: true },
  ],
});

// the app
const { achievements } = get_app_context();
achievements.achieve("first-win");
achievements.progress("wins-25", total_wins); // a running total; reaching the goal unlocks
```

`achievements_problem()` (`validate.ts`) names a duplicate id, an empty id, an id starting with `os.` (the built-ins' prefix) or a `goal` that isn't a whole number above 0; the catalogue plugin's "every app" test runs it over every manifest. `define_app` doesn't: the check would weigh on the boot chunk. `get_app_context().achievements` is `create_achievements_handle(app_id)` (`contexts/app/achievements-handle.ts`), built by `window.svelte`, `mobile-window.svelte` and `solo-window.svelte`; it calls the service with the window's app id.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `achieve` | `(app_id, id) => void` | Queued per app. No-op when this tab already has it unlocked. An id the manifest (`apps.load(app_id)`) doesn't declare warns and saves nothing |
| `progress` | `(app_id, id, n) => void` | `n` is cumulative; the highest seen counts. No-op when this tab already has it unlocked or at `n` or more. Reaching `goal` unlocks. A definition without `goal` warns |
| `list` | `(app_id?) => AchievementEntry[]` | Reactive. With an app: its declared achievements in manifest order, then the five built-ins; `[]` for an app no listing knows. Without: the same for every app that declares some (`achievement_count`) or has usage, by name. Reading it starts the reads it needs |
| `idle` | `() => Promise<void>` | Lets queued reads start, then waits for them, every queued change, the definitions fetch and every writer. The shell command and tests use it |

`AchievementEntry`: `{ app_id, def, unlocked, unlocked_at, progress, progress_text, builtin }`. `unlocked_at` is epoch ms, `null` while locked and always for built-ins. `progress` is capped at `def.goal` (0 without one; the goal once unlocked). `progress_text` is `"7 / 25"`, `"24 min / 1 h"` for the time built-ins, `null` without a goal.

## Definitions

- **The app's manifest** when its code is loaded (`apps.get(id).achievements`): always the case when the app itself reports.
- **Otherwise the side file.** The catalogue entry carries only the count (`achievements: 3`, read as `AppListing.achievement_count`). An app with a count and no loaded manifest makes `list()` fetch `store/achievements.json` (`{ [app_id]: Achievement[] }`) once, network-first through the `webos-store` service worker cache (`definitions.ts`). A failed fetch retries on the next `online` event. Under `bun dev` and in tests there's no build: `fetch_definitions()` reads the manifests from `$lib/apps` instead.

## Built-in achievements (`entries.ts`)

Every app has them, derived from `apps.usage(id)` on every read, never stored and never toasted (they'd all fire on the first boot). Games say "Played", other apps "Used":

| Id | Title | Unlocked at |
|----|-------|-------------|
| `os.first` | First game / First look | Any time counted |
| `os.hour` | An hour in | 1 h |
| `os.days-5` | Regular | 5 different days |
| `os.hours-10` | Ten hours | 10 h |
| `os.days-30` | Old friend | 30 different days |

## State

- `records`: `SvelteMap<AppId, AchievementRecord>`, what each app's file held when last read, merged with this tab's changes. Filled on first `list()` of the app or the first change.
- `reading`, `queues`: per-app promises; changes to one app run one at a time.
- `writers`: a `LatestWriter` per app's file.
- `definitions` / `definitions_state` (`idle`, `loading`, `loaded`, `failed`): the side file.

## Lifecycle

- `init()`: listens for `visibilitychange` (a tab coming back re-reads every record it holds, merging another tab's unlocks in without a toast) and `online` (a failed definitions fetch may try again). Nothing is read at boot.
- `destroy()`: removes both listeners.

## Persistence

`/var/lib/apps/{id}/achievements.json` (`persistence.ts`):

```json
{"version":1,"unlocked":{"first-win":1793107700000},"progress":{"wins-25":7}}
```

Keys sorted, newline at the end. A broken or other-version file reads as empty and is replaced on the next change. Backed up and restored with `/var/lib` (ADR-037).

**Uninstalling with data keeps it:** `apps.uninstall(id, { data: true })` deletes everything else in `/var/lib/apps/{id}/`, and the whole folder only when there's no `achievements.json` ([apps](apps.md#public-api)).

## Behaviour & invariants

### Merge on every change

A change reads the file, merges it with the record in memory (`merge_records`: union of unlocks with the earlier time, max of progress), applies itself, sets the record and writes when the result differs from the file. Two tabs or two windows never lose each other's unlocks or progress.

### One toast per unlock

Only ids unlocked by this change, after the merge, toast: an unlock another tab saved first is already in the merged record, so it merges in silently. Two windows of one app share the tab's record, so the second `achieve` is a no-op. The toast is the app's (`notify(app_id, …)`): its icon, "Achievement: {title}", the text as the message. Built-ins never toast.

### Secrets

`secret` hides the title and text until unlocked: the App Store and Game Hub show "Secret" and "Unlock it to see what it is.", the shell `Secret` and no text. Progress bars hide too.

## UI

- `components/achievements/achievement-list.svelte`: the list both apps use. A two-column grid from `@xl`, one card per entry (`bg-background-light`, `ring-foreground/8`): a trophy on `primary/12` when unlocked with the date, a lock otherwise; locked cards dimmed to `foreground/80`; a `progressbar` with `progress_text` for a locked achievement with a goal.
- **App Store › app page:** "Achievements · N of M" in place of the old Goals, with the last-used line under it ([system apps](../system-apps.md)). Grid tiles and shelf cards add "· 🏆 N" after the category for apps that declare some.
- **Game Hub › Trophies:** every game with entries, those that declare some first, then by share unlocked; a header with the total, per game its icon, "N of M", a bar and Play.

## Shell

Contributes (`achievements/shell.ts`):

- `achievements [app]`: yields `achievement` values (`app` (name), `app_id`, `id`, `title`, `text`, `unlocked` (boolean), `unlocked_at`, `progress`, `builtin`). Columns `app`, `title`, `unlocked` (the date, `yes` for a built-in, `no`), `progress`. `achievements | where unlocked == true`. Clicking one opens the app's App Store page (`apps.launch("app-library", { app })`). Uses the `app` completer.

See [shell](shell.md#contributions).

## Divergence from ADR

- `idle()` is public: the shell command waits on it before yielding, and tests use it.
- `AchievementEntry` also carries `unlocked`, `progress_text` and `builtin`, so every view formats the same way.
- The inspector reads only `list()`: apps declaring, declared, unlocked, built-ins unlocked; detailed: a row per declared achievement.

## Known gaps

- Another tab's unlock shows here only after this tab's next change to that app or when it becomes visible again.
- A goal lowered in a new app version doesn't unlock already-reached progress until the next `progress` call with a higher `n`.
- `list()` without an app runs the built-ins for every used app; fine at today's ~100 apps.
