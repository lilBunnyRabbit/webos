# ShellService

Key `shell` · Depends on: `files`, `dialogs`, `notifications` · ADR: [ADR-033](../../adrs/033-shell.md) ([brainstorm](../../brainstorm/2026-10-14_shell-terminal.md)) · Source: `src/lib/core/api/services/shell/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The command system behind the OS shortcuts, the [Terminal](../system-apps.md#terminal) and the launcher's command mode (Mod+K, then `>`; [taskbar](../shell/taskbar.md#start-menu)). It is headless. Services attach commands, Tab completers and value types through their `shell()` hook. The shell parses a line into stages, binds args with zod, and streams structured values through `|`.

| File | Contents |
|------|----------|
| `type.ts` | `ShellService`, `ShellContribution`, `Command`, `CommandContext`, `Value` / `Tagged` / `ValueType`, `Completer`, `ShellSession`, `Entry`, `ShellError` |
| `arg.ts` | `arg.path()`, `arg.app()`, `arg.window()`, `arg.kind(kind)`: zod strings tagged with a completion kind (`meta({ kind })`) |
| `define.ts` | `define_command()`: types `run` from the schema, then erases it |
| `tokenize.ts` | Pure: tokens with positions, quotes, escapes, `|`; `split_stages`; `escape` |
| `parse.ts` | Pure: `fields()` reads a zod object, `resolve()` (longest prefix), `bind()`, `usage()` |
| `pipeline.ts` | `plan()` (line to stages, sudo, typos, group listing) and `run_stages()` (lazy chaining, abort) |
| `values.ts` | Pure: `to_text`, `field_of`, `parse_literal` (units), `compare`, `order_values` |
| `complete.ts` | `complete()`: command names, flags, enum values, kinds, `where` fields |
| `commands.ts` | The shell's own contribution: core commands and verbs |
| `session.svelte.ts` | `Session`: cwd, entries, runs |
| `service.svelte.ts` | Registry, history, sessions, `execute` |

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `commands` | `readonly Command[]` | Every contributed command, sorted by id |
| `find` | `(id) => Command \| undefined` | Exact id (`"win close"`) |
| `value_type` | `(type) => ValueType \| undefined` | Merged across contributions |
| `completer` | `(kind) => Completer \| undefined` | |
| `history` | `readonly string[]` | Shared by every session, oldest first |
| `remember` | `(line) => void` | Trims, skips empty, multi-line and a repeat of the last line, caps at 1000 and saves |
| `session` | `(cwd?) => ShellSession` | A new session; cwd defaults to `/home`. Its lines go into the history |
| `complete` | `(input, cursor, session) => Promise<CompletionResult>` | `{ from, to, items }`: the raw span to replace, values escaped |
| `available` | `(line) => boolean` | The line plans without error and every command's `available()` passes. Shortcuts check it at key time |
| `execute` | `(line) => Promise<Entry>` | Runs in a throwaway session that stays out of the history; a failure becomes an error notification |

### Commands

```ts
define_command({
  id: "cp",                                    // spaces allowed: "win close"
  description: "Copy files and folders",
  args: z.object({
    from: z.array(arg.path()).default([]),     // array positional: the rest, minus what later positionals need
    to: arg.path(),
    recursive: z.boolean().default(false),     // not positional: a flag, --recursive / -r
  }),
  positional: ["from", "to"],
  short: { recursive: "r" },
  yields: "file",                              // lets `where` complete fields after it; "input" for filters
  available: () => true,                       // false or a reason string: hidden from the palette and completion, and running it fails with the reason
  complete: (field, partial) => undefined,     // per-arg override ahead of the kind's completer
  run: async function* ({ args, input, piped, session, signal, elevated }) { … },
});
```

`run` may return a value, a promise of one, or nothing. A sync or async generator streams instead. An array is one value: only generators stream.

`CommandContext`:
- `input`: the previous stage's values (empty for the first stage).
- `piped`: true when a stage came before. `win close` alone closes the focused window, but piped it closes only what came in, even if nothing did.
- `session`: the session the line runs in.
- `signal`: aborts on Ctrl+C or window close.
- `elevated`: true under `sudo`.

Throw `ShellError` for a message the user should read as is. Any other error shows its `message` and is logged.

### Parsing

- **Tokens:** whitespace separates them. `'…'` is literal; inside `"…"` a backslash escapes. Outside quotes `\x` escapes one character. An unquoted `|` separates stages. An unclosed quote runs to the end of the line.
- **Command:** the longest run of leading words (unquoted, not starting with `-`) that is a command id. If none matches but ids start with `word␠`, the line lists that group as `command` values (`win`). Otherwise the error is `unknown command "x". Did you mean …?`, using edit distance.
- **Flags:**
  - `--name`, `--name=value` or `--name value`, with kebab-case mapped to snake_case.
  - `-r`, combined (`-rd5`), or `-d 5`.
  - `--` ends the flags. Quoted tokens and negative numbers are never flags.
- **Positionals:** filled in the order of `positional`. An array field takes the tokens the positionals after it don't need.
- **Coercion:** by the zod base type: numbers with `Number()`, booleans from `true` / `false`. zod then validates and applies defaults.
- **Errors** name the arg, for example `cp: missing to. Usage: cp [from...] <to> [-r|--recursive]`.
- **`sudo`** first in a stage marks that stage elevated. The line asks once through `ConfirmDialog` ("Change system files?", not dismissible) before anything runs.

### Values

```ts
type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
interface Tagged { $type: string; [key: string]: Value }
interface ValueType { columns: string[]; text(value): string; cell?(value, column): string; render?: Component; open?(value): void }
```

Contributions to one `$type` merge field by field. A type counts only once it has `columns` and `text`. That lets files render `file` values while apps opens them.

### Pipes and verbs

Stages are async generators chained lazily, so values stream. A stage that stops reading (`first`) closes the stages before it. Abort makes the run stop waiting at once and closes the generators behind it.

| Verb | Does |
|------|------|
| `where <field> <op> <value>` | `== != > < >= <= =~`. `==`/`!=` compare text forms. Ordering compares numbers with numbers, and a number never orders against a non-number (a folder's `size` is null). `=~` is a case-insensitive contains. Literals: `true false null`, numbers, sizes `1kb 1mb …` (1024-based), durations `30s 5m 2h 2d 1w` meaning "that long ago" |
| `sort [field] [-r]` | Numbers numerically, text naturally, missing last |
| `select <fields…>` | Plain records with only those fields |
| `first [n]` / `last [n]` | Default 1 |
| `count` | One number |
| `get <field>` | The field of each value, dotted paths and list indexes allowed |

Field args are kind `field`. They complete from the columns of the type flowing in, looking back through filters (`yields: "input"`).

### Core commands

`help [command…]` (all commands as values, a group, or one command's usage and flags), `clear`, `history`, `echo`, `sudo`, `kernel`, `services`.

## Contributions

`IService.shell?(): ShellContribution`, built in each service's own `shell.ts`.

### Lazy bodies

`shell.ts` is imported at boot, so it holds only what the shell needs before a command runs: definitions (id, description, args, `positional`, `short`, `yields`, `available()`) and value types' `columns`, `text` and `cell`. When the bodies are worth ≥ 1 KB of the boot chunk, they live in `shell-run.ts` as plain functions taking the service, and `shell.ts` loads it on first use, like an app manifest loads its `shell.ts` (ADR-034):

```ts
const logic = () => import("./shell-run");

