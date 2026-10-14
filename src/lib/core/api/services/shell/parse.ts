import type { z } from "zod";
import { ShellError, type Command } from "./type";
import type { Token } from "./tokenize";

export type FieldType = "string" | "number" | "boolean" | "array" | "enum" | "other";

/** One key of a command's args, read from its zod schema for parsing, help and completion. */
export interface Field {
  name: string;
  type: FieldType;
  /** For arrays, the element's type. */
  element?: FieldType;
  kind?: string;
  description?: string;
  optional: boolean;
  options?: string[];
  positional: boolean;
  short?: string;
}

interface ZodDef {
  type: string;
  innerType?: z.ZodType;
  element?: z.ZodType;
}

function def(schema: z.ZodType): ZodDef {
  return (schema as unknown as { def: ZodDef }).def;
}

/** Peels optional / default / nullable wrappers; meta and description sit on whichever layer set them. */
function unwrap(schema: z.ZodType): { base: z.ZodType; optional: boolean; kind?: string; description?: string } {
  let current = schema;
  let optional = false;
  let kind: string | undefined;
  let description: string | undefined;
  for (;;) {
    const meta = current.meta() as { kind?: string; description?: string } | undefined;
    kind ??= meta?.kind;
    description ??= current.description ?? meta?.description;
    const inner = def(current);
    if (!["optional", "default", "nullable", "prefault"].includes(inner.type) || !inner.innerType) break;
    optional = true;
    current = inner.innerType;
  }
  return { base: current, optional, kind, description };
}

function field_type(schema: z.ZodType): FieldType {
  const type = def(schema).type;
  return type === "string" || type === "number" || type === "boolean" || type === "array" || type === "enum" ? type : "other";
}

export function fields(command: Command): Field[] {
  if (!command.args) return [];
  const positional: readonly string[] = command.positional ?? [];
  const short: Record<string, string | undefined> = command.short ?? {};
  const shape = command.args.shape as Record<string, z.ZodType>;
  const list = Object.entries(shape).map(([name, schema]): Field => {
    const { base, optional, kind, description } = unwrap(schema);
    const type = field_type(base);
    const element = type === "array" ? unwrap(def(base).element!) : null;
    return {
      name,
      type,
      element: element ? field_type(element.base) : undefined,
      kind: kind ?? element?.kind,
      description,
      optional,
      options: type === "enum" ? (base as unknown as { options: string[] }).options : undefined,
      positional: positional.includes(name),
      short: short[name],
    };
  });
  return list.sort((a, b) => order(a) - order(b));

  function order(field: Field): number {
    const index = positional.indexOf(field.name);
    return index === -1 ? positional.length : index;
  }
}

export const flag_name = (field: string) => field.replaceAll("_", "-");
const field_name = (flag: string) => flag.replaceAll("-", "_");

/** The longest prefix of `words` that is a command id. */
export function resolve(words: string[], find: (id: string) => Command | undefined): { command: Command; length: number } | null {
  for (let length = words.length; length > 0; length--) {
    const command = find(words.slice(0, length).join(" "));
    if (command) return { command, length };
  }
  return null;
}

/** `cp <from> <to> [-r|--recursive]` */
export function usage(command: Command): string {
  const parts = [command.id];
  for (const field of fields(command)) {
    if (field.positional) {
      const name = field.type === "array" ? `${field.name}...` : field.name;
      parts.push(field.optional || field.type === "array" ? `[${name}]` : `<${name}>`);
    } else {
      const flag = (field.short ? `-${field.short}|` : "") + `--${flag_name(field.name)}`;
      const value = field.type === "boolean" ? "" : field.options ? ` ${field.options.join("|")}` : ` <${field.type === "number" ? "n" : field.name}>`;
      parts.push(`[${flag}${value}]`);
    }
  }
  return parts.join(" ");
}

function coerce(field: Field, type: FieldType | undefined, raw: string): unknown {
  if (type === "number") {
    const value = Number(raw);
    if (raw.trim() === "" || Number.isNaN(value)) throw new ShellError(`${field.name}: "${raw}" is not a number`);
    return value;
  }
  if (type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw new ShellError(`${field.name}: expected true or false, got "${raw}"`);
  }
  return raw;
}

/** Binds a stage's tokens (command words already removed) to the command's args and validates them. */
export function bind(command: Command, tokens: Token[]): Record<string, unknown> {
  const list = fields(command);
  const values: Record<string, unknown> = {};
  const positional = list.filter((field) => field.positional);
  const rest: string[] = [];
  let flags_done = false;

  const by_short = (letter: string) => {
    const field = list.find((candidate) => candidate.short === letter);
    if (!field) throw new ShellError(`${command.id}: unknown flag -${letter}`);
    return field;
  };
  const by_name = (name: string) => {
    const field = list.find((candidate) => !candidate.positional && candidate.name === field_name(name));
    if (!field) throw new ShellError(`${command.id}: unknown flag --${name}`);
    return field;
  };
  const set = (field: Field, raw: string | true) => {
    if (raw === true) {
      if (field.type !== "boolean") throw new ShellError(`--${flag_name(field.name)} needs a value`);
      values[field.name] = true;
    } else if (field.type === "array") {
      values[field.name] = [...((values[field.name] as unknown[]) ?? []), coerce(field, field.element, raw)];
    } else {
      values[field.name] = coerce(field, field.type, raw);
    }
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const value = token.value;
    const takes_value = (field: Field) => field.type !== "boolean";
    const next = () => {
      const following = tokens[++index];
      if (!following) throw new ShellError(`${command.id}: ${value} needs a value`);
      return following.value;
    };

    if (flags_done || token.quoted || value === "-" || !value.startsWith("-") || /^-\d/.test(value)) {
      rest.push(value);
    } else if (value === "--") {
      flags_done = true;
    } else if (value.startsWith("--")) {
      const [name, inline] = split_once(value.slice(2), "=");
      const field = by_name(name);
      set(field, inline ?? (takes_value(field) ? next() : true));
    } else {
      const letters = value.slice(1);
      for (let at = 0; at < letters.length; at++) {
        const field = by_short(letters[at]);
        if (!takes_value(field)) set(field, true);
        else {
          set(field, at < letters.length - 1 ? letters.slice(at + 1) : next());
          break;
        }
      }
    }
  }

  for (const [index, field] of positional.entries()) {
    if (rest.length === 0) break;
    if (field.type === "array") {
      // `cp a b /tmp`: the array takes what the positionals after it leave.
      const after = positional.length - index - 1;
      values[field.name] = rest.splice(0, Math.max(0, rest.length - after)).map((raw) => coerce(field, field.element, raw));
    } else {
      values[field.name] = coerce(field, field.type, rest.shift()!);
    }
  }
  if (rest.length > 0) throw new ShellError(`${command.id}: unexpected "${rest[0]}". Usage: ${usage(command)}`);

  if (!command.args) return {};
  const result = command.args.safeParse(values);
  if (result.success) return result.data as Record<string, unknown>;
  const issue = result.error.issues[0];
  const name = issue.path.join(".");
  const missing = issue.code === "invalid_type" && values[String(issue.path[0])] === undefined;
  throw new ShellError(missing ? `${command.id}: missing ${name}. Usage: ${usage(command)}` : `${command.id}: ${name}: ${issue.message}`);
}

function split_once(text: string, separator: string): [string, string | undefined] {
  const index = text.indexOf(separator);
  return index === -1 ? [text, undefined] : [text.slice(0, index), text.slice(index + 1)];
}
