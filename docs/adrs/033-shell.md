# ADR-033: Shell, Terminal and Command Palette
**Date:** 2026-10-14
**Status:** Implemented (jobs, window-scoped app commands, bigger language deferred)

Supersedes [ADR-007](./007-shell-service.md). [Brainstorm](../brainstorm/2026-10-14_shell-terminal.md).

> **Revision 2026-10-20: `Command.ai`** ([ADR-054](./054-ai-assistant-over-shell.md)). An optional `ai: "read"` marks a command Ask's assistant may run; the user switches each on.

> **Revision 2026-10-15: dependencies and app commands.** ShellService depends on `files`, `dialogs` and `notifications` (`kernel/init.ts`), not only `files`. Apps contribute global commands through `define_app({ shell })` ([ADR-034](./034-app-extension-points.md)); a service wins an id clash. Only window-scoped app commands stay deferred, so in-app shortcuts keep `run`.

> **Revision 2026-10-15: service command bodies load lazily** (owner, [brainstorm](../brainstorm/2026-10-15_code-quality-pass.md))
> - Services follow the app pattern (ADR-034). Definitions stay eager in `shell.ts`: id, description, zod args, `positional`, `short`, `yields`, `available()` and the value types' `columns` / `text` / `cell`. Command bodies, heavy helpers and UI imports move to `shell-run.ts`, loaded with `import()` on first use. `IService.shell()` stays sync and `ShellService` is unchanged.
> - `run` becomes `async (context) => (await logic()).x(service, context)`, a generator `async *run` with `yield*`. Completers and value `open` may load it too: both may be async.
> - Split where it pays (≥ 1 KB off the boot chunk): files, windows, shortcuts (its cheat-sheet dialog). The rest keep their bodies inline. Boot chunk −10.5 KB min, −2.8 KB gz.

## Context

ADR-007 (January) designed a flat command dispatcher: one structured result per command, no pipes, no jobs, palette later. It was never built. The owner wants the whole package instead: "all nicely modular by attaching to services ... not just a dumb terminal mimic", with Tab completion.

## Decision

### Services attach through one hook

`IService` gains an optional hook. The service builds its contribution in its own `shell.ts`, so a swapped service (`MobileWindowsService`) brings its own commands.

```ts
interface IService {
  shell?(): ShellContribution;
}

interface ShellContribution {
  commands?: Command[];
  /** Tab completion by arg kind: files gives `path`, apps `app`, windows `window`. */
  completers?: Record<string, Completer>;
  /** Renderers and actions for tagged values: files gives `file`, windows `window`. */
  values?: Record<string, ValueType>;
}
```

ShellService (`shell`, depends on `files` for history) collects reactively: its registry is a `$derived` over `kernel.services`. A service initialised after the shell still shows up, and other services (shortcuts) can depend on `shell`. A service's commands exist only once it has initialised.

### Commands

```ts
interface Command<A extends z.ZodObject = z.ZodObject> {
  /** User-facing, spaces allowed: "ls", "win close". Longest prefix wins when parsing (kept from ADR-007). */
  id: string;
  description: string;
  /** Args and flags in one zod object. Kinds (`arg.path()`, `arg.app()`, `arg.window()`) drive completion and help. */
  args?: A;
  /** Keys of `args` filled from positional tokens, in order. The last may be an array (rest). Others are flags. */
  positional?: (keyof z.infer<A>)[];
  /** One-letter flags: `{ recursive: "r" }` gives `-r`. */
  short?: Partial<Record<keyof z.infer<A>, string>>;
  /** False hides it from the palette and makes running it an error. Replaces a shortcut's `when`. */
  available?: () => boolean;
  run(context: CommandContext<z.infer<A>>): Output;
}

interface CommandContext<T> {
  args: T;
  /** Values piped in from the previous stage; empty for the first. */
  input: AsyncIterable<Value>;
  session: ShellSession;
  /** Aborted by Ctrl+C, by closing the terminal, or when a later stage stops reading. */
  signal: AbortSignal;
  /** True under `sudo`: writes to system folders are allowed. */
  elevated: boolean;
}

/** A generator streams values as it produces them; a plain return is one value. */
type Output = AsyncIterable<Value> | Iterable<Value> | Promise<Value | void> | Value | void;
```

The shell tokenises (quotes, escapes), resolves the command by longest prefix, maps positionals and `--flag` / `--flag=value` / `-f` tokens, coerces strings by the zod type, and validates with zod. Errors name the arg.

Naming: Unix verbs for files (`ls cd pwd cat cp mv rm mkdir touch open du df`), noun groups for domains (`win list`, `app info`, `theme set`). A group alone (`win`) lists its members.

### Values and pipes

```ts
type Value = string | number | boolean | null | Value[] | { [key: string]: Value } | Tagged;
interface Tagged { $type: string; [key: string]: Value }

interface ValueType {
  /** Table columns when a list of these renders. */
  columns: string[];
  /** Text form: plain rendering, persisted scrollback, `get`. */
  text(value: Tagged): string;
  /** Rich inline rendering in the terminal; text form when absent. */
  render?: Component<{ value: Tagged }>;
  /** Click / Enter on the value. */
  open?(value: Tagged): void;
}
```

