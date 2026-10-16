import { bind, resolve } from "./parse";
import { split_stages, tokenize, type Token } from "./tokenize";
import { ShellError, type Command, type Output, type ShellSession, type Value } from "./type";

export interface Registry {
  find(id: string): Command | undefined;
  /** Every command id, for suggestions and group listings. */
  ids(): string[];
}

export interface Stage {
  command: Command;
  args: Record<string, unknown>;
  elevated: boolean;
}

export const SUDO = "sudo";

/** Turns a line into stages; throws a ShellError for anything the user typed wrong. Empty line: no stages. */
export function plan(line: string, registry: Registry): Stage[] {
  const tokens = tokenize(line);
  if (tokens.length === 0) return [];
  return split_stages(tokens).map((stage, index) => plan_stage(stage, index, registry));
}

function plan_stage(tokens: Token[], index: number, registry: Registry): Stage {
  if (tokens.length === 0) throw new ShellError(index === 0 ? "nothing before |" : "nothing after |");

  const elevated = !tokens[0].quoted && tokens[0].value === SUDO;
  const rest = elevated ? tokens.slice(1) : tokens;
  if (rest.length === 0) throw new ShellError("sudo: which command?");

  const words: string[] = [];
  for (const token of rest) {
    if (token.quoted || token.value.startsWith("-")) break;
    words.push(token.value);
  }

  const match = resolve(words, registry.find);
  if (!match) {
    const group = registry.ids().filter((id) => id.startsWith(`${words[0]} `));
    if (group.length > 0 && words.length === 1) throw new GroupListing(group);
    throw new ShellError(unknown(words.slice(0, 2).join(" "), registry.ids()));
  }
  const available = match.command.available?.() ?? true;
  if (available !== true) throw new ShellError(`${match.command.id}: ${available === false ? "not available right now" : available}`);

  return { command: match.command, args: bind(match.command, rest.slice(match.length)), elevated };
}

/** `win` alone: not an error, the shell lists the group's commands instead. */
export class GroupListing extends Error {
  constructor(public readonly ids: string[]) {
    super("group");
  }
}

function unknown(word: string, ids: string[]): string {
  const close = ids
    .map((id) => ({ id, distance: distance(word, id) }))
    .filter((entry) => entry.distance <= Math.max(1, Math.floor(word.length / 3)))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map((entry) => entry.id);
  return `unknown command "${word}"` + (close.length > 0 ? `. Did you mean ${close.join(", ")}?` : ". Try help");
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function is_stream(output: unknown): output is AsyncIterable<Value> | Iterable<Value> {
  return typeof output === "object" && output !== null && !Array.isArray(output) && typeof (output as Iterator<Value>).next === "function";
}

/** One stream out of whatever a command returned: generators stream, anything else is one value. */
async function* stream(output: Output): AsyncGenerator<Value, void> {
  const resolved = await output;
  if (is_stream(resolved)) {
    yield* resolved;
  } else if (resolved !== undefined) {
    yield resolved as Value;
  }
}

async function* nothing(): AsyncGenerator<Value, void> {}

export interface RunOptions {
  session: ShellSession;
  signal: AbortSignal;
  emit(value: Value): void;
}

/**
 * Chains the stages lazily, each one's output being the next one's input, and pulls the last into `emit`. A stage
 * that stops reading closes the ones before it. Abort stops waiting at once; the generators are closed behind it.
 */
export async function run_stages(stages: Stage[], { session, signal, emit }: RunOptions): Promise<void> {
  let input: AsyncGenerator<Value, void> = nothing();
  for (const [index, stage] of stages.entries()) {
    const context = { args: stage.args, input, piped: index > 0, session, signal, elevated: stage.elevated };
    const previous = input;
    input = (async function* () {
      try {
        yield* stream(stage.command.run(context));
      } finally {
        await previous.return();
      }
    })();
  }

  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
  aborted.catch(() => {});

  try {
    for (;;) {
      const next = await Promise.race([input.next(), aborted]);
      if (next.done) break;
      emit(next.value);
    }
  } finally {
    void input.return().catch(() => {});
  }
}
