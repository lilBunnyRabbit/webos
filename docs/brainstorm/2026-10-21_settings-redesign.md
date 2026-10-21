# Settings redesign
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner: "optimize the look of settings and ease of use to find settings. be inspired by macOS and Windows" and "for example the appearance has a ton of things. hard to find". One investigate-only report with three mockups (P1 split + grouped sidebar, P2 macOS panes + search, P3 Windows hubs + Home).

Today (`src/lib/apps/system/settings`): `SideNav` plus one page from a flat list of 9 (`sections.ts:13-23`). Appearance stacks ~10 sections (`appearance.svelte:126-216`): text size sits below ~24 theme cards, the generator and a 17-token editor; wallpaper is last although the desktop's "Change wallpaper or theme" lands on Appearance's top (`desktop-actions.ts:293,302`). No search. Narrow windows and phones get a horizontally scrolling tab row of 9; the window's minimum width (640) is below the side-nav breakpoint. Saved-theme actions are right-click only. Reset settings sits in About with no confirmation (`about.svelte:210-215`). Several sections hand-roll their rows instead of `Section` + `SettingRow`.

## Decisions
- **Structure: P2, macOS-style panes** (owner: "yes. this should follow the app styles. and check for any other such app that would need updates"). Appearance splits into Theme, Wallpaper, Text & interface, Taskbar; the sidebar is grouped (Personalise, System, WebOS). Create a theme and Edit colours become one-level subpages of Theme with a breadcrumb. Built from the existing UI kit and design patterns; hand-rolled rows move onto `Section` + `SettingRow`. Rejected: P1 (nothing findable by name); P3 hubs + Home (two clicks per setting, a new launcher extension point).
- **Other apps:** check every app with the same side-nav + pages shape (Style Guide, App Library, Activity Monitor, others) for the same problems and apply the same patterns where they fit; report what changed and what was left.
- **Search: static index + test.** `settings/search.ts` lists `{ id, page, label, keywords }`, lazy, never in the boot chunk. `SettingRow`/`Section` get an optional `setting` anchor. Results replace the sidebar list; picking one opens the page, scrolls to the row and rings it. A browser test mounts every page and fails when an index id has no row. Rejected: a central registry in SettingsService (new state layer, wrong owner); DOM scan (only one page is mounted).
- **Outside Settings: command + deep link.** `settings [setting]` with a completer through `define_app({ shell })`, so the `>` palette and the Terminal open and ring a row. Props gain `setting`; `?section=x&setting=y`; `appearance` stays an alias for old links and restored windows. Rejected for now: settings in the launcher's plain search (a new launcher source, architectural).
- **Narrow and phone: kit drill-in mode.** `SideNav` gains an opt-in narrow mode: a root list with search on top, tap drills in, Back goes through the phone's back (ADR-028). Apps that don't opt in keep today's tab row. Rejected: a Settings-only drill-in (a second nav pattern).
- **Extras:** Reset settings moves to "Backup & reset" with a confirm; "Related" links at page bottoms (Fonts → Font Maker); the Taskbar page is hidden on phones; saved themes get a visible ⋯ menu; the desktop's "Change wallpaper" opens Wallpaper; missing launcher keywords added. Rejected: pulling quick-launch pins and Storage into Settings (duplicates UI).

## Action items
- [x] One builder: kit `SideNav` drill-in mode + `setting` anchor (refactor first), Settings restructure, search, command, deep link, other apps pass.

## Build notes (2026-10-21)
- Decided within scope while building: index entries carry an optional `sub` (Theme's Create a theme and Edit colours), so search and `settings theme-create` open the subpage; `reveal_setting` stays internal to the kit (`ui/setting-anchor.ts`, not in the barrel, so the frozen app API doesn't grow); drill-in is SideNav taking the page as `children` plus `bind:open`, `onback` for subpages and `back_label`; the Back bar shows on phones too, next to the OS Back, like the mockup's "‹ Settings"; page ids `files` and `backup` kept so existing links stay valid, `appearance` aliases to `theme`; the manifest imports only `ids.ts` now (the old `sections.ts` pulled phosphor icons into the boot chunk).
- Other apps: Style Guide (grouped Foundations / Components) and Activity Monitor moved onto drill-in. Left for the owner: Dev Tools, RNG Tools, Keyboard & HID Lab and Unit Converter (SideNav + pages, still a tab row below `@2xl`); App Library keeps its category tab row (it filters one view); Algorithms, GW2 Tracker, Image Tools and PDF Tools hide the SideNav below `@2xl` and have their own narrow nav.

## Next session topics
- Settings results in the launcher's plain search.
- A Home page with status cards, if the sidebar outgrows panes.
