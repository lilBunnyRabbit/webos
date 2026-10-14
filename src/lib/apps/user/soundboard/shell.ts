import kernel, {
  NotificationType,
  type AppsService,
  type FilesService,
  type NotificationsService,
} from "$lib/core/api";
import { is_file_value } from "$lib/core/api/services/files/shell";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ShellError, type CommandContext, type Completion, type Tagged } from "$lib/core/api/services/shell/type";
import {
  create_pad,
  find_board,
  is_audio,
  resolve_pad,
  type Board,
  type BoardFile,
  type Pad,
  type PadMatch,
} from "./board";
import { with_board } from "./board-file.svelte";
import { sound_player, stop_everything } from "./player.svelte";
import { APP_ID, import_sound } from "./store";
import { error_message } from "$lib/core/utils";

const files = () => kernel.service<FilesService>("files");

export function pad_value(board: Board, pad: Pad): Tagged {
  return { $type: "pad", id: pad.id, key: pad.key ?? "", label: pad.label, board: board.name, loop: pad.loop };
}

function boards_of(file: BoardFile, board?: string): Board[] {
  if (!board) return file.boards;
  const found = find_board(file, board);
  if (!found) throw new ShellError(`no board "${board}"`);
  return [found];
}

async function find(query: string, board?: string): Promise<PadMatch> {
  return with_board(({ value }) => {
    const found = resolve_pad(boards_of(value, board), query);
    if (typeof found === "string") throw new ShellError(found);
    return { board: { ...found.board, pads: [] }, pad: { ...found.pad } };
  });
}

export function open_app(): void {
  kernel.service<AppsService>("apps").launch(APP_ID);
}

export async function* list({ args }: CommandContext<{ board?: string }>): AsyncGenerator<Tagged> {
  const values = await with_board(({ value }) =>
    boards_of(value, args.board).flatMap((board) => board.pads.map((pad) => pad_value(board, pad)))
  );
  yield* values;
}

async function play_pad(pad: Pad): Promise<string> {
  const player = sound_player();
  const stopping = pad.loop && player.playing.has(pad.id);
  try {
    if (!stopping) await player.unlock();
    await player.trigger(pad);
  } catch (reason) {
    throw new ShellError(`couldn't play “${pad.label}”: ${error_message(reason)}`);
  }
  return `${stopping ? "stopped" : "playing"} “${pad.label}”`;
}

export async function play({ args }: CommandContext<{ pad: string; board?: string }>): Promise<string> {
  return play_pad((await find(args.pad, args.board)).pad);
}

export async function open_pad(id: string): Promise<void> {
  try {
    await play_pad((await find(id)).pad);
  } catch (reason) {
    kernel.service<NotificationsService>("notifications").notify(APP_ID, {
      type: NotificationType.ERROR,
      title: "Couldn't play the sound",
      message: error_message(reason),
    });
  }
}

export function stop(): string {
  const count = stop_everything();
  return count ? `stopped ${count} ${count === 1 ? "sound" : "sounds"}` : "nothing is playing";
}

async function paths_from(context: CommandContext<{ paths: string[] }>): Promise<string[]> {
  const { args, session, piped, input } = context;
  if (args.paths.length > 0 || !piped) return args.paths.map((path) => resolve_path(session.cwd, path));
  const paths: string[] = [];
  for await (const value of input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(resolve_path(session.cwd, value));
  }
  return paths;
}

export async function* add(context: CommandContext<{ paths: string[]; board?: string }>): AsyncGenerator<Tagged> {
  const paths = await paths_from(context);
  if (paths.length === 0) throw new ShellError("sb add: give one or more audio files");

  const sounds: File[] = [];
  for (const path of paths) {
    const file = await files().get_file(path);
    if (!file) throw new ShellError(`${path}: no such file`);
    if (!is_audio(file.name, file.type)) throw new ShellError(`${path}: not an audio file`);
    sounds.push(file);
  }

  if (context.args.board) await with_board(({ value }) => boards_of(value, context.args.board));
  // Copied before the board is read: creating the sounds folder bumps the board's folder revision, and a re-read racing
  // the first save would drop the new pads.
  const imported: { sound: string; name: string }[] = [];
  for (const file of sounds) imported.push({ sound: await import_sound(files(), file), name: file.name });

  const values = await with_board(({ value }) => {
    const board = boards_of(value, context.args.board)[0];
    return imported.map(({ sound, name }) => {
      const pad = create_pad(board.pads, sound, name, crypto.randomUUID());
      board.pads.push(pad);
      return pad_value(board, pad);
    });
  });
  yield* values;
}

export async function complete_pads(partial: string): Promise<Completion[]> {
  const query = partial.toLowerCase();
  return with_board(({ value }) =>
    value.boards.flatMap((board) =>
      board.pads
        .filter((pad) => pad.label.toLowerCase().includes(query) || pad.key === query)
        .map((pad) => ({ value: pad.label, detail: [pad.key?.toUpperCase(), board.name].filter(Boolean).join(" · ") }))
    )
  );
}

export async function complete_boards(partial: string): Promise<Completion[]> {
  const query = partial.toLowerCase();
  return with_board(({ value }) =>
    value.boards
      .filter((board) => board.name.toLowerCase().includes(query))
      .map((board) => ({ value: board.name, detail: `${board.pads.length} pads` }))
  );
}
