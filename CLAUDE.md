# WebOS — agent guide

A desktop environment in the browser, built with Svelte 5. It's a solo learning project, and the reasoning behind each technical decision matters more than the feature count.

## Read first

1. [docs/PRINCIPLES.md](docs/PRINCIPLES.md): why the project exists, how decisions get made, how the owner works. **Mandatory.**
2. [docs/CONVENTIONS.md](docs/CONVENTIONS.md): where code goes, naming, Svelte and styling patterns.
3. [docs/ROADMAP.md](docs/ROADMAP.md): what's done and what's next.
4. [docs/adrs/README.md](docs/adrs/README.md): the ADR index, showing which are implemented and which are only accepted.
5. [docs/system/README.md](docs/system/README.md): the system reference, describing how every part of the OS works today.
6. [docs/design/README.md](docs/design/README.md): how WebOS should look: foundations, UI kit, patterns, shell.
7. [docs/apps/README.md](docs/apps/README.md): internals of the user apps that have non-obvious ones (models, algorithms, protocols, formats).

Read the ADR and the system reference page for the area you touch before you touch it. For a user app with a page in `docs/apps/`, read that page too.

## Quick start

```bash
bun install
bun dev
bun run check   # must stay at 0 errors
bun run test    # unit (Node) + browser (Chromium) tests, ADR-027
```

Tests sit next to their source: `*.test.ts` runs in Node, `*.browser.test.ts` in real Chromium (OPFS). Anything touching OPFS or the DOM goes in a browser test; no fakes. First run: `bunx playwright install chromium`.

## Architecture in one screen

The kernel is a service registry with dependency resolution. `kernel.init()` builds services in dependency order and awaits each `init()` before the app mounts (ADR-002). Services are domain classes using runes, registered in `src/lib/core/api/kernel/init.ts`. Its job is to let one implementation be swapped for another, for example mobile and desktop (ADR-016), or full and solo (`#/solo/` links swap `apps`, `session` and `version`, ADR-047). It is not a security boundary.

