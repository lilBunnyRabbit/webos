import { ArgKind } from "./arg";
import { fields, flag_name, resolve, type Field } from "./parse";
import { SUDO, type Registry } from "./pipeline";
import { escape, split_stages, tokenize, type Token } from "./tokenize";
import type { Command, Completer, Completion, CompletionResult, ShellSession, ValueType } from "./type";

export interface CompletionSources extends Registry {
  completer(kind: string): Completer | undefined;
  value_type(type: string): ValueType | undefined;
}

/** Kind of a verb's field arg: completes from the columns of whatever flows into it. */
export const FIELD_KIND = "field";

/**
 * Completions for the token under `cursor`. Only the text before the cursor counts. Values come back escaped and
 * filtered by what's typed; `from`/`to` is the raw span they replace.
 */
export async function complete(input: string, cursor: number, session: ShellSession, sources: CompletionSources): Promise<CompletionResult> {
  const text = input.slice(0, cursor);
  const tokens = tokenize(text);
  const last = tokens.at(-1);
  const typing = last && !last.pipe && last.end === text.length ? last : null;
  const partial = typing?.value ?? "";
  const from = typing?.start ?? cursor;

  const stages = split_stages(typing ? tokens.slice(0, -1) : tokens);
  let stage = stages.at(-1)!;
  if (stage[0]?.value === SUDO && !stage[0].quoted) stage = stage.slice(1);

  const items = await candidates(stage, partial, stages.slice(0, -1), session, sources);
  const needle = partial.toLowerCase();
  const seen = new Set<string>();
  const matching = items.filter((item) => {
    if (!item.value.toLowerCase().startsWith(needle) || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
  return { from, to: cursor, items: matching.map((item) => ({ ...item, label: item.label ?? item.value, value: escape(item.value) })) };
}

async function candidates(stage: Token[], partial: string, upstream: Token[][], session: ShellSession, sources: CompletionSources): Promise<Completion[]> {
  const words: string[] = [];
  for (const token of stage) {
    if (token.quoted || token.value.startsWith("-")) break;
    words.push(token.value);
  }
  const named = command_names(words.length === stage.length ? words : null, partial, sources);

  const match = resolve(words, sources.find);
  if (!match) return named;
  const command = match.command;
  const rest = stage.slice(match.length);
  const list = fields(command);

  if (partial.startsWith("-")) return flags(list, rest);

  const previous = rest.at(-1);
  if (previous?.value.startsWith("--") && !previous.quoted && !previous.value.includes("=")) {
    const field = list.find((candidate) => !candidate.positional && flag_name(candidate.name) === previous.value.slice(2));
    if (field && field.type !== "boolean") return values(command, field, partial, upstream, session, sources);
  }

  const field = positional_at(list, rest);
  const own = field ? await values(command, field, partial, upstream, session, sources) : [];
  return [...named, ...own];
}

/** Next words of command ids that start with what's typed. `null`: already past the command words. */
function command_names(words: string[] | null, partial: string, sources: CompletionSources): Completion[] {
  if (!words) return [];
  const typed = [...words, partial].join(" ");
  const items = new Map<string, Completion>();
  for (const id of sources.ids()) {
    if (!id.startsWith(typed)) continue;
    const parts = id.split(" ");
    if (parts.length <= words.length || parts.slice(0, words.length).join(" ") !== words.join(" ")) continue;
    const value = parts[words.length];
    const whole = parts.length === words.length + 1;
    if (whole) items.set(value, { value, detail: sources.find(id)?.description });
    else if (!items.has(value)) items.set(value, { value, detail: "group" });
  }
  return [...items.values()].sort((a, b) => a.value.localeCompare(b.value));
}

function flags(list: Field[], rest: Token[]): Completion[] {
  const used = new Set(rest.map((token) => token.value));
  return list
    .filter((field) => !field.positional && (field.type === "array" || !used.has(`--${flag_name(field.name)}`)))
    .map((field) => ({ value: `--${flag_name(field.name)}`, detail: field.description, final: field.type === "boolean" }));
}

/** The positional field the next token fills, skipping flags and their values. */
function positional_at(list: Field[], rest: Token[]): Field | undefined {
  const positional = list.filter((field) => field.positional);
  let count = 0;
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.quoted && token.value.startsWith("-") && token.value !== "-") {
      const field = list.find((candidate) => !candidate.positional && `--${flag_name(candidate.name)}` === token.value);
      if (field && field.type !== "boolean") index++;
      continue;
    }
    count++;
  }
  return positional[count] ?? (positional.at(-1)?.type === "array" ? positional.at(-1) : undefined);
}

async function values(command: Command, field: Field, partial: string, upstream: Token[][], session: ShellSession, sources: CompletionSources): Promise<Completion[]> {
  const own = await command.complete?.(field.name, partial, { session });
  if (own) return own;
  if (field.options) return field.options.map((value) => ({ value }));
  if (field.type === "boolean") return [{ value: "true" }, { value: "false" }];
  if (field.kind === FIELD_KIND) {
    const type = upstream_type(upstream, sources);
    return (type ? (sources.value_type(type)?.columns ?? []) : []).map((value) => ({ value }));
  }
  if (field.kind === ArgKind.COMMAND) {
    return sources.ids().map((id) => ({ value: id.split(" ")[0] })).sort((a, b) => a.value.localeCompare(b.value));
  }
  const completer = field.kind ? sources.completer(field.kind) : undefined;
  return completer ? await completer(partial, { session }) : [];
}

/** The `$type` flowing out of the stages before the current one, looking through filters. */
function upstream_type(stages: Token[][], sources: CompletionSources): string | undefined {
  for (let index = stages.length - 1; index >= 0; index--) {
    const stage = stages[index][0]?.value === SUDO ? stages[index].slice(1) : stages[index];
    const words = stage.filter((token) => !token.quoted && !token.value.startsWith("-")).map((token) => token.value);
    const yields = resolve(words, sources.find)?.command.yields;
    if (yields !== "input") return yields;
  }
  return undefined;
}
