# Quick Notes

**Date:** 2026-10-14
**Participants:** owner, Claude

## Context

ADR-009 lists Quick Notes (chronological notes, markdown, checkboxes, tags, search, export, AppDataHandle). The app-candidates log (2026-10-12) flagged two things: "quno" now names the owner's Go CLI, so the app needs its own name, and notes as `.md` files in `/home/Notes` is the OS-native answer.

The owner asked to use the quno CLI (`~/dev/orgs/lilbunnyrabbit/quno`) as inspiration, not a 1:1 port. What quno is today:

- **Capture costs one line, from anywhere.** `quno q <idea>` and `quno t <todo>` from any cwd; the context is stamped for you (date, repo, branch, `#project` tag from the cwd).
- **Plain markdown vault.** `todo.md` is a flat `- [ ]` list; each quest is one `.md` file with frontmatter. Obsidian opens the same files. No database.
- **Notes have a lifecycle.** Status is the phase: `raw ready investigating proposed adr in-progress done dropped`. `parse` triages raw captures.
- **Short ids.** 7 hex, git style, any unique 3+ prefix, slug or title substring resolves a note.
- **Composable CLI.** `ls` (one line each, `-s` filter, `--porcelain`), `cat <id> [section]` to pipe one section out, `drop` vs `rm`.
- **TUI.** Two tabs (Todo, Quests), keyboard first (`j/k`, `space`, `n`, `d`, `c`, `/`), mouse too.
- **History outside the vault.** `sync` commits into a bare git dir elsewhere; `snapshot` makes encrypted (age) bundles.

## Idea pool (WebOS translation)

1. **Capture from anywhere.** `note <text>` / `todo <text>` in the Terminal and in the Mod+K `>` palette, plus a global shortcut that opens a one-line capture popover without opening a window. The heart of quno.
2. **Context stamp.** quno stamps repo and branch; WebOS stamps the focused window: app, and its file path if it has one. The note links back; clicking reopens that file.
3. **Plain files.** `/home/Notes/*.md` and `/home/Notes/todo.md`. Text Editor, Explorer, `cat`, `grep`-style shell all work on them for free. No AppDataHandle gate.
4. **Shell values.** `notes` yields `columns` → `where tag == work`, `sort`, click opens. `todo done 3`, `todo clear`.
5. **Short ids + prefix resolve**, like quno, for shell args, with a completer.
6. **Lifecycle lite.** `raw → ready → done | dropped`, and an Inbox view for triaging raw captures.
7. **Tabs like the TUI.** Todo | Notes, same keys.
8. **Wikilinks and backlinks** (`[[note]]`), Obsidian-compatible.
9. **Sticky notes.** Pin a note to the desktop as a small always-visible window or desktop tile.
10. **Tray / taskbar badge** with the open todo count.
11. **Reminders.** `todo call bob @17:00` fires a notification (only while WebOS is open).
12. **History.** Per-note revisions under `/var/lib/notes/`, or export the whole folder as one bundle.
13. **Mount the real vault (stretch).** `showDirectoryPicker()` on `~/dev/docs`: WebOS and the CLI edit the same files. This is a Files-service mount concept, so it's its own architecture topic.

## Decisions

