import type { Component } from "svelte";
import type { z } from "zod";
import type { IService } from "../../type";

/** Commands, completion and value types contributed by services; the terminal, the palette and shortcuts run them (ADR-033). */
export interface ShellService extends IService {
  /** Every command of every initialised service, by id. */
  readonly commands: Command[];
  find(id: string): Command | undefined;
  value_type(type: string): ValueType | undefined;
  completer(kind: string): Completer | undefined;
  /** Shared by every session, oldest first. */
  readonly history: string[];
  remember(line: string): void;
  session(cwd?: string): ShellSession;
  /** Completions for the token under `cursor`. */
  complete(input: string, cursor: number, session: ShellSession): Promise<CompletionResult>;
  /** Whether `line` names a command that's available right now. Shortcuts check this before taking the key. */
  available(line: string): boolean;
  /** Runs `line` in a throwaway session and reports a failure as a notification. For shortcuts and the palette. */
  execute(line: string): Promise<Entry>;
}

/** What a service hands the shell through `IService.shell()`. */
export interface ShellContribution {
  commands?: Command[];
  /** Tab completion by arg kind (`arg.path()` is kind `"path"`). */
  completers?: Record<string, Completer>;
  /**
   * Rendering and actions for tagged values, by `$type`. Contributions to one type merge, so the service that renders
   * a value and the one that opens it can differ (files renders `file`, apps opens it).
   */
  values?: Record<string, Partial<ValueType>>;
}

export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export interface Tagged {
  $type: string;
  [key: string]: Value;
}

export interface ValueType {
  /** Table columns when a run of these renders together; also what `where` completes. */
  columns: string[];
  /** Plain form: persisted scrollback, `get`, and rendering when there's no `render`. */
  text(value: Tagged): string;
  /** Cell text for a column; the raw field when absent. */
  cell?(value: Tagged, column: string): string;
  render?: Component<{ value: Tagged }>;
  /** Click or Enter on the value. */
  open?(value: Tagged): void;
}

export interface Command<A extends z.ZodObject = z.ZodObject> {
  /** User-facing, spaces allowed (`"win close"`). The longest matching prefix wins. */
  id: string;
  description: string;
  args?: A;
  /** Keys of `args` filled from positional tokens, in order. An array field takes the rest. Other keys are flags. */
  positional?: (keyof z.infer<A> & string)[];
  /** One-letter flags: `{ recursive: "r" }` gives `-r`. */
  short?: Partial<Record<keyof z.infer<A> & string, string>>;
  /** The `$type` it yields, so `where` and `select` can complete its fields. `"input"`: whatever came in (filters). */
  yields?: string;
  /** Completion for one arg, ahead of its kind's completer. `undefined` falls back to the kind. */
  complete?(field: string, partial: string, context: { session: ShellSession }): Completion[] | Promise<Completion[]> | undefined;
  /** `false` hides it from the palette and makes running it an error. */
  available?: () => boolean;
  run(context: CommandContext<z.infer<A>>): Output;
}

export interface CommandContext<T = Record<string, unknown>> {
  args: T;
  /** Values from the previous stage; empty for the first. */
  input: AsyncIterable<Value>;
  /** A stage comes before this one. `win close` alone closes the focused window, piped it closes what came in. */
  piped: boolean;
  session: ShellSession;
  /** Ctrl+C, the window closing, or a later stage that stopped reading. */
  signal: AbortSignal;
  /** Run under `sudo`: writes to system folders are allowed. */
  elevated: boolean;
}

/** A generator streams; anything else, arrays included, is one value. */
export type Output = AsyncGenerator<Value, void> | Generator<Value, void> | Promise<Value | void> | Value | void;

export type Completer = (partial: string, context: { session: ShellSession }) => Completion[] | Promise<Completion[]>;

export interface Completion {
  value: string;
  /** What the list shows; `complete()` sets it to the value before escaping (`Brand Dark`, inserted as `Brand\ Dark`). */
  label?: string;
  detail?: string;
  /** `false` when typing goes on after it (`Pictures/`); otherwise a space follows. */
  final?: boolean;
}

export interface CompletionResult {
  /** The span of `input` the chosen value replaces. */
  from: number;
  to: number;
  items: Completion[];
}

export interface ShellSession {
  cwd: string;
  readonly entries: Entry[];
  run(input: string): Run;
  clear(): void;
  /** Puts saved scrollback back (session restore). Values come back as their text form. */
  restore(entries: SavedEntry[]): void;
}

export type SavedEntry = Pick<Entry, "input" | "cwd" | "status" | "error"> & { text: string };

export const EntryStatus = {
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
  ABORTED: "aborted",
} as const;
export type EntryStatus = (typeof EntryStatus)[keyof typeof EntryStatus];

export interface Entry {
  id: number;
  input: string;
  /** The cwd the line ran in, for the prompt above it. */
  cwd: string;
  status: EntryStatus;
  values: Value[];
  error: string | null;
}

export interface Run {
  entry: Entry;
  abort(): void;
  done: Promise<void>;
}

/** Thrown by commands for a message the user should see as is, without a stack. */
export class ShellError extends Error {
  name = "ShellError";
}