| Key | Service | Purpose | Depends on |
|-----|---------|---------|------------|
| `settings` | SettingsService | Theme tokens, taskbar position and quick launch pins, file defaults, persisted in `/etc/settings.json`; UI and code font (built-in Burrow or a family file in `/etc/fonts`), loaded lazily as `FontFace`s; usage stats answer, mirrored to localStorage for `index.html` (ADR-070) | files, notifications |
| `windows` | WindowsService | Window lifecycle, geometry, z-order, snap. `MobileWindowsService` on mobile (ADR-016) | none |
| `files` | FilesService | OPFS: `opfs.ts` → `DirectoryHandler` → service (ADR-005). Unix-lite hierarchy `/home /etc /var /tmp` built in `init()`, per-directory `revision(path)` (ADR-021) | none |
| `version` | VersionService (`SoloVersionService` in solo, ADR-047) | `version.json` polling (ADR-004), changelog, seen marker in `/var/lib/version/state.json`, first-boot introduction (ADR-026), new-app announcements and the usage stats ask after the Restore answer (ADR-038, ADR-070). Registered last so the intro stacks above Restore | files, notifications, dialogs, apps, session, settings |
| `notifications` | NotificationsService | Toasts + history (ADR-006). Report user-facing errors here | none |
| `dialogs` | DialogsService | Promise-based system dialogs above windows (ADR-019) | windows |
| `apps` | AppsService (`SoloAppsService` in solo) | Registry from glob, `launch()` validates props (ADR-008), `open(path)` by association (ADR-018) | windows, notifications, files, settings, dialogs |
| `desktop` | DesktopService | `/home/Desktop` folder as icons, `.desktop` shortcuts, positions in `/var/lib/desktop/layout.json` (ADR-022). `MobileDesktopService` (pages + dock) on mobile (ADR-016) | files, apps |
| `session` | SessionService (`SoloSessionService` in solo) | Saves open windows and window frames to `/var/lib/session/session.json`, restore dialog at boot, reopen closed windows (ADR-023) | windows, apps, files, dialogs, notifications |
| `clipboard` | ClipboardService | Copy/cut/paste for files (in memory), text to the system clipboard (ADR-025) | files |
| `ui` | UiService | Shell overlay state: launcher, mobile switcher, notification center; `back()` for the nav bar and the browser's back via a history guard (ADR-028) | windows, dialogs |
| `shell` | ShellService | Commands contributed by services through `IService.shell()`, zod args, structured values and pipes, completion, shared history in `/var/lib/shell/history` (ADR-033) | files, dialogs, notifications |
| `shortcuts` | ShortcutsService | Keyboard shortcuts: registry, one keydown dispatcher, OS defaults run shell commands, Mod+/ cheat sheet (ADR-012, ADR-017, ADR-033) | windows, dialogs, shell |
| `tasks` | TasksService | Background jobs on `@lilbunnyrabbit/task-manager`: one manager per run, progress toast with Cancel, retry, Activity Monitor Tasks section and taskbar indicator; memory only (ADR-013) | notifications |
| `offline` | OfflineService | Which user apps work offline (ADR-065): the service worker precaches only core and system apps; picked apps (`/etc/offline.json`) download after every update as a task, an app's first open in a build saves it quietly; saved set in `/var/lib/offline/state.json`, one Web Lock `webos.offline.sync`, older `webos-assets-*` caches pruned; launcher dims unsaved apps offline | files, apps, tasks, notifications, windows |
| `backup` | BackupService | Zips `/home`, `/etc`, `/var/lib` and `app.*` localStorage (picked per area) to the device, never OPFS; restore replaces the areas a backup holds and reloads, holding FilesService writes meanwhile; both run as tasks (ADR-037) | files, dialogs, notifications, windows, tasks |
| `extract` | ExtractService | Desktop only: pops one window out into an always-on-top Document Picture-in-Picture window, the app remounted there; the window's sheets, menus and dialogs follow it; `win pop` / `win back`; asks before discarding unsaved work on the way back (ADR-043) | windows, dialogs, notifications |
| `ai` | AiService | Chrome's on-device AI (Gemini Nano): availability per feature, summarize, translate, detect, streaming prompt; sessions kept and reused, model downloads as tasks. `MobileAiService` answers "no" on mobile (ADR-046) | files, tasks, notifications |
| `scheduler` | SchedulerService | Scheduled notifications for every app (alarms, timers, Pomodoro phases, reminders) while any WebOS tab lives: registry in `/var/lib/scheduler/jobs.json`, one leader tab per browser (Web Locks) with one timer, OS notifications through the service worker with shell-command buttons, missed summary at boot, one in-page chime per pass (`silent` jobs skip it), apps' lazy `on_fire` handlers run in the leader, Triggers when flagged (ADR-062) | files, notifications, apps, shell |
| `router` | RouterService | Deep links: opens `#/app/{id}?{props}` after the Restore answer, then clears the hash; `#/solo/{id}?{props}` stays in the URL (ADR-047); Copy link and Copy solo link for every window, without device paths (ADR-010) | windows, apps, session, clipboard, notifications |

Each service ships a lazy `inspector.svelte`, which the Kernel app renders in basic and detailed modes (ADR-020). A new service needs one.

Planned services each get an ADR first. Add a service only when its roadmap item is picked up.

```ts
const windows = $derived(kernel.service<WindowsService>("windows"));
windows.focus(id); // always via the prefix, never destructured
```

Apps are auto-discovered from `src/lib/apps/{system,user}/{id}/index.ts`, using `define_app()` plus a lazy `{id}.app.svelte`. See CONVENTIONS. Inside an app, `get_app_context()` from `$lib/core/contexts/app` gives its window handle (reactive state, controls) and `app.{id}.*` localStorage (ADR-003).

### Long-running work: use tasks

Anything slow that a user would want to watch, cancel or retry runs through `TasksService` (ADR-013, [tasks](docs/system/services/tasks.md)), on `@lilbunnyrabbit/task-manager`. That covers zip, PDF jobs, batches, imports and downloads. Any app, service or core util can use it, and it's the default over hand-rolling a progress toast with a Cancel flag. Model the work the way the package is designed for: a `createTask` per unit (file, page, folder), `createTaskGroup` for steps (`sequential`, or `parallel` when units are independent), progress through `this.setProgress()`, logs through `this.logger`, and the status line through `parse()`. The job gets a progress toast, a row in Activity Monitor › Tasks with the run's tree, and a taskbar indicator for free.

```ts
const job = kernel.service<TasksService>("tasks").run(app_id, (context) => /* fresh tasks: build runs again on Retry */, {
  title: "Exporting 12 pages",
  done: (result) => ({ title: "Exported", actions: [...] }),
});
// Inside execute: context.signal (Cancel), context.message("3 of 12"), await context.pace() in tight loops
```

