import { z } from "zod";
import type { AiMessage, AiService, AiUsage } from "$lib/core/api/services/ai/type";
import { usage } from "$lib/core/api/services/shell/parse";
import { EntryStatus, type Command, type ShellService } from "$lib/core/api/services/shell/type";
import { to_text } from "$lib/core/api/services/shell/values";

export const APP_ID = "ask";
export const ENABLED_FILE = "commands.json";
export const ENABLED_PATH = `/var/lib/apps/${APP_ID}/${ENABLED_FILE}`;
const EnabledV2 = z.object({ version: z.literal(2), on: z.array(z.string()), speak: z.boolean() });
const EnabledV1 = z.object({ version: z.literal(1), on: z.array(z.string()) });
export type Enabled = z.infer<typeof EnabledV2>;
export const EnabledSchema = z.union([EnabledV2, EnabledV1.transform(({ on }): Enabled => ({ version: 2, on, speak: false }))]);
export const EMPTY_ENABLED: Enabled = { version: 2, on: [], speak: false };

export const NONE = "none";
const MAX_ARGS = 6;
// A command's output shares the chat's few thousand tokens with everything else.
export const MAX_DATA_CHARS = 3_000;

export interface Pick {
  command: string;
  args: string[];
}

/** What the last question ran, so "and the day after?" can lean on it. */
export interface Previous {
  question: string;
  line: string | null;
}

export interface Ran {
  line: string;
  text: string;
  failed: boolean;
}

export const eligible = (commands: readonly Command[]) =>
  commands.filter((command) => command.ai === "read").sort((a, b) => a.id.localeCompare(b.id));

export const catalogue_line = (command: Command) => `- ${usage(command)}: ${command.description}`;

export const PICK_RULES = [
  "You pick the one command that reads the data needed to answer the user's question, from the user's own apps in WebOS.",
  `Answer with the command and its arguments in order, as they'd be typed after it. Pick "${NONE}" when no command fits: chit-chat, general knowledge, maths, writing.`,
  "Commands:",
].join("\n");

export function pick_messages(catalogue: readonly Command[], question: string, previous: Previous | null): AiMessage[] {
  const context = previous ? `Previous question: "${previous.question}" (ran: ${previous.line ?? NONE})\n` : "";
  return [
    { role: "system", content: `${PICK_RULES}\n${catalogue.map(catalogue_line).join("\n")}` },
    { role: "user", content: `${context}Question: ${question}` },
  ];
}

export function pick_schema(ids: readonly string[]) {
  return z.object({ command: z.enum([NONE, ...ids]), args: z.array(z.string()).max(MAX_ARGS) });
}

const FLAG = /^--?[a-z][\w-]*$/i;

/** Arguments are quoted, so whatever the model writes stays an argument: no pipe or second command can sneak in. */
export function command_line({ command, args }: Pick): string {
  const quoted = args.map((arg) => (FLAG.test(arg) ? arg : `"${arg.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`));
  return [command, ...quoted].join(" ");
}

export function clip(text: string, max = MAX_DATA_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}\n… (cut here, more data follows)` : text;
}

/** What the chat model is sent for one question: the question, plus the data a command read for it. */
export function question_message(question: string, ran: Ran | null): string {
  if (!ran) return question;
  const data = ran.failed ? `The command failed: ${ran.text}` : ran.text.trim() || "(nothing)";
  return `${question}\n\nData from the user's apps (from \`${ran.line}\`):\n--- data start ---\n${clip(data)}\n--- data end ---`;
}

export async function pick(
  ai: AiService,
  catalogue: readonly Command[],
  question: string,
  previous: Previous | null,
  signal?: AbortSignal
): Promise<Pick | null> {
  if (catalogue.length === 0) return null;
  const schema = pick_schema(catalogue.map((command) => command.id));
  const picked = await ai.extract(pick_messages(catalogue, question, previous), schema, { signal });
  return picked.command === NONE ? null : picked;
}

export async function run(shell: ShellService, line: string, signal?: AbortSignal): Promise<Ran> {
  const handle = shell.session().run(line);
  const abort = () => handle.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await handle.done;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  const { status, error, values } = handle.entry;
  if (status !== EntryStatus.DONE) return { line, text: error ?? status, failed: true };
  return { line, text: values.map((value) => to_text(value, (type) => shell.value_type(type))).join("\n"), failed: false };
}

/** Picks a command and runs it; `null` when none fits or no command is switched on. */
export async function gather(
  ai: AiService,
  shell: ShellService,
  catalogue: readonly Command[],
  question: string,
  previous: Previous | null,
  signal?: AbortSignal
): Promise<Ran | null> {
  const picked = await pick(ai, catalogue, question, previous, signal);
  return picked ? run(shell, command_line(picked), signal) : null;
}

export interface Breakdown {
  window: number;
  instructions: number;
  conversation: number;
  free: number;
}

export function breakdown(session: AiUsage, instructions: number): Breakdown {
  const used = Math.min(session.used, session.window);
  const head = Math.min(instructions, used);
  return { window: session.window, instructions: head, conversation: used - head, free: session.window - used };
}

/** How many more questions fit at the pace so far; `null` before the first answer. */
export function questions_left(b: Breakdown, questions: number): number | null {
  if (questions === 0 || b.conversation === 0) return null;
  return Math.floor(b.free / (b.conversation / questions));
}

export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
