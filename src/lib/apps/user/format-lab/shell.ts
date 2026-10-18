import kernel, { TaskJobStatus, type FilesService, type ShellService } from "$lib/core/api";
import { parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, is_file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellSession } from "$lib/core/api/services/shell/type";
import { CODECS, default_options, type CodecFormat } from "$kit/utils/codecs/formats";
import { child_path, convert_images, images_in } from "./convert-job";
import { is_image, is_image_name } from "./source";

const APP_ID = "format-lab";

const files = () => kernel.service<FilesService>("files");

export async function complete_images(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || is_image_name(item.value));
}

async function input_paths(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given;
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(value);
  }
  return paths;
}

export interface ConvertArgs {
  paths: string[];
  to: CodecFormat;
  quality?: number;
  out?: string;
}

export async function convert(context: CommandContext<ConvertArgs>): Promise<FileValue[]> {
  const { args, session, signal, elevated } = context;
  const typed = await input_paths(args.paths, context);
  if (typed.length === 0) throw new ShellError("convert needs at least one image or folder");
  const paths: string[] = [];
  for (const path of typed.map((item) => resolve_path(session.cwd, item))) {
    if (await files().get_directory(path)) paths.push(...(await images_in(path)));
    else paths.push(path);
  }
  if (paths.length === 0) throw new ShellError("no images to convert");
  for (const path of paths) {
    const file = await files().get_file(path);
    if (!file) throw new ShellError(`${path}: no such file`);
    if (!is_image(file)) throw new ShellError(`${path}: not an image`);
  }

  const folder = args.out === undefined ? null : resolve_path(session.cwd, args.out);
  if (folder !== null && !(await files().get_directory(folder))) throw new ShellError(`${folder}: no such folder`);
  for (const target of new Set(folder === null ? paths.map(parent_path) : [folder])) assert_writable(child_path(target, "x"), elevated);

  const options = { ...default_options(args.to), ...(args.quality === undefined ? {} : { quality: args.quality }) };
  const outcome = await convert_images({ app_id: APP_ID, paths, format: args.to, options, folder, signal });
  if (outcome.status !== TaskJobStatus.DONE) {
    throw new ShellError(outcome.status === TaskJobStatus.CANCELLED ? "stopped" : (outcome.error ?? `couldn't write ${CODECS[args.to].label}`));
  }
  return Promise.all(
    outcome.written.map(async (path) => {
      const file = await files().get_file(path);
      return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
    })
  );
}