References: `src/lib/apps/user/example/task.ts` (parallel group, logs, `parse()`, fail once), `src/lib/core/utils/zip/operations.ts` (one task per picked item, then a write step).

## Hard rules

- Runes only. No `any`. `interface` for object shapes.
- `snake_case` for code identifiers, `PascalCase` for types and components, `kebab-case` for files. This is settled; don't relitigate it.
- Const-object enums, not TS `enum`.
- Access services through `kernel.service<T>("key")` in `$derived`. Never destructure a service.
- Pure logic in `.ts`, reactive state in `.svelte.ts`, rendering in `.svelte`.
- Follow the [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/) (see CONVENTIONS, Styling & brand). Use theme tokens only. Tailwind's default palette is disabled, and no colour may be added.
- Container queries in app UI, not viewport breakpoints.
- Anything new (app, section, feature, dialog) is built for desktop and mobile alike. Before calling it done, check both: a desktop window (mouse, keyboard, resized narrow and wide) and the mobile shell (`?platform=mobile`, about 390 px wide, touch). Touch targets, pinch and pan, panels that stack, nothing cut off or overflowing, no hover-only actions. Report what was checked and how; "check passes" is not a UI check.
- UI follows [docs/design](docs/design/README.md) and is built from the UI kit (`$lib/core/components/ui`). A component or pattern two apps need goes into the kit, the design docs and the Style Guide app.
- No new dependency without asking. zod and `@lilbunnyrabbit/task-manager` are already approved by ADRs.
- No backend. GitHub Pages is the host.
- Use the latest web platform features (anchor positioning, popover, `@container`, View Transitions, and so on). The target is the owner's current browser: no polyfills, fallbacks or support checks for older ones. If it works on the owner's machine, it ships. Before building UI or browser behaviour by hand (dismissal, focus, positioning, stacking, animation), check whether a newer platform API does it natively, and bring it up.

## Browser support list

WebOS warns at start-up about features the browser lacks (ADR-067, [compat](docs/system/compat.md)). The list is `src/lib/core/compat/features.ts`. A commit that starts using a web API, CSS or HTML feature that isn't broadly supported (anything MDN doesn't mark Baseline widely available, or that WebOS uses in a newer form than the baseline one) adds or updates its entry in the same commit: `level` (`start`, `shell`, `apps`, `cosmetic`), `apps` (ids that use it directly), `min` for Chrome, Firefox and Safari (the version where it works the way WebOS uses it, from MDN browser-compat-data; `null` when not shipped), and a cheap synchronous `probe()`. A new app id there needs its name in `compat/app-names.ts`. Removing the last use removes the entry. The probes run before WebOS loads, so the file imports nothing.

## Shell integration: ask every time

The terminal, the Mod+K `>` palette and the OS shortcuts all run on one command system (ADR-033, [shell](docs/system/services/shell.md)). The owner wants new things reachable from it. **When building a new core feature, a new or changed service, or a new app, put the shell question into the grill (AskUserQuestion) before implementing.** Don't decide it silently, and don't skip it because it looks optional.

Ask about each of these that applies, with a concrete proposal per option:

- **Commands.** Which commands the service contributes in its `shell.ts` through `IService.shell()`: names (Unix verb for files, `noun verb` group for a domain), args (zod and `arg.*` kinds), what they yield, and `available()`.
- **Values.** Whether its data should flow as a tagged value type (`columns`, `text`, `cell`, `open`), so `ls`-style output, `where`, `sort` and clicking all work. It can also extend another service's type, like apps adding `open` to `file`.
- **Completion.** Whether a new arg kind needs a completer (`path`, `app`, `window`, `theme`, `task`, `job` and `when` exist).
- **Shortcuts.** A new OS action gets its logic as a command, and its key binding goes in `shortcuts/defaults.ts` as `command: "…"`, never a new `run`.
- **Apps.** Apps contribute global commands through `define_app({ shell })` (ADR-034); a service wins an id clash. Window-scoped app commands are deferred, so in-app shortcuts still use `run`. For a new app, ask:
  - whether a service command covers it (like `app launch x`, or `open` with its file type);
  - whether it should take a prop the Terminal or palette can pass;
  - which commands it adds through its manifest `shell`.
