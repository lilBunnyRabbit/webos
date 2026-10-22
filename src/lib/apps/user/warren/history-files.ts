import kernel, { type FilesService } from "$lib/core/api";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { app_data_path } from "$lib/core/contexts/app/json-file.svelte";
import { DOC_ID, parse_document, type WarrenDocument } from "./format";
import { parse_snapshot_name, snapshot_name, to_thin, type Snapshot } from "./history";

export const HISTORY_DIR = app_data_path("warren", "history");

const files = () => kernel.service<FilesService>("files");

function folder_of(doc_id: string): string {
  if (!DOC_ID.test(doc_id)) throw new Error(`Not a document id: ${doc_id}`);
  return join_path([...split_path(HISTORY_DIR), doc_id]);
}

async function ensure(path: string): Promise<FileSystemDirectoryHandle> {
  let directory = await files().get_root();
  for (const segment of split_path(path)) {
    try {
      directory = await directory.getDirectoryHandle(segment);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
      directory = await files().create_directory(directory, segment);
    }
  }
  return directory;
}

export async function list_snapshots(doc_id: string): Promise<Snapshot[]> {
  const directory = await files().get_directory(folder_of(doc_id));
  if (!directory) return [];
  const items = await files().list(directory);
  return items
    .flatMap((item) => (item.kind === "file" ? [parse_snapshot_name(item.name)] : []))
    .filter((snapshot) => snapshot !== null)
    .sort((a, b) => b.at - a.at);
}

export async function read_snapshot(doc_id: string, snapshot: Snapshot): Promise<WarrenDocument> {
  const file = await files().get_file(join_path([...split_path(folder_of(doc_id)), snapshot.name]));
  if (!file) throw new Error("That version is gone");
  return parse_document(await file.text());
}

export async function write_snapshot(doc_id: string, content: string, words: number, at = Date.now()): Promise<Snapshot> {
  const directory = await ensure(folder_of(doc_id));
  const name = snapshot_name(at, words);
  await files().create_file(directory, name, { content, overwrite: true });
  const existing = await list_snapshots(doc_id);
  for (const old of to_thin(existing, Date.now())) await files().delete_entry(directory, old.name);
  return { at, words, name };
}
