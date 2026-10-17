import kernel, { type ClipboardService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellService, type ShellSession } from "$lib/core/api/services/shell/type";
import { FORM_EXTENSION, form_stem } from "./answers";
import { app_link, form_payload } from "./link";

interface LinkArgs {
  path: string;
  copy: boolean;
}

export async function link({ args, session }: CommandContext<LinkArgs>): Promise<string> {
  const path = resolve_path(session.cwd, args.path);
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new ShellError(`form link: ${path}: no such file`);

  const url = app_link({ f: await form_payload({ source: await file.text(), name: form_stem(file.name) }) });
  if (args.copy) await kernel.service<ClipboardService>("clipboard").copy_text(url);
  return url;
}

export async function complete_forms(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || item.value.toLowerCase().endsWith(FORM_EXTENSION));
}