- **Ways in.** Whether it needs a link with the Terminal, like Explorer's "Open in Terminal" (`open_terminal(cwd)` in `components/files/file-actions.ts`).

The default answer may be "nothing"; that's still the owner's call. Record what was decided in the brainstorm log, and list new commands in the service's `## Shell` section and in the contributions table of `docs/system/services/shell.md`.

## Architecture is the owner's call, always

**Never make an architectural decision yourself.** That's the most important rule in this repo. The decisions are the point of the project. An agent that decides one for the owner has taken the part they care about most.

### What counts as architectural

Anything that changes how the system is shaped and isn't already decided in an ADR or in CONVENTIONS:

- a new service, or changing what a service owns or depends on
- a new state layer: a store, context, global, or cache
- a new abstraction, manager, registry, or event/pub-sub mechanism
- changing a public API shape: a service interface, `define_app`, `IService`, app props, or the shape of a WindowHandle
- a new dependency, or a new browser API that becomes part of the core
- persistence: what gets stored, where, and in what format
- deviating from an ADR, or from the pattern the repo already uses for the same thing
- anything justified by "we'll need it later"

### What doesn't count

Just do these:

- implementing a component or feature inside an existing pattern
- implementing what an ADR already specifies
- bug fixes that don't change shape
- renames, formatting, docs, tooling

### When in doubt

Treat it as architectural.

### How to ask: grill the owner

Don't present a menu and wait for a click. Interrogate:

1. **Stop before the first edit.** Do the investigation, then stop. Never ship a "temporary" version of the architecture to ask about later. Never "proceed under an assumption" on architecture.
2. **Brief first.** Before the first question, give a short plain brief of the topic: what the ADR or area is for, what exists in the code today, and what needs deciding. The owner must never have to guess what a question is about.
3. **State the problem and its root cause** in one or two sentences, with the evidence (file:line).
4. **Lay out the real options**, lightest first. Show a code sketch of each and say what breaks with each one.
5. **Recommend one, then attack it yourself.** Give the strongest argument against your own pick.
6. **Grill.** Ask the hard questions the owner may not have considered:
   - What breaks today without this?
   - Which ADR does this contradict or extend?
   - What happens with two windows of the same app open?
   - What happens on mobile (ADR-016)?
   - What happens when a service is swapped?
   - How does this get persisted or restored?
   - What's the smallest version that still answers the question?
   Challenge assumptions in the request itself if they look wrong.
7. **Record it.** Once the owner decides, log the discussion in `docs/brainstorm/`. If it's final, write an ADR. Only then implement.

Claude Code: use `AskUserQuestion`, putting the recommended option first and a code preview per option. Never ask in prose and then carry on.

Sub-agents that implement get this section in their prompt. Otherwise scope them to investigation only. A sub-agent that changes a user app also gets the "Per-app docs" rule (under Documentation duties) and the app's `docs/apps/{id}.md` path when the app is listed there.

If architectural work is blocked waiting on the owner, finish everything that doesn't depend on the answer. Then stop and report.

## Documentation duties

### System reference

`docs/system/` documents all OS infrastructure in depth, as it is now: kernel, services, shell UI, app model, persistence, theming and system apps. Non-OS user apps (`src/lib/apps/user/`) are excluded; the ones with non-obvious internals are in `docs/apps/` (below).

**Every change to OS code updates the matching reference page in the same commit.** This covers new or changed service APIs, state, persistence keys, shell interactions, manifest fields and system app features. A new service, shell component or system app gets its page and an index entry. A commit that changes behaviour and leaves the reference stale is incomplete. Code that diverges from an ADR goes under "Divergence from ADR" on the page, and the ADR gets a revision note. Page shape and the full index are in `docs/system/README.md`.

### Per-app docs

`docs/apps/` holds a page for each user app with non-obvious internals: a model, an algorithm, a protocol, a file or share format. Apps that are a form over a JSON file don't get one. Documented today:

