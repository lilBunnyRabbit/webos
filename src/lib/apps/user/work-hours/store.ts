import kernel, { type FilesService } from "$lib/core/api";
import { json_file, type JsonFile } from "$lib/core/contexts/app";
import {
  add_entry,
  EMPTY_STATE,
  empty_month,
  month_file_name,
  month_file_path,
  month_of,
  MonthFileSchema,
  new_entry_id,
  parse_month_file,
  parse_state_file,
  serialize,
  split_session,
  STATE_FILE,
  StateFileSchema,
  WORK_HOURS_DIR,
  type MonthFile,
  type Segment,
  type StateFile,
} from "./data";

/*
 * `json_file` cells are only read here, never assigned. A cell re-reads whenever its folder changes, and a re-read that
 * lands while the cell's own write is still in flight adopts the old text (or `initial` for a new file) and drops the
 * change. Writing the file directly, one change at a time, and letting the cells pick it up avoids that.
 */

export function open_month(month: string): JsonFile<MonthFile> {
  return json_file(month_file_path(month), empty_month(month), MonthFileSchema);
}

export function open_state(): JsonFile<StateFile> {
  return json_file(`${WORK_HOURS_DIR}/${STATE_FILE}`, EMPTY_STATE, StateFileSchema);
}

const files = () => kernel.service<FilesService>("files");

async function data_folder(): Promise<FileSystemDirectoryHandle> {
  let folder = await files().get_root();
  for (const segment of WORK_HOURS_DIR.split("/").filter(Boolean)) {
    folder = (await files().exists(folder, segment, "directory")) ? await folder.getDirectoryHandle(segment) : await files().create_directory(folder, segment);
  }
  return folder;
}

let queue: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function edit<T>(name: string, parse: (text: string) => T | null, fallback: T, change: (value: T) => T): Promise<T> {
  const text = (await (await files().get_file(`${WORK_HOURS_DIR}/${name}`))?.text()) ?? null;
  const current = text === null ? fallback : parse(text);
  if (current === null) throw new Error(`${name} isn't valid Work Hours data; it was left as it is`);
  const next = change(current);
  await files().create_file(await data_folder(), name, { content: serialize(next as MonthFile | StateFile), overwrite: true });
  return next;
}

export function edit_month(month: string, change: (file: MonthFile) => MonthFile): Promise<MonthFile> {
  return serial(() => edit(month_file_name(month), parse_month_file, empty_month(month), change));
}

export function edit_state(change: (state: StateFile) => StateFile): Promise<StateFile> {
  return serial(() => edit(STATE_FILE, parse_state_file, EMPTY_STATE, change));
}

export async function clock_in(description = "", now = new Date()): Promise<void> {
  await edit_state((state) => (state.running ? state : { ...state, running: { start: now.toISOString(), description } }));
}

export async function set_running_description(description: string): Promise<void> {
  await edit_state((state) => (state.running ? { ...state, running: { ...state.running, description } } : state));
}

export function clock_out(now = new Date()): Promise<Segment[]> {
  return serial(async () => {
    let running: StateFile["running"] = null;
    await edit(STATE_FILE, parse_state_file, EMPTY_STATE, (state) => {
      running = state.running;
      return { ...state, running: null };
    });
    const ended = running as StateFile["running"];
    if (!ended) return [];
    const segments = split_session(new Date(ended.start), now);
    try {
      const months = new Map<string, Segment[]>();
      for (const segment of segments) months.set(month_of(segment.day), [...(months.get(month_of(segment.day)) ?? []), segment]);
      for (const [month, list] of months) {
        await edit(month_file_name(month), parse_month_file, empty_month(month), (file) =>
          list.reduce((next, segment) => add_entry(next, segment.day, { id: new_entry_id(), start: segment.start, end: segment.end, description: ended.description.trim() }), file)
        );
      }
    } catch (error) {
      await edit(STATE_FILE, parse_state_file, EMPTY_STATE, (state) => ({ ...state, running: ended }));
      throw error;
    }
    return segments;
  });
}
