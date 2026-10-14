# Shell, terminal and command palette (block 5)

**Date:** 2026-10-14
**Participants:** owner, Claude

## Context

Block 5: ShellService, Terminal app, command palette (ADR-007, written 2026-01-31, never built). Owner: "go deep with the terminal ... all nicely modular by attaching to services. the whole package. not just a dumb terminal mimic".

Today: no `shell` service, no terminal app, nothing to port from `v0-react`. ADR-007 is a flat command dispatcher: one structured result per command, no pipes, no jobs. Mod+K opens the app launcher (name search only). Shortcuts use a central `defaults.ts` + `register()` disposer. Tasks (ADR-013) is parked; `@lilbunnyrabbit/task-manager` 1.0.1 has statuses `idle | in-progress | error | success` and no cancel or AbortSignal.

The owner's ask contradicts ADR-007 on pipes, output and jobs, so this rewrites ADR-007.

## Topics

### Round 1: core model

- **Attach:** service declares, shell collects. Optional `commands()` on IService; ShellService (registered last) collects from every kernel service at init. A swapped service (mobile windows) brings its own commands. `register()` with disposer for apps and runtime additions.
- **Pipes:** structured values (nushell / PowerShell style). Commands produce typed values; `|` passes values; generic verbs (`where`, `sort`, `select`, `first`, `count`) work on any list; the terminal renders values richly (tables, clickable files). Text is a string value.
- **Execution:** stream + AbortSignal, no background. Output streams as produced; Ctrl+C and window close abort. Owner: "no background for now but write jobs on roadmap - i still need use case for it". Tasks stays parked.
- **Session:** a `ShellSession` object owned by ShellService (cwd, env, history, entries). Terminal window owns one, the palette a throwaway one. Commands mutate it via `ctx.session` (`cd`, `clear`).

### Round 2: commands, completion, values

Owner mid-round: "also i want tab completion!"

- **Args:** one zod object per command (zod is already approved, used for app props), `positional` names the order, `short` maps flag letters. Kind tags (`arg.path()`, `arg.app()`, `arg.window()`) tell completion and help what an arg is. Shell coerces tokens, zod validates. Risk taken: help and completion walk zod internals.
- **Completion source:** kinds + per-arg override. Services contribute completers by kind (files gives `path`, apps `app`, windows `window`); an arg tagged with a kind completes for free; a command can pass its own `complete()`. Command names, flags and enum values complete from the schema.
- **Completion UI:** fish-style. Ghost text as you type (history first, then the top completion), Right arrow accepts. Tab: one match completes; several fill the common prefix and open a popup with descriptions.
- **Values:** plain JSON (string, number, bool, list, record) plus tagged domain values (`$type: "file" | "window" | "app" | ...`). The owning service contributes each type's renderer, table columns and actions (click opens). Lists of records render as tables. Persisted history keeps only the text form.

### Round 3: hook, naming, palette, persistence

- **Hook:** one optional `shell?(): ShellContribution` on IService returning `{ commands, completers, values }`, built in each service's own `shell.ts`. Swapped services bring their own. The shell collects at init. Accepted cost: the kernel contract learns about one feature service.
- **Naming:** Unix verbs for files (`ls cd cat cp mv rm mkdir touch`, `open`) plus noun groups for domains (`win list|close|focus`, `app list|info`, `theme get|set`, `notify`). A group alone prints its members. Ids with spaces, longest-prefix match (kept from ADR-007).
- **Palette:** Mod+K becomes one palette. Apps first as today; `>` switches to commands. A command with args steps through them using the same completers. The mobile drawer stays the drawer.
- **Persistence:** history shared by all terminals in OPFS `/var/lib/shell/history` (capped, duplicates collapsed). Each terminal window saves cwd and scrollback (text form, capped) through `storage.window()`, so session restore brings it back.

### Round 4: language, apps, safety, mobile

- **Language:** pipes only. No variables, `$(…)`, globs, `;`/`&&`, aliases or script files. `~` stays as part of path resolution (path kind), not general expansion.
- **App commands:** not in block 5. Only services contribute. Roadmap item.
- **Safety:** `sudo` unlocks with a dialog. System folders are read-only to the terminal, as in Explorer; prefixing `sudo` asks for confirmation through a system dialog and then allows the write. Chosen over plain "read-only, no override" (cannot repair `/etc` from the shell) and "anything goes".
- **Mobile:** full terminal plus a key row above the soft keyboard (Tab, Esc, Ctrl, arrows, `|`, `~`, `/`). Completion popup and values are tappable.

### Round 5: shortcuts, filters, scope

- **Shortcuts run commands.** OS actions become commands; a KeyShortcut names a command (`command: "win close"`) instead of `run`. The palette lists commands only, showing bound keys. Revises ADR-012/017 defaults. Follow-ups in round 6.
- **Filters:** `where <field> <op> <value>`, ops `== != > < >= <= =~`, units for sizes and times (`1mb`, `2d`). Completion knows fields from the value type's columns. AND = chain `where`s; no OR. Owner: "add expression lang to roadmap".
- **Scope:** all four groups ship. Core + verbs (help, clear, history, echo, sudo; where, sort, select, first, last, count, get), files (ls, cd, pwd, cat, cp, mv, rm, mkdir, touch, open, du, df), windows + apps (win list|close|focus|minimize|maximize|snap, app list|info|launch), system (theme get|set, notify, copy, paste, kernel, services, version, changelog, link).

### Round 6: shortcut shape, collection order

- **KeyShortcut:** `command` or `run`. Global OS shortcuts name a command; window-scoped app shortcuts (Paint, Text Editor, six puzzles) keep `run` until app commands exist. `when` moves onto the command as `available()`, which the palette also uses to hide entries.
- **Order:** the shell collects reactively. Contributions are a `$derived` over `kernel.services` (a SvelteMap), so a service initialised later still shows up and shortcuts can depend on `shell` normally. Accepted risk: a service's commands exist only after its init.

## Key takeaways

- ADR-007's dispatcher becomes a structured-value shell: services contribute commands, completers and value types through one `shell()` hook; values flow through pipes and render richly.
- Deliberately small language: pipes and `where` only. Variables, globs, chaining, scripts, background jobs, app commands and filter expressions are roadmap items waiting on use cases.
- One command registry drives the terminal, the Mod+K palette and the OS shortcuts.
- Decision recorded in [ADR-033](../adrs/033-shell.md), superseding ADR-007.

## Action items

- [x] ADR-033, ADR-007 superseded, ADR-002 and ADR-012 revisions
- [x] ROADMAP: background jobs (`&`, `jobs`, `kill`) as a separate unstarted item, waiting on a use case
- [x] ROADMAP: `where` expression language (OR, grouping)
- [x] ROADMAP: app-registered commands (window-scoped via app context), not in block 5
- [x] ROADMAP: shell language beyond pipes (vars, globs, chaining, scripts), waiting on a use case

## Next session topics

- Background jobs and Tasks (ADR-013) once a use case shows up.
- App-registered commands, which would let the remaining window shortcuts become commands too.
