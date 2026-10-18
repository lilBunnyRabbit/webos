import kernel, { type ClipboardService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellService, type ShellSession } from "$lib/core/api/services/shell/type";
import { FORM_EXTENSION, form_stem } from "./answers";
import { store_answer, StoreOutcome, write_text } from "./collect";
import { with_form_id } from "./form";
import { app_link, form_payload, read_answer_code } from "./link";

interface LinkArgs {
  path: string;
  copy: boolean;
}

export async function link({ args, session }: CommandContext<LinkArgs>): Promise<string> {
  const path = resolve_path(session.cwd, args.path);
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new ShellError(`form link: ${path}: no such file`);

  // Stamped like the app's Share does, so answer codes find this file.
  const text = await file.text();
  const source = with_form_id(text);
  if (source !== text) await write_text(path, source);

  const url = app_link({ f: await form_payload({ source, name: form_stem(file.name) }) });
  if (args.copy) await kernel.service<ClipboardService>("clipboard").copy_text(url);
  return url;
}

interface AnswerArgs {
  code: string;
}

export async function answer({ args }: CommandContext<AnswerArgs>): Promise<string> {
  const pasted = await read_answer_code(args.code);
  if (!pasted) throw new ShellError("form answer: that isn't an answer code");

  const result = await store_answer(pasted);
  if (result.outcome === StoreOutcome.NO_FORM) throw new ShellError("form answer: no form in /home matches this answer");
  if (result.outcome === StoreOutcome.UNREADABLE) throw new ShellError(`form answer: ${result.answers_path} isn't an answers file Forms can read`);

  const who = pasted.response.respondent ? `${pasted.response.respondent}'s answer` : "Answer";
  const count = `${result.count} ${result.count === 1 ? "answer" : "answers"}`;
  return result.outcome === StoreOutcome.SAVED ? `Saved ${who} → ${result.answers_path} (${count})` : `Already saved in ${result.answers_path} (${count})`;
}

export async function complete_forms(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || item.value.toLowerCase().endsWith(FORM_EXTENSION));
}
