import { z } from "zod";
import type { Operations } from "./definition";
import { InputError, InputKind, type InputSpec } from "./inputs";

export interface Op {
  op: string;
  value?: string;
}

export type ValueKind = "number" | "word";

export interface Verb {
  label: string;
  value: ValueKind | null;
}

const WORD = /^[a-z0-9]{1,10}$/i;

function check_value(kind: ValueKind, value: string): string {
  if (kind === "number") {
    if (!/^-?\d{1,4}$/.test(value)) throw new InputError(`“${value}” isn't a whole number up to 4 digits.`);
    return String(Number(value));
  }
  if (!WORD.test(value)) throw new InputError(`“${value}”: letters and digits, up to 10.`);
  return value.toLowerCase();
}

export function ops_spec(options: { verbs: Record<string, Verb>; sample: Op[]; random: () => Op[]; max?: number; hint?: string }): InputSpec<Op[]> {
  const max = options.max ?? 40;
  const names = Object.keys(options.verbs);
  const default_verb = names.find((name) => options.verbs[name].value !== null);
  const parse_one = (part: string): Op => {
    const [first, ...rest] = part.split(/\s+/);
    const verb = first.toLowerCase();
    if (options.verbs[verb]) {
      const spec = options.verbs[verb];
      if (spec.value === null) {
        if (rest.length) throw new InputError(`${verb} takes no value.`);
        return { op: verb };
      }
      if (rest.length !== 1) throw new InputError(`${verb} needs one value, like ${verb} ${spec.value === "number" ? "5" : "cat"}.`);
      return { op: verb, value: check_value(spec.value, rest[0]) };
    }
    if (default_verb && rest.length === 0) return { op: default_verb, value: check_value(options.verbs[default_verb].value!, first) };
    throw new InputError(`Can't read “${part}”. Use ${names.join(", ")}.`);
  };
  const check = (ops: Op[]) => {
    if (ops.length === 0) throw new InputError("Give at least one operation.");
    if (ops.length > max) throw new InputError(`At most ${max} operations here.`);
    return ops;
  };
  return {
    kind: InputKind.TEXT,
    hint: options.hint ?? `Operations, comma separated: ${names.map((name) => (options.verbs[name].value ? `${name} ${options.verbs[name].value === "number" ? "5" : "cat"}` : name)).join(", ")}`,
    schema: z
      .array(z.object({ op: z.string(), value: z.string().optional() }))
      .transform((ops, context) => {
        try {
          return check(ops.map((item) => parse_one(item.value === undefined ? item.op : `${item.op} ${item.value}`)));
        } catch (error) {
          context.addIssue({ code: "custom", message: (error as Error).message });
          return z.NEVER;
        }
      }) as unknown as z.ZodType<Op[]>,
    parse: (text) =>
      check(
        text
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
          .map(parse_one)
      ),
    format: (ops) => ops.map((item) => (item.value === undefined ? item.op : `${item.op} ${item.value}`)).join(", "),
    random: options.random,
    sample: options.sample,
  };
}

export function ops_operations(verbs: Record<string, Verb>): Operations<Op[]> {
  return {
    list: Object.entries(verbs).map(([id, verb]) => ({ id, label: verb.label, placeholder: verb.value === null ? null : verb.value === "number" ? "number" : "word" })),
    apply: (input, operation, value) => {
      const verb = verbs[operation];
      if (!verb) throw new InputError("Unknown operation.");
      return [...input, verb.value === null ? { op: operation } : { op: operation, value: check_value(verb.value, value) }];
    },
  };
}

export const op = (name: string, value?: string | number): Op => (value === undefined ? { op: name } : { op: name, value: String(value) });

export function hash_string(text: string, seed = 0): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
