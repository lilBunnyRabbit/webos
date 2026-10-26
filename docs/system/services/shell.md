# ShellService

Key `shell` · Depends on: `files`, `dialogs`, `notifications` · ADR: [ADR-033](../../adrs/033-shell.md) ([brainstorm](../../brainstorm/2026-10-14_shell-terminal.md)) · Source: `src/lib/core/api/services/shell/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The command system behind the OS shortcuts, the [Terminal](../system-apps.md#terminal) and the launcher's command mode (Mod+K, then `>`; [taskbar](../shell/taskbar.md#start-menu)). It is headless. Services attach commands, Tab completers and value types through their `shell()` hook. The shell parses a line into stages, binds args with zod, and streams structured values through `|`.

| File | Contents |
|------|----------|
| `type.ts` | `ShellService`, `ShellContribution`, `Command`, `CommandContext`, `Value` / `Tagged` / `ValueType`, `Completer`, `ShellSession`, `Entry`, `ShellError` |
| `arg.ts` | `arg.path()`, `arg.app()`, `arg.window()`, `arg.task()`, `arg.job()`, `arg.when()`, `arg.kind(kind)`: zod strings tagged with a completion kind (`meta({ kind })`) |
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
| `commands` | `readonly Command[]` | Every contributed command, sorted by id. The apps' only once `load()` has resolved |
| `loaded` | `boolean` (`$state`) | Whether the contributions' `lazy` parts are in |
| `load` | `() => Promise<void>` | Resolves every contribution's `lazy` once, through one shared promise. A run and `complete` await it; Terminal, the palette, `ShortcutsService.list()` and App Library's details call it when they open ([lazy parts](#lazy-parts)) |
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
  ai: "read",                                  // offered to Ask's assistant (ADR-054): only for commands that change nothing
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

`ai: "read"` makes a command eligible for Ask's assistant (ADR-054). The user still switches it on in Ask; the model picks by `usage()` plus `description`, so the description should say what data comes back, naming the app. Never on a command that writes, prints, opens a dialog or launches anything. Tagged today: `app find`, `cal`, `cal agenda`, `quno ls`, `kanban ls`, `wh status`, `wh ls`, `since`, `list ls`, `list items`. A browser test (`ask/catalogue.browser.test.ts`) keeps all of them under 4,000 characters.

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

`compat` yields one `compat` value per entry of the browser support list (ADR-067, [compat](../compat.md)): `feature`, `level` (`start` `shell` `apps` `cosmetic`), `status` (`ok`, `missing`, `outdated`), `apps` (display names) and `min` ("Chrome 129, Firefox 147, Safari 26"), plus `id`. It runs every probe in the live page and is never scoped to a solo app. Its body imports `core/compat/report.ts` on first run, so the list stays out of the `core` chunk. `compat | where status != ok` lists what this browser lacks.

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

### Lazy parts

A contribution can hold back part of itself: `lazy?: () => Promise<ShellContribution>`. The shell calls it once, the first time it needs every command, and merges what it resolves to with the rest. AppsService puts the apps' commands there (ADR-034 revision, 2026-10-17): each manifest's `shell` is `() => import("./commands")`, and its `lazy` loads every app's module in parallel (`allSettled`: an app whose module fails loses only its own commands).

- **What triggers it.** `load()` is one shared promise. A session run awaits it before planning, so a line typed, pasted, run from the palette, a shortcut or Getting started finds app commands. `complete()` awaits it. Terminal, the palette (with a "Loading commands…" row until it's in), `ShortcutsService.list()` (cheat sheet, Settings, palette key hints) and App Library's details call it when they open.
- **Shortcuts.** A key bound to a command the shell doesn't know yet (`quno q` before the apps load) is held: the dispatcher prevents its default, awaits `load()`, then picks the shortcut again. A known command that's unavailable leaves its key alone, as before.
- **Values.** App value types only show on values app commands yield, and those run after `load()`.
- **Merge order.** Lazy parts merge first, so a service's completers and values win a clash with an app's, and the command pass still adds app commands after every service command.

### By service

| Service | Commands | Completers | Value types |
|---------|----------|------------|-------------|
| shell | `help clear history echo sudo where sort select first last count get kernel services compat` | | `command`, `history`, `service`, `compat` |
| files | `ls cd pwd cat cp mv rm mkdir touch du [-d N] df mount umount mounts`, `rename <pattern> [paths…] [--find] [--replace] [--match-case] [--start] [--step] [--dry]` (piped files; `--dry` previews) | `path` | `file`, `rename`, `storage`, `mount` |
| apps | `app list` (columns id, name, category, authors), `app info` (with `author`), `app launch`, `app find <words…>` (`ai: "read"`; strict then sentence search over every app, at most 10), `app recent` (yields `app` values, newest first; `--clear` forgets them), `open`, `taskbar list`, `taskbar pin`, `taskbar unpin`, `taskbar position`, `taskbar size`, `taskbar autohide`, `taskbar seconds`, plus every app's `shell` (ADR-034) | `app` (open: launch, or the App Library for an app that isn't installed) | `app`, `file.open` |
| windows | `win list close focus minimize previous cycle desktop`, plus `maximize snap gather` on desktop | `window` | `window` |
| extract (desktop) | `win pop`, `win back` | | |
| session | `win reopen` | | |
| settings | `theme get`, `theme list`, `theme set`, `theme random`, `theme save`, `theme delete` | `theme` | `theme` |
| notifications | `notify`, `notifications` | | `notification` |
| clipboard | `copy`, `paste` | | |
| version | `version`, `changelog [-c] [--apps]`, `install`, `ci status` | | `release`, `new-app` (click launches), `ci-job` (click opens the job on GitHub) |
| router | `link [id] [-c] [-s]` | | |
| backup | `backup create [--files] [--settings] [--apps]`, `backup restore` | | |
| tasks | `task list`, `task cancel`, `task retry`, `task clear` | `task` | `task` |
| scheduler | `sched ls [app]` (yields `job` values, soonest first), `sched rm <job>` | `job`, `when` | `job` (click opens the job's `open` target, else its app) |
| ai | `summarize [--type tldr\|key-points\|teaser\|headline] [--length short\|medium\|long]`, `translate --to <lang> [--from <lang>]`, `lang`; each hidden where its feature answers `no` (ADR-046) | `language` | `language` |
| speech | `say [text…]` (words, piped text, or piped files; all `.md` files read as markdown), `speech stop`; hidden where the browser can't speak (ADR-074) | | |
| ui | `ui launcher`, `ui notifications`, `ui switcher` (mobile) | | |
| shortcuts | `shortcuts`, `shortcuts sheet` | | `shortcut` |

App commands come in through AppsService and carry `app: <id>`. The registry adds them after every service command, so **a service command wins an id clash** and the app's is dropped with a warning. See [manifest](../apps/manifest.md#shell-adr-034). The definitions load on first use from each app's `commands.ts` ([lazy parts](#lazy-parts)); the logic loads on first run from its own `shell.ts`.

| App | Commands | Yields, completers |
|-----|----------|--------------------|
| quick-notes | `quno`, `quno q`, `quno ls`, `quno cat\|ready\|done\|drop\|rm`, `quno t`, `quno t done\|clear`, `quno pin`, `quno t pin` | `note` / `todo` values; `note` completer |
| game-hub | `games`, `games daily`, `games stats` | `game` / `game-daily` values (click launches; a per-mode daily is one row per mode, ADR-050), stats record |
| solitaire | `solitaire [--draw]`, `solitaire daily [day]`, `solitaire stats` | opens a deal; `solitaire-stats` values |
| nonogram | `nonogram new [--size] [--colour]`, `nonogram daily [day]`, `nonogram edit [path]`, `nonogram check <path>` | opens; `text` verdict |
| minesweeper | `minesweeper daily [day]` | opens the daily board |
| blocks | `blocks daily [day]` | opens the daily sprint |
| nurikabe | `nurikabe daily [day]` | opens the daily puzzle |
| sokoban | `sokoban daily [day]` | opens the daily level |
| letterer | `letterer daily [day]` | opens the daily word |
| pomodoro | `pomo`, `pomo start [task…]`, `pomo pause\|skip\|reset\|status`, `pomo stats`, `pomo pin` | status `text`; `focus-day` values; `pomo start`, `pomo skip` and `pomo pause` are the phase notification's buttons |
| getting-started | `tour [topic]` | none |
| docs | `docs [topic…]`: opens Docs at a page id or short name (`docs windows`, `docs adr 47`, `docs persistence#storage-map`); an unknown topic fails with near names | completion over short names, page ids and aliases ([Docs](../system-apps.md#docs)) |
| settings | `settings [setting]`: opens Settings at a page (`settings wallpaper`) or a setting, which it scrolls to and rings (`settings text-size`); an unknown id fails with suggestions | `setting` completer: ids from Settings' search index (pages and settings, platform-filtered) with label and place ([Settings](../system-apps.md#settings)) |
| clock | `clock [tab]`, `clock pin [-f]`, `time [zone]`, `alarm ls\|add\|on\|off\|rm`, `alarm snooze <alarm> [duration]` (default `10m`), `alarm stop <alarm>`, `timer <duration> [label…]`, `timer ls\|restart\|stop` | `alarm` / `timer` values, `text`; `zone` completer. Alarms and timers are scheduler jobs; `alarm snooze\|stop` and `timer restart\|stop` are their notification buttons |
| portfolio | `whoami`, `portfolio [section]` (opens Portfolio at `who`, `work`, `projects`, `how` or `contact`, or brings an open one forward; the in-app terminal's own commands, such as `mail`, aren't shell commands) | `profile` values (name, role, email, github, linkedin; open → Portfolio) |
| time-since | `since`, `since new <name…>`, `since reset\|stop\|start\|rm\|pin <counter>` | `counter` values; `counter` completer |
| work-hours | `wh in [desc…]`, `wh out`, `wh status`, `wh ls [month]`, `wh add <date> <start> <end> [desc…]`, `wh report [month]`, `wh target <hours\|none> [month]` | `workday` values (open → `{ day }`), `text` |
| kanban | `kanban [card]`, `kanban ls [-b] [--due]`, `kanban add <title…> [-c] [-d] [-b]`, `kanban mv <card> <column> [-b]`, `kanban done <card>`, `kanban archive [card]`; with `-b` on a folder board, `ls` lists its files, `mv` rewrites one file's column field (card by title or file name) and `add` writes a new file from the board's template | `card` values (`path` set for a folder board's file; open → `{ board, card }`, or the file in Text Editor); `card` completer |
| shopping-list | `list ls`, `list items [list]` (both `ai: "read"`) | `shopping-list` values (name, left, in_cart; open → `{ list }`), `shopping-item` values (list, amount, item, in_cart; open → its list) |
| ask | `ask <question…>`: picks one switched-on read command with Gemini Nano, runs it and answers from its output; piped input becomes the data instead. Hidden when chat is `no` | text |
| calendar | `cal [day]`, `cal add <title…> --day [--at] [--until] [--repeat] [--remind]`, `cal agenda [--days N]`, `cal open [date]` | `event` values (open → `{ day }`) |
| soundboard | `sb`, `sb ls [-b]`, `sb play <pad> [-b]`, `sb stop`, `sb add <path…> [-b]` | `pad` values (open plays); `pad` completer |
| recorder | `rec list`, `rec start [-s mic\|screen\|camera]` | `recording` values (open → Media Preview) |
| moonrabbit | `journal lock`: locks every unlocked journal in the tab. Nothing reads or adds entries: Terminal history is plain text (ADR-063) | `text` |
| video-tools | `video trim <path> [--from S] [--to S] [-q low\|medium\|high] [--mute] [-o]`, `video gif <path> [--from S] [--to S] [--fps 5–30] [-w px] [--plain] [-o]`, `video audio <path> [--from S] [--to S] [-o]` | `file`; times in seconds or m:ss; path completion filtered to videos; each runs as a task that plays the part once in a detached `<video>` (real-time speed) and writes WebM (VP9/VP8 + Opus) or GIF next to the video, or `-o` file or folder |
| image-editor | `image edit <path>`, `image convert <path> -f [-q]`, `image resize <path> <w> [h]`, `image rotate <path> <deg>` | `file` |
| image-tools | `image tools [section] [path]`, `image trim [path…] [--alpha]`, `image split <path> -c\|-r <n>`, `image join [path…] [-d row\|column] [-g] [--align] [--fit] [--background] [--opacity]`, `image unbg <path> [-c <hex>…]`, `poster <path> [-x <n>] [--paper a4\|letter\|a3] [--overlap 10mm] [--landscape] [-o]`, `testimg [WxH] [-p pattern] [--pixel] [-f png\|jpeg\|webp\|svg\|bmp] [-q] [--size 2GB] [--label] [--grid] [--plain] [-o]`, `squash <path…> [-f webp\|jpeg] [-q] [--max] [--to] [--under <size>] [--floor]`, `image fit <path> <size> [-f keep\|jpeg\|webp\|avif\|jxl] [--max]`, `image convert-all <path> [--zip]`, `imgdiff <before> <after> [-t tolerance] [--open]` | `file`; `image-diff` values (changed %, regions, dx, dy, scale; open → Compare section, as `--open` does); path completion filtered to images; `testimg` runs as a task and saves to `/home/Pictures`; `squash` takes folders, runs one task per image and writes next to the originals by default, and with `--under` fits each copy under the size (`-q` the highest quality tried, `--floor` the lowest); `image fit` runs the same search as the Fit section as a task and refuses to write a copy that doesn't fit; `image convert-all` runs one task with a sub-task per format and writes a `{stem}-formats` folder (or a zip with `--zip`); `poster` runs as a task (a map, a task per sheet, then the write) and saves the PDF next to the image |
| format-lab | `convert <path…> --to avif\|jxl\|webp\|jpeg\|png [-q 1–100] [-o dir]` | `file`; path completion filtered to images; folders convert every image in them; runs as a task, one task per file, one file at a time; writes `name.ext` beside the source or into `--out` under a free name (`name (1).ext`), never over a file; `--quality` defaults per format (JPEG 82, WebP 80, AVIF 60, JPEG XL 75), PNG is lossless |
| icon-pack | `icons <path> [--bg #rrggbb\|transparent] [--padding 10%] [--to dir]` | `file` (the zip, next to the image by default: favicons, app icons, a social card, manifest and head tags); path completion filtered to images; SVG warnings (blank, external files, fonts) go to a notification |
| archive | `zip [paths…] [--to] [--store]`, `zip list <path>`, `unzip <path> [--to]` | `file`; `zip-entry` values (open → Archive) |
| example | `example task [--fail]`: starts the example background task (about 20 s; `--fail` fails its first run) | |
| diff | `diff <left> <right> [--stat]` | opens Diff; `diff-stat` with `--stat` |
| markdown-pdf | `md2pdf <path> [--template] [--size] [--landscape] [--toc]` | opens and prints |
| pdf-tools | `pdf tools [section] [path]`, `pdf merge <path…> [-o]`, `pdf split <path> [--ranges\|--every] [-d]`, `pdf rotate <path> <deg> [--pages] [-o]`, `pdf pages <path>`, `pdf images <path…> [-o] [--size]`, `pdf export <path> [-f] [--scale] [-d]`, `signature ls`, `testpdf [-n pages] [--page a4\|letter\|a5\|a3\|legal\|mixed\|WxH] [--orientation] [--size 500MB] [--images] [--text] [--grid] [--plain] [-o]` | `file`; `pdf-page` and `signature` values; path completion filtered to PDFs / images; `testpdf` runs as a task and saves to `/home/Documents` |
| hex-viewer | `hexdump <path> [-l\|--length N] [-s\|--offset N]` (256 bytes by default, like `xxd -l -s`), `file [paths…] [--scan]` (type by magic bytes, text encoding and line endings, Shannon entropy; `--scan` lists embedded signatures by offset) | `hex-row` values (offset, hex, ascii; open → Hex Viewer at that offset); `file-type` values (name, type, details, size, entropy; open → Hex Viewer); `file-hit` values with `--scan` (name, offset, type, details; open → Hex Viewer at that offset) |
| metadata | `meta <paths…>`, `meta strip <paths…> [--keep-orientation]` | `meta` values (name, format, camera, date, gps, size; open → Metadata); `file` from `meta strip`; path completion filtered to JPEG, PNG, WebP and PDF |
| api-client | `wget <url> [--to dir] [-o name]`, `http <method> <url> [-H "K: V"…] [-d body] [-o path]` | `wget` and `http -o` run the download as a task and yield the `file` (name from Content-Disposition or the URL, never over an existing file); `http` otherwise yields the status line and the body as text (JSON pretty-printed); method completion |
| recipe-box | `recipe scale <path> <servings> [-u metric\|imperial]`, `recipe timer stop <timer>` | `ingredient` values (amount, name, note; open → Recipe Box), the recipe's list scaled to the servings (a recipe without `servings` counts as 1) and converted with `-u`; path completion filtered to `.cook`. `recipe timer stop` (shown while Recipe Box has a timer) cancels or clears a cook timer by id, id prefix or name; it's the cook timer notification's Stop button |
| dev-tools | `jwt [token] [-s secret]`, `ts [value…] [-z zone]`, `cron [expr…] [-n N]`, `cert [path…]`, `b64 [text…] [-d] [-u]`, `hash [path\|text…] [-a sha1\|sha256\|sha384\|sha512]`, `uuid [-n N] [-v v4\|v7]`. With no positional, each reads what's piped in: text, or `file` values (`cert`, `hash`, `b64` read the file's bytes) | Plain records: `jwt` (status, signature, time claims, header, payload), `ts` (unix, ms, iso, utc, zone, local, weekday, relative), `cert` (subject, issuer, validity, names, key, fingerprints), `hash` (algorithm, hash, of), `cron` runs (at, in, iso) after a text description; `b64` and `uuid` yield text |
| qr-studio | `qr [text…] [-e L\|M\|Q\|H] [-o out.png\|out.svg\|folder]` | `file`; text from the args or piped strings; ECC M by default; writes `qr.png` (free name) in the current folder unless `-o` names a .png, .svg or a folder |
| web-app | `webapp add <url> [-n\|--name]`: writes `{name}.webapp` to `/home/Desktop` | `file` |
| svg-workbench | `svg optimize <path> [-o] [-p precision]`, `svg png <path> [-s size]`, `svg component <path> [-o] [-s size] [--colors]` | `file`; path completion filtered to `.svg`; output next to the SVG (`name.min.svg`, `name-512.png`, `Name.svelte`) under a free name, or `-o` a file to replace or a folder; `component` makes a one-colour SVG follow its `color` prop unless `--colors` |
| gw2 | `gw2 daily`: today's Wizard's Vault objectives, with the key saved in GW2 Tracker | `gw2-objective` values (name, progress, done; open → GW2 Tracker) |
| hid-lab | `hid ls` (unavailable without WebHID) | `hid-device` values (name, ids, usage, collections, opened; open → Keyboard & HID Lab, HID section) |
| forms | `form link <path> [-c]`, `form answer <code>` | `link`: the form's solo link as `text` (`-c` copies it too), stamping the form id into the file first; path completion filtered to `.form.md`. `answer`: saves an answer code (or old answer link) beside its form, found by id under `/home`, and says where |
| algorithms | `algo list [group]`, `algo <id> [input…]` | `algorithm` values (id, group, average, space; open → Algorithms on it); `algo` checks the input against the algorithm's parser before launching with `{ section, input }`; id completion from the catalog |
| warren | `doc count <path>`, `doc export <path> --docx` or `--md` | `doc-count` values (name, words, characters; open → Warren); `doc export` yields the `file` written beside the document (`name.docx` or `name.md`, a free name when taken; exactly one format); both read the `.warren` JSON without loading the editor; path completion filtered to `.warren` |

