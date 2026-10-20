import kernel, { type FilesService } from "$lib/core/api";
import { base_name, file_extension, parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import {
  ShellError,
  type CommandContext,
  type Completion,
  type ShellService,
  type ShellSession,
} from "$lib/core/api/services/shell/type";
import { probe_video } from "$kit/utils/video/capture";
import { export_clip, type ClipSettings, type ClipSource } from "./jobs";
import { is_video_name, type Quality } from "./kinds";
import { clamp_range, format_time, Output, output_extension, output_name, parse_time, type Range } from "$kit/utils/video/plan";

const APP_ID = "video-tools";

const files = () => kernel.service<FilesService>("files");
const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

interface ClipArgs {
  path: string;
  from?: string;
  to?: string;
  out?: string;
}

async function source_at(path: string): Promise<ClipSource & { duration: number }> {
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  if (!file.type.startsWith("video/") && !is_video_name(file.name)) throw new ShellError(`${path}: not a video`);
  try {
    const info = await probe_video(file);
    return { name: file.name, path, file, size: { width: info.width, height: info.height }, duration: info.duration };
  } catch {
    throw new ShellError(`${path}: not a video this browser can play`);
  }
}

function time_arg(text: string | undefined, fallback: number, flag: string): number {
  if (text === undefined) return fallback;
  const value = parse_time(text);
  if (value === null) throw new ShellError(`--${flag} ${text}: give seconds or m:ss, like 12.5 or 1:05`);
  return value;
}

function range_of(args: ClipArgs, duration: number): Range {
  const range = clamp_range({ from: time_arg(args.from, 0, "from"), to: time_arg(args.to, duration, "to") }, duration);
  if (range.to - range.from < 0.05)
    throw new ShellError(
      `nothing between ${format_time(range.from)} and ${format_time(range.to)}; the video is ${format_time(duration)} long`
    );
  return range;
}

async function target_of(source: string, output: Output, out: string | undefined, cwd: string, elevated: boolean) {
  let folder = parent_path(source);
  let name = output_name(base_name(source), output);
  if (out !== undefined) {
    const typed = resolve_path(cwd, out);
    if (await files().get_directory(typed)) folder = typed;
    else {
      folder = parent_path(typed);
      if (!(await files().get_directory(folder))) throw new ShellError(`${folder}: no such folder`);
      name =
        file_extension(typed).toLowerCase() === output_extension(output)
          ? base_name(typed)
          : `${base_name(typed)}${output_extension(output)}`;
    }
  }
  assert_writable(child_path(folder, name), elevated);
  return { folder, name };
}

async function run_clip(context: CommandContext<ClipArgs>, settings: ClipSettings): Promise<FileValue> {
  const { args, session, signal, elevated } = context;
  const path = resolve_path(session.cwd, args.path);
  const source = await source_at(path);
  const range = range_of(args, source.duration);
  const target = await target_of(path, settings.output, args.out, session.cwd, elevated);
  const outcome = await export_clip({ app_id: APP_ID, source, range, settings, target, signal });
  if (!outcome.ok) throw new ShellError(outcome.cancelled ? "stopped" : outcome.error);
  const file = await files().get_file(outcome.result.path);
  return file_value(outcome.result.path, "file", file?.size ?? null, file?.lastModified ?? null);
}

export function trim(context: CommandContext<ClipArgs & { quality: Quality; mute: boolean }>): Promise<FileValue> {
  return run_clip(context, { output: Output.WEBM, quality: context.args.quality, audio: !context.args.mute });
}

export function gif(
  context: CommandContext<ClipArgs & { fps: number; width: number; plain: boolean }>
): Promise<FileValue> {
  const { fps, width, plain } = context.args;
  return run_clip(context, { output: Output.GIF, fps, width, dither: !plain });
}

export function audio(context: CommandContext<ClipArgs>): Promise<FileValue> {
  return run_clip(context, { output: Output.AUDIO });
}

export async function complete_videos(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || is_video_name(item.value));
}
