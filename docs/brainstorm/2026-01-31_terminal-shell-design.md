# Terminal / Shell Design Brainstorm

**Date:** 2026-01-31
**Participants:** Developer, Claude

## Context

Exploring whether and how to implement a terminal/shell for WebOS. The Shell Service is mentioned in API docs as a command palette with fuzzy search, but no detailed design exists. Questions: should it be a terminal emulator, a command palette, or both? How do commands get registered? Is it even useful?

## Key Questions & Discussion

### 1. Is it really useful?

**Yes, but scope matters.** A terminal is useful for:
- **Power user efficiency** - batch operations, quick navigation
- **Debugging** - inspecting service state, window instances, file system
- **File operations** - `ls`, `cd`, `cat`, `mkdir`, `rm` against OPFS
- **Window management** - `close all`, `tile`, `minimize *`
- **App launching** - `open calculator`, `open settings`
- **Discoverability** - autocomplete teaches users what's possible

**Not useful if:** it tries to be a real shell (bash emulation, scripting language). That's a rabbit hole. Keep it as a **command dispatcher with structured output**, not a text processing pipeline.

### 2. Terminal App vs Shell Service - Two Separate Things

**Shell Service** = command registry + execution engine (headless)
**Terminal App** = UI that talks to the Shell Service

This separation is important:
- Command palette (Ctrl+K) also uses Shell Service
- Other apps could execute commands programmatically
- Terminal is just one UI for the command system

```
┌─────────────────┐    ┌──────────────┐
│  Terminal App    │───▶│              │
├─────────────────┤    │ Shell Service │
│ Command Palette │───▶│  (registry)  │
├─────────────────┤    │              │
│  Other Apps     │───▶│              │
└─────────────────┘    └──────────────┘
```

### 3. How should commands be defined?

**Option A: Services register commands at mount time**
```typescript
// Inside WindowsService
register_commands(shell: ShellService) {
  shell.register({
    id: "windows:close",
    name: "Close Window",
    args: [{ name: "id", type: "string", optional: true }],
    execute: (args) => this.close(args.id ?? focused_window),
  });
}
```
- Pro: Commands live near the logic they control
- Con: Tight coupling between services

**Option B: Command modules alongside services**
```
services/windows/
  service.svelte.ts
  commands.ts          <-- command definitions
```
- Pro: Clean separation
- Con: Commands need service access somehow

**Option C: Centralized command definitions that reference services**
```typescript
// shell/commands/windows.ts
export const commands: CommandDef[] = [
  {
    id: "windows:close",
    execute: (ctx) => ctx.kernel.service("windows").close(ctx.args.id),
  }
];
```
- Pro: All commands visible in one place
- Con: Doesn't scale for app-provided commands

**Recommendation: Option A with a twist** - Services implement a `commands()` method as part of their interface. The Shell Service collects commands from all registered services during init. Apps can also register commands via App Context.

### 4. Command Structure

```typescript
interface Command {
  id: string;                    // "windows:close", "fs:ls"
  name: string;                  // "Close Window"
  description?: string;
  category: string;              // "windows", "files", "apps"
  args?: ArgDef[];               // typed argument definitions
  execute: (ctx: CommandContext) => CommandResult | Promise<CommandResult>;
  complete?: (partial: string, argIndex: number) => Completion[];  // autocomplete
  enabled?: () => boolean;
}

interface ArgDef {
  name: string;
  type: "string" | "number" | "boolean" | "path";  // "path" enables fs autocomplete
  required?: boolean;
  description?: string;
  complete?: (partial: string) => Completion[];  // per-arg autocomplete
}

interface CommandContext {
  args: Record<string, unknown>;
  raw_args: string[];
  kernel: Kernel;
}

type CommandResult =
  | { type: "text"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "tree"; data: TreeNode }
  | { type: "component"; component: Component; props: Record<string, unknown> }
  | { type: "void" }
  | { type: "error"; message: string };
```

**Structured output is key.** Commands return typed results, not raw strings. The Terminal App renders them appropriately. The command palette might only use `void` results (actions).

### 5. What commands make sense based on existing/planned services?

#### Files Service (implemented)
- `ls [path]` - list directory
- `cd <path>` - change working directory (terminal-local state)
- `cat <path>` - read file contents
- `mkdir <path>` - create directory
- `rm <path>` - remove file/directory
- `cp <src> <dest>` - copy
- `mv <src> <dest>` - move
- `touch <path>` - create empty file
- `df` - storage estimate

#### Windows Service (implemented)
- `windows` / `wm list` - list open windows
- `wm close [id|all]` - close window(s)
- `wm focus <id>` - focus window
- `wm minimize [id|all]` - minimize
- `wm maximize [id]` - maximize
- `wm tile <layout>` - tile windows (left/right/grid)
- `wm debug [id]` - toggle debug flag

#### Apps Service (implemented)
- `apps` - list installed apps
- `open <app>` - launch app
- `app info <app>` - show app manifest

#### Settings Service (implemented)
- `theme [name]` - get/set theme
- `taskbar <position>` - set taskbar position

