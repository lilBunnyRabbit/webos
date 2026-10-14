# ADR-007: Shell Service & Terminal

**Date:** 2026-01-31
**Status:** Superseded by [ADR-033](./033-shell.md) (2026-10-14): structured values and pipes, service `shell()` hook, streaming with abort, zod args, Mod+K palette, shortcuts run commands

## Context

WebOS needs a way for power users to interact with the system efficiently. A terminal provides quick access to file operations, window management, app launching, and system inspection without navigating through GUIs. Additionally, a command palette (Ctrl+K) offers discoverability for all available actions.

These are two UIs for the same underlying system: a command registry with parsing, validation, and execution.

### Related ADRs

- **ADR-003** (App Context) — Apps will register commands via App Context
- **ADR-005** (Files Service) — Terminal acts as filesystem entrypoint with `cwd`
- **ADR-006** (Notifications Service) — Commands may trigger notifications

## Decision

### Architecture: Two Layers

```
┌─────────────────┐    ┌───────────────┐
│  Terminal App    │───>│               │
├─────────────────┤    │ Shell Service  │
│ Command Palette │───>│  (registry +  │
├─────────────────┤    │   parser)     │
│ Other Apps/Svcs │───>│               │
└─────────────────┘    └───────────────┘
```

**Shell Service** — Headless service. Owns the command registry, input parser, argument validation, and execution. No UI.

**Terminal App** — System app. Provides the terminal UI: prompt, output area, autocomplete dropdown. Maintains its own `cwd` state. Consumes Shell Service.

**Command Palette** — Separate UI (future). Also consumes Shell Service for command search and execution.

---

### Command Definition

Commands are flat. No subcommand nesting. The command ID is the user-facing name with spaces (e.g. `"apps open"`). Two commands cannot share the same ID.

```typescript
interface CommandDef {
  /** User-facing ID, also the command name. e.g. "apps open", "ls", "theme" */
  id: string;

  /** Short description for help text and command palette */
  description?: string;

  /** Category for grouping in help/palette. e.g. "files", "windows", "apps" */
  category?: string;

  /** Alternative names. e.g. ["launch"] for "apps open" */
  aliases?: string[];

  /** Positional argument definitions, in order */
  args?: ArgDef[];

  /** Flag definitions (--name, --name=value) */
  flags?: FlagDef[];

  /** Execute the command. Receives parsed, validated args. */
  execute: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;

  /** Whether the command is currently available */
  enabled?: () => boolean;
}
```

### Argument Definitions

```typescript
interface ArgDef {
  /** Argument name, used as key in parsed output */
  name: string;

  /** Type for validation and coercion */
  type: "string" | "number" | "boolean";

  /** Whether this arg must be provided. Defaults to false. */
  required?: boolean;

  /** Collect all remaining positional args into an array. Must be last arg. */
  rest?: boolean;

  /** Description shown in help/autocomplete */
  description?: string;

  /** Provide completions for this argument */
  complete?: (partial: string) => Completion[];
}

interface FlagDef {
  /** Flag name, used as --name or --name=value */
  name: string;

  /** Type. Boolean flags are --flag (true) or omitted (false). */
  type: "string" | "number" | "boolean";

  /** Short alias. e.g. "a" for --all → -a */
  short?: string;

  /** Description shown in help/autocomplete */
  description?: string;

  /** Default value if flag is omitted */
  default?: string | number | boolean;

  /** Provide completions for this flag's value */
  complete?: (partial: string) => Completion[];
}

interface Completion {
  value: string;
  label?: string;
  description?: string;
}
```

### Execution Context & Results

```typescript
interface CommandContext {
  /** Parsed positional args, keyed by ArgDef.name */
  args: Record<string, unknown>;

  /** Parsed flags, keyed by FlagDef.name */
  flags: Record<string, unknown>;

  /** Raw input tokens (for edge cases) */
  raw: string[];

  /** Terminal's current working directory (if invoked from terminal) */
  cwd?: string;

  /** Reference to the kernel for service access */
  kernel: Kernel;
}

type CommandResult =
  | { type: "text"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "tree"; data: TreeNode }
  | { type: "error"; message: string }
  | { type: "void" };

interface TreeNode {
  label: string;
  children?: TreeNode[];
}
```

Commands return structured results. The Terminal App decides how to render each type. The command palette typically only uses `void` results (fire-and-forget actions).

---

### Shell Service Interface

```typescript
interface ShellService extends IService {
  /** Register a command */
  register(command: CommandDef): void;

  /** Unregister a command by ID */
  unregister(id: string): void;

  /** Get a command by ID */
  get(id: string): CommandDef | undefined;

  /** List all registered commands */
  list(): CommandDef[];

  /** Search commands by fuzzy matching against id, description, aliases, category */
  search(query: string): CommandDef[];

  /** Parse and execute a raw input string */
  run(input: string, context?: { cwd?: string }): Promise<CommandResult>;

  /** Execute a command by ID with pre-parsed args */
  execute(id: string, args?: Record<string, unknown>, flags?: Record<string, unknown>): Promise<CommandResult>;

  /** Get completions for partial input */
  complete(input: string, cursor_position: number, context?: { cwd?: string }): Completion[];
}
```

---

### Parser Behavior

The shell parser is a standalone pure function. Given a raw input string:

1. **Tokenize** — Split on whitespace, respecting quoted strings (`"hello world"` is one token). Handle escape characters.
2. **Resolve command** — Try progressively shorter prefixes against registered command IDs and aliases:
   - Input: `apps open calculator --title=Test`
   - Try `"apps open calculator"` → no match
   - Try `"apps open"` → match! Remaining tokens: `["calculator", "--title=Test"]`
3. **Extract flags** — Pull out `--name=value`, `--name`, `-s` tokens from remaining args.
4. **Map positional args** — Remaining tokens map to `ArgDef` entries in order. If last arg has `rest: true`, collect all remaining into an array.
5. **Validate** — Check required args present, types coerce correctly.
6. **Execute** — Call `command.execute(ctx)` with parsed data.

If resolution fails, return an error result suggesting similar commands.

---

### Command Registration

Services register their commands when constructed. The Shell Service is available as a dependency.

```typescript
// In AppsService constructor or init()
shell.register({
  id: "apps open",
  description: "Launch an application",
  category: "apps",
  aliases: ["open"],
  args: [
    {
      name: "id",
      type: "string",
      required: true,
      description: "App ID to launch",
      complete: (partial) =>
        [...this.registry.values()]
          .filter((a) => a.id.includes(partial))
          .map((a) => ({ value: a.id, label: a.name })),
    },
  ],
  execute: ({ args }) => {
    this.launch(args.id as string);
    return { type: "void" };
  },
});
```

Built-in commands (help, clear, echo) are registered by the Shell Service itself.

**Future:** Apps register commands via App Context (ADR-003). When an app mounts, its commands become available. When it unmounts, they're removed.

---

### Terminal App

The Terminal App is a system app (`/src/lib/apps/system/terminal/`). Key behaviors:

- **`cwd` state** — Each terminal instance maintains its own current working directory. Passed to `shell.run()` as context. Displayed in the prompt.
- **History** — Command history stored via StorageHandle (localStorage). Arrow keys navigate history.
- **Output log** — Scrollable list of `{ input: string, result: CommandResult }` entries. Each result type gets its own renderer.
- **Autocomplete** — Tab-triggered. Calls `shell.complete()` with current input and cursor position. Shows dropdown with completions.
- **Prompt format** — `webos:{cwd} $ `

---

### File Associations (Future Extension)

Apps can declare file associations in their manifest:

```typescript
define_app({
  id: "image-preview",
  // ...
  associations: [".png", ".jpg", ".webp", ".gif"],
});
```

This enables a generic `open` command:

```
open ./photo.png              # resolves to image-preview via association
open ./photo.png --app=editor # explicit app override
```

The `open` command is registered by AppsService. It:
1. Resolves the file path against `cwd`
2. Gets the file extension
3. Finds the associated app (or uses `--app` flag)
4. Launches the app with a standardized prop: `{ file: { path, name, extension } }`

This requires a **standard app prop for file input** — apps that handle files expect a `file` prop with path information. The shape of this prop should be defined when file associations are implemented (likely alongside ADR-003 App Context work).

**Note:** File association lookup and the `open` command belong to AppsService, not Shell Service. The shell is just the command registry — domain logic stays in the owning service.

---

### Initial Command Set

Commands registered by each service on init:

| Command | Service | Description |
|---------|---------|-------------|
| `help [command]` | Shell | Show available commands or command details |
| `clear` | Shell | Clear terminal output |
| `echo <text...>` | Shell | Print text |
| `ls [path]` | Files | List directory contents |
| `cd <path>` | Files | Change working directory (updates terminal cwd) |
| `mkdir <path>` | Files | Create directory |
| `apps list` | Apps | List installed apps |
| `apps open <id>` | Apps | Launch an app |
| `apps info <id>` | Apps | Show app manifest details |
| `wm list` | Windows | List open windows |
| `wm close [id] [--all]` | Windows | Close window(s) |
| `wm focus <id>` | Windows | Focus a window |
| `theme [name]` | Settings | Get or set current theme |
| `kernel` | Shell | Show kernel info and registered services |

Additional commands added as services are implemented (notifications, tasks, etc).

## Alternatives Considered

### 1. Bash-like scripting shell
Full scripting with pipes, variables, conditionals. Rejected — massive complexity for minimal value in a web desktop. Can be revisited later if demand exists.

### 2. Command palette only (no terminal)
Just a Ctrl+K palette with fuzzy search. Rejected as the sole interface — a persistent terminal with `cwd` and output history is fundamentally different and more useful for file operations and debugging.

### 3. Commands handle their own parsing
Each command receives raw string input and parses it. Rejected — duplicates parsing logic across every command, breaks autocomplete.

### 4. Nested subcommand trees
`wm` as a command group with `close`, `list`, `focus` as subcommands. Rejected for v1 — flat commands with space-separated IDs are simpler and sufficient.

## Consequences

### Positive
- Single command registry serves terminal, command palette, and programmatic use
- Structured output enables rich rendering in terminal UI
- Autocomplete works automatically from arg/flag definitions
- Services own their commands — domain logic stays co-located
- File associations enable `open` command naturally

### Negative
- Shell Service becomes a dependency for any service that registers commands
- Parser complexity — progressive prefix matching, quoted strings, flag extraction
- No scripting means some batch operations require multiple commands

### Risks
- Command ID collisions between services (mitigated: IDs are namespaced by convention)
- Completion functions that are expensive (mitigated: completions are lazy, called on tab)
