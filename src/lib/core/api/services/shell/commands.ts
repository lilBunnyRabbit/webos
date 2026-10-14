import { z } from "zod";
import type { Kernel } from "../../kernel/kernel.svelte";
import { arg, ArgKind } from "./arg";
import { FIELD_KIND } from "./complete";
import { define_command } from "./define";
import { fields, flag_name, resolve, usage } from "./parse";
import { SUDO } from "./pipeline";
import { ShellError, type Command, type ShellContribution, type Tagged, type Value } from "./type";
import { compare, field_of, order_values, parse_literal, OPERATORS } from "./values";

export interface CoreHost {
  find(id: string): Command | undefined;
  commands(): Command[];
  history(): string[];
  kernel: Kernel;
}

export function command_value(command: Command): Tagged {
  return { $type: "command", id: command.id, description: command.description, usage: usage(command) };
}

const field = () => arg.kind(FIELD_KIND);

/** The shell's own commands: help, session, and the verbs that work on any value stream. */
export function core_shell(host: CoreHost): ShellContribution {
  const commands: Command[] = [
    define_command({
      id: "help",
      description: "List commands, or explain one",
      args: z.object({ command: z.array(arg.kind(ArgKind.COMMAND)).default([]) }),
      positional: ["command"],
      yields: "command",
      *run({ args }) {
        if (args.command.length === 0) {
          for (const command of host.commands()) yield command_value(command);
          return;
        }
        const match = resolve(args.command, host.find);
        if (!match) {
          const prefix = `${args.command.join(" ")} `;
          const group = host.commands().filter((command) => command.id.startsWith(prefix));
          if (group.length === 0) throw new ShellError(`help: no command "${args.command.join(" ")}"`);
          for (const command of group) yield command_value(command);
          return;
        }
        yield help_text(match.command);
      },
    }),
    define_command({
      id: "clear",
      description: "Clear the screen",
      run({ session }) {
        session.clear();
      },
    }),
    define_command({
      id: "history",
      description: "Commands run before, oldest first",
      yields: "history",
      *run() {
        let index = 1;
        for (const line of host.history()) yield { $type: "history", index: index++, line };
      },
    }),
    define_command({
      id: "echo",
      description: "Print the words given",
      args: z.object({ words: z.array(z.string()).default([]) }),
      positional: ["words"],
      run: ({ args }) => args.words.join(" "),
    }),
    define_command({
      id: SUDO,
      description: "Run a command that writes to system folders, after confirming",
      run() {
        throw new ShellError(`sudo: which command? Usage: sudo <command>`);
      },
    }),
    define_command({
      id: "where",
      description: "Keep values whose field compares true: where size > 1mb",
      args: z.object({ field: field(), operator: z.enum(OPERATORS), value: z.string() }),
      positional: ["field", "operator", "value"],
      yields: "input",
      async *run({ args, input }) {
        const right = parse_literal(args.value);
        for await (const value of input) {
          if (compare(field_of(value, args.field), args.operator, right)) yield value;
        }
      },
    }),
    define_command({
      id: "sort",
      description: "Sort values by a field",
      args: z.object({ field: field().optional(), reverse: z.boolean().default(false) }),
      positional: ["field"],
      short: { reverse: "r" },
      yields: "input",
      async *run({ args, input }) {
        const all: Value[] = [];
        for await (const value of input) all.push(value);
        const key = (value: Value) => (args.field ? field_of(value, args.field) : value);
        all.sort((a, b) => order_values(key(a), key(b)) * (args.reverse ? -1 : 1));
        yield* all;
      },
    }),
    define_command({
      id: "select",
      description: "Keep only some fields of each value",
      args: z.object({ fields: z.array(field()).min(1) }),
      positional: ["fields"],
      async *run({ args, input }) {
        for await (const value of input) {
          yield Object.fromEntries(args.fields.map((name) => [name, field_of(value, name) ?? null]));
        }
      },
    }),
    define_command({
      id: "first",
      description: "The first n values",
      args: z.object({ count: z.number().int().min(0).default(1) }),
      positional: ["count"],
      yields: "input",
      async *run({ args, input }) {
        if (args.count === 0) return;
        let taken = 0;
        for await (const value of input) {
          yield value;
          if (++taken >= args.count) return;
        }
      },
    }),
    define_command({
      id: "last",
      description: "The last n values",
      args: z.object({ count: z.number().int().min(0).default(1) }),
      positional: ["count"],
      yields: "input",
      async *run({ args, input }) {
        const kept: Value[] = [];
        for await (const value of input) {
          kept.push(value);
          if (kept.length > args.count) kept.shift();
        }
        yield* kept;
      },
    }),
    define_command({
      id: "count",
      description: "How many values came in",
      async run({ input }) {
        let count = 0;
        for await (const _ of input) count++;
        return count;
      },
    }),
    define_command({
      id: "get",
      description: "One field of each value",
      args: z.object({ field: field() }),
      positional: ["field"],
      async *run({ args, input }) {
        for await (const value of input) {
          const found = field_of(value, args.field);
          if (found !== undefined) yield found;
        }
      },
    }),
    define_command({
      id: "kernel",
      description: "Platform and services",
      run: () => ({
        platform: host.kernel.platform,
        services: host.kernel.services.size,
        commands: host.commands().length,
      }),
    }),
    define_command({
      id: "services",
      description: "Kernel services and their state",
      yields: "service",
      *run() {
        for (const [key, service] of host.kernel.services) {
          yield { $type: "service", key, name: service.name, state: service.to_string(), description: service.description };
        }
      },
    }),
  ];

  return {
    commands,
    values: {
      command: {
        columns: ["id", "description"],
        text: (value) => `${String(value.id).padEnd(16)} ${String(value.description)}`,
      },
      history: {
        columns: ["index", "line"],
        text: (value) => `${String(value.index).padStart(4)}  ${String(value.line)}`,
      },
      service: {
        columns: ["key", "state"],
        text: (value) => `${String(value.key).padEnd(14)} ${String(value.state)}`,
      },
    },
  };
}

function help_text(command: Command): string {
  const lines = [`${command.description}`, "", `  ${usage(command)}`];
  const list = fields(command).filter((item) => item.description || !item.positional);
  if (list.length > 0) lines.push("");
  for (const item of list) {
    const name = item.positional ? item.name : (item.short ? `-${item.short}, ` : "    ") + `--${flag_name(item.name)}`;
    lines.push(`  ${name.padEnd(22)} ${item.description ?? ""}${item.options ? ` (${item.options.join(", ")})` : ""}`);
  }
  return lines.join("\n");
}