#### Desktop Service (implemented)
- `desktop reset` - reset grid layout

#### Notifications Service (planned - ADR-006)
- `notify <message>` - send notification
- `notifications` - list active notifications

#### Tasks Service (planned)
- `tasks` - list running tasks
- `task cancel <id>` - cancel task

#### Meta/System
- `help [command]` - help text
- `clear` - clear terminal
- `echo <text>` - echo text
- `kernel` - show kernel info, registered services

### 6. Should file explorer be included?

**Yes, partially.** The terminal should support file operations (`ls`, `cd`, `cat`, etc.) that mirror what File Explorer does visually. But it shouldn't replace File Explorer - they're complementary:
- Terminal: batch operations, scripting, quick navigation
- File Explorer: visual browsing, drag-drop, previews

The terminal maintains its own `cwd` (current working directory) state.

### 7. How to render the UI

The Terminal App is a regular WebOS app with:

```
┌─────────────────────────────────┐
│ Terminal                    _ □ x│
├─────────────────────────────────┤
│ webos:/ $ ls                    │
│ documents/  apps/  desktop/     │
│                                 │
│ webos:/ $ wm list               │
│ ┌────┬──────────┬───────┬─────┐ │
│ │ ID │ App      │ Title │ Z   │ │
│ ├────┼──────────┼───────┼─────┤ │
│ │ 1  │ settings │ ...   │ 3   │ │
│ │ 2  │ terminal │ ...   │ 5   │ │
│ └────┴──────────┴───────┴─────┘ │
│                                 │
│ webos:/documents $ _            │
└─────────────────────────────────┘
```

**UI Components:**
- **Output area**: Scrollable log of command/result pairs
- **Input line**: Current prompt + text input
- **Autocomplete popup**: Dropdown/overlay showing completions

**Autocomplete approach:**
- Tab-triggered or always-visible dropdown
- Fuzzy match on command names, then on args
- For `path` type args, query FilesService for directory listing
- Show arg descriptions inline

**Rendering structured results:**
- `text` → monospace pre block
- `table` → HTML table or ASCII table
- `tree` → collapsible tree view
- `component` → mount Svelte component inline (advanced, maybe later)
- `error` → red text

### 8. How to define complicated logic in Svelte

The pattern already exists in the codebase:

1. **Pure logic in `.ts` files** - command parsing, argument validation, completion matching
2. **Reactive state in `.svelte.ts` files** - terminal history, cwd, input state
3. **UI in `.svelte` files** - rendering only

```
apps/system/terminal/
  index.ts                    # app manifest
  terminal.app.svelte         # main UI
  terminal-input.svelte       # input line + autocomplete
  terminal-output.svelte      # output rendering
  terminal.state.svelte.ts    # reactive terminal state (history, cwd)

services/shell/
  service.svelte.ts           # ShellService - command registry
  parser.ts                   # command string parsing
  commands/                   # built-in command definitions
    files.ts
    windows.ts
    apps.ts
    settings.ts
    system.ts
```

The complicated logic (parsing, completion) stays in plain TypeScript. Svelte only handles reactivity and rendering.

## Key Takeaways

1. **Two layers**: Shell Service (headless command registry) + Terminal App (UI)
2. **Structured output** - commands return typed results, not strings
3. **Services provide commands** via a standard interface method
4. **Autocomplete is first-class** - per-argument completion functions
5. **File operations included** but don't replace File Explorer
6. **Keep it simple** - command dispatcher, not a scripting language
7. **Command palette reuses Shell Service** - same registry, different UI

## Open Questions

- Should commands support piping? (`ls | grep .txt`) — Probably not initially
- Should there be command aliases? (`ll` → `ls -l`) — Nice to have, not essential
- History persistence? — Yes, via StorageHandle (localStorage)
- Should apps be able to register commands? — Yes, via App Context when implemented
- Multiple terminal instances with independent cwd? — Yes, cwd is per-terminal-instance

## Resolved Decisions

- **Command IDs are space-separated user-facing names** — `"apps open"` not `"apps:open"`. No colon namespacing.
- **Shell owns all parsing** — commands declare args/flags schema, shell tokenizes, validates, coerces
- **Progressive prefix matching** — shell tries longest prefix first to resolve command from input
- **File associations on app manifest** — `associations: [".png", ".jpg"]`, enables `open ./file.png`
- **`file` as standard app prop** — apps that handle files receive `{ file: { path, name, extension } }`
- **`open` command owned by AppsService** — not Shell Service. Domain logic stays in owning service.
- **Flat commands only for v1** — no nested subcommand trees

## Action Items

- [x] Create ADR for Shell Service + Terminal design → ADR-007
- [ ] Implement Shell Service as P2 feature
- [ ] Implement Terminal App as system app
- [ ] Define command interface in core types
- [ ] Add file associations to AppManifest type (with ADR-003 work)

## Next Session Topics

- Command palette UI design (separate from terminal)
- Integration with Shortcuts Service (Ctrl+K for palette)
- File association implementation details