1. **Commands are app commands, and Quick Notes is their first consumer.** It builds ROADMAP "App-registered commands": `define_app` gains commands, the shell registers them. The shape is its own grill (below). It was picked over a `notes` kernel service, because a service for one user app is wrong, and over "no commands", because that loses the one-line capture.
2. **Storage is plain `.md` in `/home/Notes`.** One file per note with small frontmatter (`id`, `status`, `tags`, `from`); `todo.md` is `- [ ]` lines. Text Editor, Explorer and `cat` work on them, and the vault shape matches quno and Obsidian. The cost: the list reads every file, so an index cache comes later if that's slow.
3. **v1 scope is everything:** the capture popover and the stamp, tabs with the lifecycle and inbox, shell values and ids, stickies, the todo badge and wikilinks. It ships in slices.
4. **Name: Quick Notes**, id `quick-notes` (ADR-009 name).
5. **Apps declare commands with a `shell` field on `define_app`.** It takes the same `ShellContribution` shape that services return. AppsService merges every app's field into its own `shell()`, so ShellService doesn't change. Ids, args and descriptions load eagerly so the palette can list them; each `run()` dynamic-imports its logic. The cost: every app's zod schemas sit in the boot bundle. Rejected: a lazy `shell: () => import()`, because every module loads at boot anyway, and a convention `shell.ts` glob, which would be a second, implicit discovery path.
6. **App command ids are free, and the OS wins a clash.** `note`, `todo` and `notes` read like quno. If an app command collides with a service command, the service keeps the id and the app's command is dropped with a warning. Rejected: a forced `quick-notes …` prefix, which kills one-line capture.
7. **Window-scoped app commands come later.** Quick Notes needs only global ones. Paint and Nonogram shortcuts moving to commands stays on the roadmap with its own grill.
8. **The capture shortcut is Alt+Shift+Q, mapped to `note`.** It's an OS default in `shortcuts/defaults.ts`. `note` with no text opens the capture dialog (a system-level `dialogs.show`). Mod+Shift+N was rejected because Chrome takes it.
9. **Todos live in one `todo.md` of `- [ ]` lines**, with `#tag` inline and the index taken from line order, like quno.
10. **Statuses:** `raw → ready → done | dropped`. A capture lands as `raw`, and the Inbox shows `raw`. `dropped` is a soft delete; `rm` is the hard one.
11. **Stickies are a desktop widget layer.** Notes sit on the desktop surface, below windows, and the app renders them. The owner picked this over a small window and over a PINNED window flag. Shape (third round):
    - A widget is a `.widget` file in `/home/Desktop` holding JSON `{ app, props, w, h }`, with a new `DesktopItem` kind `widget` that spans w×h cells. The manifest gains `widget?: () => import("./widget.svelte")`. It follows ADR-022 (the desktop is a folder), so Explorer deletes, moves and renames widgets for free. The cost: grid occupancy, drag and collision have to handle items that span cells. Rejected: `widgets` in `layout.json`, which Explorer and the shell can't see and which would be a second item model, and "a note `.md` on the Desktop becomes a sticky", which is magic.
    - **Hidden on mobile in v1.** Home pages flow with no gaps, and spanning tiles break that.
12. **The badge goes on the manifest.** It's reactive and shows even while the app is closed (start menu, desktop icon, mobile tiles). Shape (third round):
    - **A sync function:** `badge?: () => number | null`, called inside the shell UI's `$derived`.
    - **Owner's note:** "trigger the badge check AND open some sort of event check when the app is shown on either desktop, taskbar or the list". The badge does no work until an icon for the app is on screen (desktop, a taskbar button, the start menu or app drawer list, mobile tiles), and it stops listening once none is.
    - **How:** Svelte's `createSubscriber` (`svelte/reactivity`) gives exactly that. The app's badge store starts reading `todo.md` and tracking `files.revision("/home/Notes")` when the first effect reads it, and tears down when the last one goes away. There's no polling and no boot cost.
    - **Rejected:** a lazy `badge: () => import()` module that AppsService loads at boot, which would run app code for every badge app even when no icon is visible.
13. **Commands, the full set:**

    | Command | What it does |
    |---|---|
    | `note [text…]` | Captures and yields the new `note`. With no text it opens the capture dialog. |
    | `notes [-s status] [-a]` | Yields `note` values: `id status title tags created`. Open goes to Quick Notes. |
    | `note cat <note>` | Prints the note. |
    | `note done <note>` | Sets `done`. |
    | `note drop <note>` | Sets `dropped`. |
    | `note rm <note>` | Deletes the file. |
    | `todo [text…]` | Adds a todo. With no text it yields `todo` values: `n done text tags`; open toggles. |
    | `todo done <n>` | Checks off todo `n`. |
    | `todo clear [-a]` | Removes checked todos (`-a`: all). |

    Completer kind `note`: id prefix, with the title as the detail. A note resolves the quno way: id prefix (3+), then a title substring.

## Key takeaways

- Quick Notes is the first consumer of three app extension points: `shell`, `badge` and `widget` on `define_app`. These are recorded in [ADR-034](../adrs/034-app-extension-points.md).
- The quno soul to keep is "capture costs one line, from anywhere, with context stamped for you". Everything else serves it.

## Action items

1. App commands: `shell` on `define_app`, merged by AppsService, OS wins clashes.
2. Quick Notes core: `/home/Notes` storage, ids, the app (Todo | Notes | Inbox tabs), commands, `note` / `todo` values, the completer, the capture dialog with the stamp, Alt+Shift+Q.
3. Manifest badge (`createSubscriber`), shown on desktop icons, taskbar buttons, the start menu and mobile tiles.
4. Desktop widgets: `.widget` files, multi-cell grid, the Quick Notes sticky.
5. Wikilinks and backlinks.

## Next session topics

- App-registered commands, if Quick Notes becomes their first consumer.