Window commands accept the first characters of a window id. Their values show 8. With no ids and nothing piped they act on the focused window.

Files:
- Paths resolve with `resolve_path(cwd, typed)` from `files/path.ts`: `~`, `.` and `..`; `..` stops at `/`.
- Path commands take their paths from the args, or else from piped `file` values and strings.
- `cp` and `rm` need `-r` for folders. `mv` / `cp` onto a name that isn't a folder renames (one source only).
- `rm` under `/mnt` also needs `-f`: it deletes from the real disk, with no undo (ADR-044). Nothing can be created directly in `/mnt`.
- `mount` opens the browser's folder chooser from the Enter keypress and yields the new `/mnt/<name>` (hidden where there's no `showDirectoryPicker`). `umount <path>` forgets a mount, leaving the folder on the disk; a session inside it moves to `~`. `mounts` yields `mount` values: `path`, `state` (`connected` or `locked`).
- `cat` prints text and yields binaries or anything over 1 MB as a `file` value.
- `mkdir -p` creates parents and accepts existing folders.
- Writes into system folders (`/etc /var /tmp`) and moving or removing locked paths (`is_locked_path`) need `sudo`. `/` is refused even then.

## State

- `history`: `$state.raw<string[]>`.
- The registry: a `$derived` over `kernel.services`. Each contribution is read through `shell()`, and the shell's own contribution is included even before the kernel has registered the shell. The resolved `lazy` parts sit in a `$state.raw` list read first; `loaded` flips when they land.
- A session holds `cwd` (`$state`) and `entries` (`$state.raw`). Each entry has `status`, `values` (`$state.raw`, batched every 16 ms) and `error`.

## Lifecycle

- `init()` reads `/var/lib/shell/history`, one line per command.
- History is saved through `LatestWriter` on every `remember`.
- `destroy()` returns the writer's `idle()`: the pending history save. The kernel doesn't await it; the test kernel's `shutdown()` does, so the next test's `clear_opfs()` doesn't hit the open writable.

## Persistence

| What | Where |
|------|-------|
| Shared history (cap 1000) | OPFS `/var/lib/shell/history` |

## Known gaps

- No background jobs, variables, globs or chaining (ADR-033, deferred).
- App commands are global only; window-scoped ones (in-app shortcuts as commands) are deferred (ADR-034).
- `touch` on an existing file doesn't update its modified time.