`a | b | c` runs the stages concurrently: each stage's output is the next stage's `input`. The terminal renders a run of values of one type as a table, other values on their own line. Generic verbs work on any value stream: `where`, `sort`, `select`, `first`, `last`, `count`, `get`.

`where <field> <op> <value>` with `== != > < >= <= =~` (`=~` is contains, case-insensitive). Values accept size and time units (`1mb`, `2d`). AND is a chain of `where`s; there is no OR.

The language is pipes only. No variables, substitution, globs, `;` / `&&`, aliases or scripts. `~` is part of path resolution.

### Execution

Every run streams and takes an `AbortSignal`. Ctrl+C aborts the foreground run, and closing the terminal window aborts it too. Nothing runs in the background.

### Sessions

```ts
interface ShellSession {
  cwd: string;
  readonly entries: Entry[];
  run(input: string): Run;
  clear(): void;
}
```

`shell.session()` creates one. Each terminal window owns a session, and the palette uses a throwaway one. Commands change it through `context.session` (`cd` sets `cwd`, `clear` empties the entries), so the shell runs headless and is testable without UI.

Persistence:
- History is shared by every terminal and the palette, in `/var/lib/shell/history` (one line per command, capped, consecutive duplicates collapsed).
- Each terminal window saves its cwd and scrollback (text form, capped) through `storage.window()`, so session restore brings it back.

### Completion

Completers come by kind from services. An arg can override with its own `complete()`. Command names, flags, enum values and `where` fields (from the value type's columns) complete from the schema.

```ts
type Completer = (partial: string, context: { session: ShellSession }) => Completion[] | Promise<Completion[]>;
interface Completion { value: string; detail?: string; /** False for "Pictures/": keep typing. */ final?: boolean }
```

The UI is fish-style:
- Ghost text suggests the rest as you type, history first, then the top completion. Right arrow accepts it.
- Tab completes a single match. With several matches, Tab fills the common prefix and opens a popup with details; Tab and the arrow keys move through it, Enter picks.

### System folders

Write commands refuse system folders, as File Explorer does. `sudo <command>` asks once through a system dialog and then runs it with `elevated: true`.

`rm` deletes without asking. It does not touch system folders unless run under `sudo`.

### Terminal app

`src/lib/apps/system/terminal/`, multi-instance, one session per window.

The prompt shows the cwd with `~` for `/home`. Up and Down walk the history.

On mobile, a key row sits above the soft keyboard: Tab, Esc, Ctrl (sticky), arrows, `|`, `~`, `/`. The completion popup and values are tappable.

### Command palette

Mod+K stays the launcher. Typing `>` switches it to commands, using the same input, completion and throwaway session:
- A finished command shows its first values inline, plus "Open in Terminal".
- Commands with `available() === false` are hidden.
- Rows show bound keys.

The mobile drawer stays the drawer.

### Shortcuts run commands

`KeyShortcut` becomes `command` or `run`:
- Global OS shortcuts name a command line (`{ keys: "alt+shift+w", command: "win close" }`).
- Window-scoped app shortcuts keep `run` until apps can register commands.

A shortcut fires only when its command is available. The shortcuts service depends on `shell`.

### Initial commands

| Group | Commands | Owner |
|-------|----------|-------|
| Core | `help`, `clear`, `history`, `echo`, `sudo` | shell |
| Verbs | `where`, `sort`, `select`, `first`, `last`, `count`, `get` | shell |
| Files | `ls`, `cd`, `pwd`, `cat`, `cp`, `mv`, `rm`, `mkdir`, `touch`, `open`, `du`, `df` | files (`open`: apps) |
| Windows | `win list`, `close`, `focus`, `minimize`, `maximize`, `snap`, plus the shortcut actions | windows (`snap` desktop only) |
| Apps | `app list`, `info`, `launch` | apps |
| System | `theme get`, `theme set`, `notify`, `copy`, `paste`, `kernel`, `services`, `version`, `changelog`, `link` | settings, notifications, clipboard, shell, version, router |

## Alternatives Considered

- **ADR-007's single result, no pipes.** Rejected: it was the "dumb terminal mimic".
- **Text streams (Unix).** Rejected: tables flatten to text and nothing is clickable.
- **Each service registers with the shell in `init()` (ADR-007).** Rejected: the shell becomes a dependency of every service.
- **Central command modules (the shortcuts pattern).** Rejected: commands would not live with their service, and a swapped service could not change them.
- **Glob discovery of `shell.ts`.** Rejected: discovery is by folder, not by the registered service.
- **Background jobs with Tasks.** Deferred until there is a use case. The package also has no cancel.
- **Variables, globs, chaining, scripts, `where` expressions.** Deferred.
- **Window-scoped app commands.** Deferred. App shortcuts keep `run` until then.
- **Read-only system folders with no override.** Rejected: the shell could never repair `/etc`. A `sudo` dialog was chosen instead.
- **A separate palette shortcut.** Rejected: it would be two overlays for one search.

## Consequences

- One registry drives the terminal, the palette and the OS shortcuts. `defaults.ts` shrinks to key bindings, and the logic moves into each service's `shell.ts`.
- `IService` grows a hook, so the kernel contract now knows about the shell.
- Help, completion and coercion read zod internals, which ties them to zod 4.
- Scrollback restored after a reload is text: values lose their actions.
- Tasks stays parked. Jobs, app commands and the bigger language are on the roadmap.
