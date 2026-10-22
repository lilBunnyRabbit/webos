# ADR-067: Browser Support Check
**Date:** 2026-10-23
**Status:** Implemented

## Context
WebOS targets the owner's current Chrome and uses many features other engines lack or ship late: OPFS writes, Web Locks, anchor positioning, Popover, `closedby`, relative colours, built-in AI, WebCodecs, and more. Nothing checks for them. In another browser it either fails at boot with a raw error, or boots into a shell with misplaced menus and apps that break without saying why. Discussion and the full inventory: [2026-10-23_browser-support](../brainstorm/2026-10-23_browser-support.md).

## Decision
- **One list.** `src/lib/core/compat/features.ts` exports every non-baseline web feature WebOS uses (JS, CSS, HTML). Entry: `id`, user-facing `name` and what is lost, `level` (`start` | `shell` | `apps` | `cosmetic`), `apps` (ids, for `apps`), `min: { chrome, firefox, safari }` (`null` = not shipped), `probe(): boolean`. Probes are synchronous and cheap (`in` checks, `CSS.supports`, a tiny canvas test where a feature exists but does nothing).
- **Versions too.** `min` is the version where the feature works the way WebOS uses it, not where it first appeared (Popover: the version with `ontoggle`, nested light dismiss and the parts the start menu relies on). Status per entry: `missing` (probe fails), `outdated` (probe passes but the UA-reported version of a recognised engine is below `min`: "probably works, may misbehave"), `ok`. An unrecognised browser is judged by probes alone. The UA maps to an engine: Chromium (Chrome, Edge, Brave, Opera, Samsung), Gecko, WebKit (Safari, and every iOS browser by its iOS version).
- **Gate entry.** `index.html` loads a tiny `src/boot.ts` instead of `main.ts`. It runs every probe; with nothing missing, or nothing beyond the dismissed set, it imports `main.ts` (modulepreloaded). Otherwise it lazily loads the screen.
- **Screen.** Plain DOM over the splash, no Svelte, no shell, theme-token CSS only. Shows the browser label from the UA ("Safari 18.4 · iOS"), then the missing features grouped by level (Won't start, Shell, Apps, Cosmetic) with "Update to X or later" from `min`. Buttons: Continue anyway (Try anyway when a `start` feature is missing) and Don't show again.
- **Dismissal.** `localStorage["webos.compat.dismissed"]` holds the sorted ids of missing and outdated features. The screen shows again only when a feature outside that set is missing or outdated.
- **Solo scope** (owner, 2026-10-23): a `#/solo/{id}` link focuses on that one app. The screen and the dismissal check consider only `start` entries and the entries whose `apps` include the id; the header names the app ("Paint · Safari 18.4 · iOS"). Full WebOS keeps every entry. The dismissal key stays one set of ids, so dismissing in solo never hides new full-WebOS issues. Settings › About and `compat` always show the full list.
- **Ways in.** Settings › About shows the browser label and the list with each entry's status, and can show the screen again. Shell command `compat` yields a `columns` table (`feature`, `level`, `status`, `apps`, `min`).
- **Rule.** CLAUDE.md: a commit that starts using a web feature not on the list adds its entry. A test checks every app id in the list exists.

## Alternatives Considered
- **UA + version table only:** UA strings lie (iOS Chrome is WebKit), tables go stale.
- **Check inside `main.ts`:** a browser that can't parse the bundle never reaches it.
- **Post-boot dialog:** depends on anchor positioning and popover, the likely broken parts.
- **Manifest `requires` per app:** changes stable `define_app`; every manifest read.
- **Dismiss by browser version:** re-shows on every browser update, misses new requirements.

## Consequences
- One more entry chunk before `main.ts`; it counts against the boot budget.
- The list must be kept in step with the code; the CLAUDE.md rule and the app-id test are the only guards.
- `min` versions are copied from MDN data and age; probes stay the truth.

## Revisions
**2026-10-23 (implementation).**
- **Solo scope** added to the decision above, from the owner during the build.
- **`apps` on any level.** An entry may name apps whatever its level (Popover and anchor positioning name the apps that use them directly), so a solo link for Paint still warns about them. The screen shows "Apps: …" on any entry that names some.
- **Display names.** The check runs before the app registry exists, so `core/compat/app-names.ts` carries the names it shows; a unit test keeps each equal to its manifest's `name` and fails on an unknown or unused id (skipped in the fork job, which deletes user apps). Solo falls back to the id in words for an app with no entries ("portfolio" → "Portfolio").
- **iOS UA.** iOS 26 froze the OS in every iOS browser's UA at 18.6. Safari still reports `Version/`, so Safari is judged by that; any other iOS browser reporting 18.6 gets no engine version and is judged by probes alone. `HeadlessChrome` counts as Chrome.
- **Build.** Vite's preload helper moved out of `core` into its own `preload-helper` chunk: in `core`, `boot.ts` would have loaded all of core before the check. A build plugin (`preload_main_plugin` in `vite.config.ts`) adds `modulepreload` links for `main.ts`'s chunk and its static imports and a `preload` for its stylesheet (applied only when `main.ts` loads, so it can't restyle the screen); measured in production, every boot chunk starts downloading in the same few milliseconds as the entry. The modulepreload polyfill is off: every engine that can run WebOS has `modulepreload`.
- **Budget.** Boot 182.0 → 189.3 KB gz of 190: the entry with the list is 7.0, `preload-helper` 0.8. The list's text (`name`, `lost`) is about half of the entry; moving it to a lazy module is the obvious saving if the budget needs room, and an owner call since it splits the one list.
- **Show again.** Settings › About clears the dismissal and draws the screen over the running OS (no reload); Continue or Escape closes it.
- **Hex colours.** The screen uses Brand Dark's tokens as hex: it exists for old engines, and Firefox before 113 drops `oklch()`.