define_command({
  id: "ls",
  description: "List a folder",
  args: z.object({ path: arg.path().optional() }),
  positional: ["path"],
  yields: "file",
  async *run(context) {
    yield* (await logic()).ls(files, context);
  },
}),
define_command({ id: "cd", /* … */ run: async (context) => (await logic()).cd(files, context) }),

completers: { [ArgKind.PATH]: async (partial, context) => (await logic()).complete_path(files, partial, context) },
values: { window: { /* columns, text, cell stay here */ open: (value) => void logic().then((m) => m.bring(windows, String(value.id))) } },
```

`available()`, `text` and `cell` stay sync and eager. Helpers other modules import (`file_value`, `is_file_value`, `assert_writable`, `short_id`) stay in `shell.ts`. Split today: files, windows, shortcuts (the cheat-sheet dialog). The others are small enough to keep their bodies inline.

### By service

| Service | Commands | Completers | Value types |
|---------|----------|------------|-------------|
| shell | `help clear history echo sudo where sort select first last count get kernel services` | | `command`, `history`, `service` |
| files | `ls cd pwd cat cp mv rm mkdir touch du df` | `path` | `file`, `storage` |
| apps | `app list` (columns id, name, category, authors), `app info` (with `author`), `app launch`, `open`, `taskbar list`, `taskbar pin`, `taskbar unpin`, `taskbar position`, `taskbar size`, `taskbar autohide`, plus every app's `shell` (ADR-034) | `app` | `app`, `file.open` |
| windows | `win list close focus minimize previous cycle desktop`, plus `maximize snap gather` on desktop | `window` | `window` |
| extract (desktop) | `win pop`, `win back` | | |
| session | `win reopen` | | |
| settings | `theme get`, `theme list`, `theme set`, `theme random`, `theme save`, `theme delete` | `theme` | `theme` |
| notifications | `notify`, `notifications` | | `notification` |
| clipboard | `copy`, `paste` | | |
| version | `version`, `changelog [-c] [--apps]`, `install` | | `release`, `new-app` (click launches) |
| router | `link [id] [-c]` | | |
| backup | `backup create [--files] [--settings] [--apps]`, `backup restore` | | |
| tasks | `task list`, `task cancel`, `task retry`, `task clear` | `task` | `task` |
| ui | `ui launcher`, `ui notifications`, `ui switcher` (mobile) | | |
| shortcuts | `shortcuts`, `shortcuts sheet` | | `shortcut` |

App commands come in through AppsService and carry `app: <id>`. The registry adds them after every service command, so **a service command wins an id clash** and the app's is dropped with a warning. See [manifest](../apps/manifest.md#shell-adr-034). Each app's logic loads lazily from its own `shell.ts`.

| App | Commands | Yields, completers |
|-----|----------|--------------------|
| quick-notes | `quno`, `quno q`, `quno ls`, `quno cat\|ready\|done\|drop\|rm`, `quno t`, `quno t done\|clear`, `quno pin`, `quno t pin` | `note` / `todo` values; `note` completer |
| game-hub | `games`, `games daily`, `games stats` | `game` / `game-daily` values (click launches), stats record |
| solitaire | `solitaire [--draw]`, `solitaire daily [day]`, `solitaire stats` | opens a deal; `solitaire-stats` values |
| nonogram | `nonogram new [--size] [--colour]`, `nonogram daily [day]`, `nonogram edit [path]`, `nonogram check <path>` | opens; `text` verdict |
| minesweeper | `minesweeper daily [day]` | opens the daily board |
| blocks | `blocks daily [day]` | opens the daily sprint |
| nurikabe | `nurikabe daily [day]` | opens the daily puzzle |
| sokoban | `sokoban daily [day]` | opens the daily level |
| letterer | `letterer daily [day]` | opens the daily word |
| pomodoro | `pomo`, `pomo start [task…]`, `pomo pause\|skip\|reset\|status`, `pomo stats`, `pomo pin` | status `text`; `focus-day` values |
| getting-started | `tour [topic]` | none |
| clock | `clock [tab]`, `clock pin [-f]`, `time [zone]`, `alarm ls\|add\|on\|off\|rm`, `timer <duration> [label…]`, `timer ls\|stop` | `alarm` / `timer` values, `text`; `zone` completer |
| time-since | `since`, `since new <name…>`, `since reset\|stop\|start\|rm\|pin <counter>` | `counter` values; `counter` completer |
| work-hours | `wh in [desc…]`, `wh out`, `wh status`, `wh ls [month]`, `wh add <date> <start> <end> [desc…]`, `wh report [month]`, `wh target <hours\|none> [month]` | `workday` values (open → `{ day }`), `text` |
| kanban | `kanban [card]`, `kanban ls [-b] [--due]`, `kanban add <title…> [-c] [-d] [-b]`, `kanban mv <card> <column>`, `kanban done <card>`, `kanban archive [card]` | `card` values (open → `{ board, card }`); `card` completer |
| calendar | `cal [day]`, `cal add <title…> --day [--at] [--until] [--repeat] [--remind]`, `cal agenda [--days N]`, `cal open [date]` | `event` values (open → `{ day }`) |
| soundboard | `sb`, `sb ls [-b]`, `sb play <pad> [-b]`, `sb stop`, `sb add <path…> [-b]` | `pad` values (open plays); `pad` completer |
| recorder | `rec list`, `rec start [-s mic\|screen\|camera]` | `recording` values (open → Media Preview) |
| image-editor | `image edit <path>`, `image convert <path> -f [-q]`, `image resize <path> <w> [h]`, `image rotate <path> <deg>` | `file` |
| image-tools | `image tools [section] [path]`, `image trim [path…] [--alpha]`, `image split <path> -c\|-r <n>`, `image join [path…] [-d row\|column] [-g] [--align] [--fit] [--background] [--opacity]`, `image unbg <path> [-c <hex>…]`, `poster <path> [-x <n>] [--paper a4\|letter\|a3] [--overlap 10mm] [--landscape] [-o]`, `testimg [WxH] [-p pattern] [--pixel] [-f png\|jpeg\|webp\|svg\|bmp] [-q] [--size 2GB] [--label] [--grid] [--plain] [-o]`, `squash <path…> [-f webp\|jpeg] [-q] [--max] [--to]`, `imgdiff <before> <after> [-t tolerance] [--open]` | `file`; `image-diff` values (changed %, regions, dx, dy, scale; open → Compare section, as `--open` does); path completion filtered to images; `testimg` runs as a task and saves to `/home/Pictures`; `squash` takes folders, runs one task per image and writes next to the originals by default; `poster` runs as a task (a map, a task per sheet, then the write) and saves the PDF next to the image |
| archive | `zip [paths…] [--to] [--store]`, `zip list <path>`, `unzip <path> [--to]` | `file`; `zip-entry` values (open → Archive) |
| example | `example task [--fail]`: starts the example background task (about 20 s; `--fail` fails its first run) | |
| diff | `diff <left> <right> [--stat]` | opens Diff; `diff-stat` with `--stat` |
| markdown-pdf | `md2pdf <path> [--template] [--size] [--landscape] [--toc]` | opens and prints |
| pdf-tools | `pdf tools [section] [path]`, `pdf merge <path…> [-o]`, `pdf split <path> [--ranges\|--every] [-d]`, `pdf rotate <path> <deg> [--pages] [-o]`, `pdf pages <path>`, `pdf images <path…> [-o] [--size]`, `pdf export <path> [-f] [--scale] [-d]`, `signature ls`, `testpdf [-n pages] [--page a4\|letter\|a5\|a3\|legal\|mixed\|WxH] [--orientation] [--size 500MB] [--images] [--text] [--grid] [--plain] [-o]` | `file`; `pdf-page` and `signature` values; path completion filtered to PDFs / images; `testpdf` runs as a task and saves to `/home/Documents` |
| hex-viewer | `hexdump <path> [-l\|--length N] [-s\|--offset N]` (256 bytes by default, like `xxd -l -s`) | `hex-row` values (offset, hex, ascii; open → Hex Viewer at that offset) |
| svg-workbench | `svg optimize <path> [-o] [-p precision]`, `svg png <path> [-s size]`, `svg component <path> [-o] [-s size] [--colors]` | `file`; path completion filtered to `.svg`; output next to the SVG (`name.min.svg`, `name-512.png`, `Name.svelte`) under a free name, or `-o` a file to replace or a folder; `component` makes a one-colour SVG follow its `color` prop unless `--colors` |

Window commands accept the first characters of a window id. Their values show 8. With no ids and nothing piped they act on the focused window.

Files:
- Paths resolve with `resolve_path(cwd, typed)` from `files/path.ts`: `~`, `.` and `..`; `..` stops at `/`.
- Path commands take their paths from the args, or else from piped `file` values and strings.
- `cp` and `rm` need `-r` for folders. `mv` / `cp` onto a name that isn't a folder renames (one source only).
- `cat` prints text and yields binaries or anything over 1 MB as a `file` value.
- `mkdir -p` creates parents and accepts existing folders.
- Writes into system folders (`/etc /var /tmp`) and moving or removing locked paths (`is_locked_path`) need `sudo`. `/` is refused even then.

## State

- `history`: `$state.raw<string[]>`.
- The registry: a `$derived` over `kernel.services`. Each contribution is read through `shell()`, and the shell's own contribution is included even before the kernel has registered the shell.
- A session holds `cwd` (`$state`) and `entries` (`$state.raw`). Each entry has `status`, `values` (`$state.raw`, batched every 16 ms) and `error`.

## Lifecycle

- `init()` reads `/var/lib/shell/history`, one line per command.
- History is saved through `LatestWriter` on every `remember`.
- No `destroy`.

## Persistence

| What | Where |
|------|-------|
| Shared history (cap 1000) | OPFS `/var/lib/shell/history` |

## Known gaps

- No background jobs, variables, globs or chaining (ADR-033, deferred).
- App commands are global only; window-scoped ones (in-app shortcuts as commands) are deferred (ADR-034).
- `touch` on an existing file doesn't update its modified time.
