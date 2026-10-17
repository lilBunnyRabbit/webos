import { error_message } from "$lib/core/utils";
import { parent_path } from "./path";
import type { RenameStep } from "./rename-pattern";
import type { FilesService } from "./type";

interface Done {
  folder: FileSystemDirectoryHandle;
  from: string;
  to: string;
}

// A step onto a name another step still holds hops through a temporary name, so swaps and rotations work.
export async function apply_renames(files: FilesService, steps: RenameStep[]): Promise<RenameStep[]> {
  const changing = steps.filter((step) => step.new_name !== step.name);
  if (changing.some((step) => step.problem)) throw new Error("The plan has problems");

  const folders = new Map<string, FileSystemDirectoryHandle>();
  const folder_of = async (step: RenameStep) => {
    const path = parent_path(step.path);
    const folder = folders.get(path) ?? (await files.get_directory(path));
    if (!folder) throw new Error(`${path} doesn't exist`);
    folders.set(path, folder);
    return folder;
  };

  const held = new Set(changing.map((step) => `${parent_path(step.path)}\0${step.name}`));
  const tag = crypto.randomUUID().slice(0, 8);
  const done: Done[] = [];
  const rename = async (folder: FileSystemDirectoryHandle, from: string, to: string) => {
    await files.rename_entry(folder, from, to);
    done.push({ folder, from, to });
  };

  const hops: { folder: FileSystemDirectoryHandle; temp: string; step: RenameStep }[] = [];
  let current: RenameStep | null = null;
  try {
    for (const [index, step] of changing.entries()) {
      current = step;
      const folder = await folder_of(step);
      if (!held.has(`${parent_path(step.path)}\0${step.new_name}`)) {
        await rename(folder, step.name, step.new_name);
        continue;
      }
      const temp = `.rename-${tag}-${index}`;
      await rename(folder, step.name, temp);
      hops.push({ folder, temp, step });
    }
    for (const { folder, temp, step } of hops) {
      current = step;
      await rename(folder, temp, step.new_name);
    }
  } catch (error) {
    const stuck: string[] = [];
    for (const { folder, from, to } of done.reverse()) {
      await files.rename_entry(folder, to, from).catch(() => stuck.push(to));
    }
    const what = current ? `Couldn't rename "${current.name}": ${error_message(error)}` : error_message(error);
    throw new Error(
      stuck.length === 0 ? `${what}. Nothing was renamed.` : `${what}. Couldn't undo ${stuck.length}: ${stuck.join(", ")}`,
      { cause: error }
    );
  }
  return changing;
}