| App id | Page |
|--------|------|
| `shopping-list` | `docs/apps/shopping-list.md` |
| `cards` | `docs/apps/cards.md` |
| `p2p-transfer` | `docs/apps/p2p-transfer.md` |
| `format-lab` | `docs/apps/format-lab.md` |
| `font-maker` | `docs/apps/font-maker.md` |
| `birdseye` | `docs/apps/birdseye.md` |
| `proposals` | `docs/apps/proposals.md` |
| `warren` | `docs/apps/warren.md` |
| `tunnels` | `docs/apps/tunnels.md` |
| `unsaid` | `docs/apps/unsaid.md` |
| `alibi` | `docs/apps/alibi.md` |
| `doodlehop` | `docs/apps/doodlehop.md` |
| `calendar` | `docs/apps/calendar.md` |
| `soundboard` | `docs/apps/soundboard.md` |
| `sun-and-moon` | `docs/apps/sun-and-moon.md` |
| `hutches` | `docs/apps/hutches.md` |
| `hop` | `docs/apps/hop.md` |
| `plots` | `docs/apps/plots.md` |
| `moonrabbit` | `docs/apps/moonrabbit.md` |
| `image-tools` | `docs/apps/image-tools.md` |
| `checkout-challenge` | `docs/apps/checkout-challenge.md` |
| `tea-timer` | `docs/apps/tea-timer.md` |
| `tape-sketch` | `docs/apps/tape-sketch.md` |
| `portfolio` | `docs/apps/portfolio.md` |

**Every change under `src/lib/apps/user/{id}/` for a listed id updates `docs/apps/{id}.md` in the same commit**, and so does a change to kit code a page describes (`$kit/utils/p2p`, `$kit/utils/light`, `$kit/utils/codecs`, `$kit/utils/qr`, `$kit/utils/video`). A commit that changes behaviour and leaves the page stale is incomplete. Check the table before you commit; don't rely on remembering.

A new or changed app that gains a model, an algorithm, a protocol, a file or share format, or a non-trivial dependency gets a page, a row in this table and a row in the index in `docs/apps/README.md`. Page shape: `docs/apps/README.md`.

### Brainstorm logs

For design or architecture discussions, write `docs/brainstorm/YYYY-MM-DD_topic.md`, using lowercase and hyphens. Update it **during** the session, not only at the end. Sections:

- Date and participants
- Context
- Topics discussed, with decisions
- Key takeaways
- Action items
- Next session topics

Link earlier sessions when relevant. Use one file per major topic.

### ADRs

Write an ADR when a decision is final but not yet implemented: structural choices, API design, patterns used across the codebase. Add it to the index in `docs/adrs/README.md`.

```markdown
# ADR-{number}: {Title}
**Date:** YYYY-MM-DD
**Status:** Accepted | Implemented | Superseded by ADR-X | Deprecated

## Context
## Decision
## Alternatives Considered
## Consequences
```

When implementation forces a change, add a dated revision note to the ADR (see ADR-005). Don't let code and ADR silently diverge.

### Roadmap

At the end of every session that completes work, update `docs/ROADMAP.md`: `[x]` done, `[-]` partial. It is the single source of truth for progress. Also set the ADR's status in the index.

## Commits

Use conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Body is short bullets. Renames toward the naming rules go in their own `refactor:` commit.

## Releases

Users are told about releases through `src/lib/core/api/services/version/changelog.ts` (ADR-026). A push without a version bump announces nothing. After a successful deploy, CI also posts every entry newer than the latest `v*` git tag to Discord and tags the newest (`scripts/discord-release.ts`), so changelog wording is public.

- Every `feat:` or `fix:` commit a user can notice also edits `changelog.ts` and, when needed, `package.json`, in the same commit. Refactors, docs and tooling don't.
- Check `git diff origin/master -- package.json`:
  - **Unchanged since the last push:** bump `package.json` and open a new entry at the top of `CHANGELOG`. Use minor for anything new, patch for fixes only.
  - **Already bumped:** add your line to the top entry. If a `new` change joins a patch release, raise it to the next minor.
- The top entry's `version` always equals `package.json`. `date` is the day of the push.
- Write for users, not developers: one sentence per change, no ADR numbers, no service names. `kind` is `new`, `improved` or `fixed`.

## Reference only

- Legacy React-era docs and AI-written specs were deleted on 2026-10-10. They're in git at `6be283e:docs/to-be-deleted/` and are outdated: capabilities, IPC, 11 services, camelCase APIs. Don't revive them. The owner's quotes that still matter are in PRINCIPLES. Their ideas are in the legacy gap analysis brainstorm and the ROADMAP.
- Branch `v0-react`: the original React implementation (was `master` until 2026-10-11). It's a source for porting (Tic-Tac-Toe, Profiler), not a design template. `master` is this Svelte version and deploys to GitHub Pages.
