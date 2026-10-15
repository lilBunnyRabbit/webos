# Code quality and boot weight pass

**Date:** 2026-10-15
**Participants:** owner, Claude

## Context

The owner asked for an in-depth pass on code quality before calling anything 1.0. The bar: someone forks WebOS, deletes every non-core app (`src/lib/apps/user/`) and keeps a working OS. Apps stay encapsulated, shared files hold no app logic, and boot is minimal. Everything lazy loads, and whatever must load does so during the loading screen, like an OS. Readability for normal developers still matters more than cleverness.

Four read-only audits ran first: encapsulation (with a real fork experiment), boot weight (chunk analysis of a production build), structure and hard rules, runtime performance. A docs audit followed.

### Findings that drove the questions

- **Fork experiment.** Deleting `src/lib/apps/user` breaks `bun run check` and the build at one import: `core/components/files/file-actions.ts` loads Archive's zip code for Explorer's Compress / Extract here. The desktop also seeds a Game Hub widget from core (`desktop/additions.ts`), which shows as a missing app in a fork. 8 router/session tests launch the user app `example`.
- **Boot chunk.** One entry chunk, 1046 KB min / 272 KB gz. Phosphor icons are ~40%: each component ships all six weights as `{#if}` branches, the repo uses four. Shell command code is ~66 KB. Both platform shells ship to every device. Explorer, the file picker and several dialogs that boot never shows are eager.
- **Structure.** Services are healthy (one domain each, no cycles). Duplication sits in apps: path parsing ~20×, undo stacks 8×, `discard_ok()` 5×, four ways to read app JSON from shell code. `WindowsService` and `MobileWindowsService` share six byte-identical methods.

## Decisions

| Topic | Decision | Rejected |
|---|---|---|
| Icons | Local Vite plugin strips the `thin` and `light` branches from phosphor components. No import changes | Generated single-weight icon set (rewrites ~600 imports, generator to maintain); leave |
| Service shell commands | Follow the app pattern: definitions stay eager in `shell.ts`, bodies move to a lazily imported module. `IService.shell()` stays sync | Async `shell()` (IService change, first shortcut must await); leave |
| Boot | `kernel.init()` reports each step to the splash (progress bar + label). During boot, the platform shell chunk (desktop and mobile split by `import()`), the desktop's widget components and the session's app components warm in parallel | Split + warm without progress (long boots look frozen); split only |
| zod | Keep classic zod | `zod/mini`: ~25 KB gz less, but a functional API every app author must learn |
| Zip | The zip engine moves to `$lib/core/utils/zip/`. Compress / Extract is an OS feature, Archive is a UI over it | Apps contribute file actions through the manifest (bigger, and deleting Archive would remove zip from Explorer) |
| Default widgets | Manifest flag `default_widget: true`. Core seeds every flagged app at its `widget_size.default` | Filter unknown ids (core would still name a user app) |
| Window services | An abstract base class both window services extend, holding the shared guards (back handlers, close prompt, title, dirty, `page_hidden`) | Composed helper like `DesktopFolder`; leave |
| Helpers | All four groups move to core: path helpers and small utils; `History<T>`; `live_file` next to `json_file` plus `confirm_discard`; date and game bits | — |
| Kernel init | Stays serial (ADR-002). Independent OPFS work inside services runs in parallel | Parallel dependency levels (ordering of boot dialogs becomes implicit) |
| Fonts | Preload Inter. No subsetting | Subset Inter to Latin (changes a brand asset) |
| Mobile watermark | Keep it; CONVENTIONS names it as the exception | Remove it |
| Release | 0.37.0. Not 1.0: the tasks service (ADR-013) and backups can still change the app API | 1.0.0 |
| Games kit | Stays in core as the documented SDK for game apps. Only lazy apps import it, so a fork pays nothing | Move to a user-space shared folder |

Done without asking (existing patterns, fixes, moves): lazy imports for dialogs boot doesn't show (intro, changelog, shortcuts, open-with, save-changes, file picker, properties, conflict); parallel OPFS work inside services; default widgets off the init path; a test-only app for router/session tests; dead files and unused exports; `write_var_lib` out of the desktop module; deep imports switched to existing barrels; missing barrel exports; marquee/selection handlers for `file-list` and `desktop`, like `window.handler`; one copy of the Paint/Image Editor file flow.

### Runtime performance audit (arrived after the questions)

The shell itself is healthy: no long tasks at boot, during window drag, icon drag, marquee or Terminal typing, even at 4x CPU throttle. Prod boot to desktop: 157 ms (477 ms at 4x). Minimized windows and hidden tabs cost 0 script.

The measured problem is Explorer on big folders: 2000 files = 252 ms long task to open, and adding one file re-reads all 2000 (`getFile` per entry) and re-renders every row (151 ms). Fixed in this pass without new structure: `$state.raw` with unchanged items reused, `content-visibility` on rows, marquee hit-test by index math. The desktop folder gets the same reuse.

Left for the owner (architectural, on the roadmap):
- **Windowed rendering for long lists** (Explorer). A shared kit pattern if it lands.
- **Session save cadence.** Every focus click and every `storage.window()` write re-serializes all windows; `LatestWriter` coalesces, so cost is low today. Changing what triggers a save changes persistence timing.
- **Covered widgets keep ticking.** A widget under a maximized window has no visibility signal; adding one is new desktop state.

The owner added mid-session that the pass covers apps too, not just core; an app-by-app audit runs after the core changes merge.

## Key takeaways

- The fork test is the encapsulation check worth keeping: delete `src/lib/apps/user`, run check and build.
- Boot cost was mostly icons and code nobody runs at boot, not the services themselves.
- Duplication lived in apps that agents built in parallel; core stayed clean.

## Action items

- [x] Audits
- [x] ADR-036 (boot), revision notes on ADR-002, ADR-016, ADR-033, ADR-034, ADR-035
- [x] Implement, verify on desktop and mobile, fork test, push 0.37.0
- [ ] Docs pass against the docs audit, README architecture graph

## Outcome

- Fork test passes: without `src/lib/apps/user`, check has 0 errors, the build works, 419 core tests pass, and desktop and mobile boot clean. Full tree: 1488 tests, every app launches on desktop and mobile without console errors.
- Zip: the engine (read, write, extract, `compress_into`/`extract_to`, `ArchiveJob`) is in `core/utils/zip`. The LZ77 teaching code and the tree/preview views stay in the Archive app. Jobs take an `app_id`; Explorer's toasts come from File Explorer.
- Default widgets: `default_widget: true` in the manifest, and the pass runs after boot instead of on the init path.
- Diff: the agent's "undo survives resize" change broke the automatic split/unified switch, so it was reverted. Undo across a layout switch is on the roadmap.
- Open owner decisions are listed under ROADMAP › Code quality pass.

## Next session topics

- 1.0 criteria: fork test in CI, frozen app API, boot budget, tasks service, backups.
