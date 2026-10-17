import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type FilesService, type TasksService } from "$lib/core/api";
import { can_pick_folders, pick_disk_folder } from "$lib/core/api/services/files/opfs";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { format_bytes } from "$lib/core/utils";
import { folder_from_files, folder_from_handle, top_level_groups, type PickedFolder } from "./folder-tree";

const files = () => kernel.service<FilesService>("files");

function pick_with_input(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** The folder chooser where there is one, `webkitdirectory` otherwise (Android). `null` on cancel. */
export async function pick_device_folder(): Promise<PickedFolder | null> {
  if (!can_pick_folders) return folder_from_files(await pick_with_input());
  const handle = await pick_disk_folder("read");
  return handle ? folder_from_handle(handle) : null;
}

/** Copies a picked folder, tree and all, into `target` as a task: one step creates the folder, then one per top-level entry. */
export async function copy_folder_in(folder: PickedFolder, target: string): Promise<string | null> {
  const total = folder.files.reduce((sum, entry) => sum + entry.file.size, 0);
  let created = "";
  const job = kernel.service<TasksService>("tasks").run(
    "file-explorer",
    (context) => {
      const directories = new Map<string, FileSystemDirectoryHandle>();
      let done = 0;

      async function directory_at(path: string[]): Promise<FileSystemDirectoryHandle> {
        const key = path.join("/");
        const known = directories.get(key);
        if (known) return known;
        const parent = await directory_at(path.slice(0, -1));
        const handle = await files().create_directory(parent, path.at(-1)!);
        directories.set(key, handle);
        return handle;
      }

      const create = createTask<void, string>({
        name: "Create folder",
        async execute() {
          const parent = await files().get_directory(target);
          if (!parent) throw new Error(`${target} doesn't exist`);
          const root = await files().create_directory(parent, folder.name);
          directories.clear();
          directories.set("", root);
          created = join_path([...split_path(target), root.name]);
          this.logger.info(created);
          return created;
        },
      });

      const copy = (group: ReturnType<typeof top_level_groups>[number]) =>
        createTask<void, void>({
          name: group.directory ? `${group.name}/` : group.name,
          parse: () => ({ status: format_bytes(group.size) }),
          async execute() {
            let mine = 0;
            for (const path of group.folders) await directory_at(path);
            for (const entry of group.files) {
              context.signal.throwIfAborted();
              const parent = await directory_at(entry.path.slice(0, -1));
              await files().create_file(parent, entry.path.at(-1)!, { content: entry.file, overwrite: true });
              mine += entry.file.size;
              done += entry.file.size;
              this.setProgress(group.size > 0 ? mine / group.size : 1);
              context.message(`${format_bytes(done)} of ${format_bytes(total)}`);
              await context.pace();
            }
            this.logger.info(`Copied ${group.files.length} ${group.files.length === 1 ? "file" : "files"}`);
          },
        })();

      return createTaskGroup({ name: `Upload ${folder.name}`, tasks: () => [create(), ...top_level_groups(folder).map(copy)] })();
    },
    {
      title: `Uploading ${folder.name}`,
      done: () => ({
        title: `Uploaded ${folder.files.length} ${folder.files.length === 1 ? "file" : "files"}`,
        message: created,
        actions: [{ label: "Show folder", on_click: () => kernel.service<AppsService>("apps").launch("file-explorer", { path: created }) }],
      }),
      failed: (_error, cancelled) => ({ title: cancelled ? "Upload cancelled" : "Couldn't upload the folder", message: created ? `Already written: ${created}` : undefined }),
    }
  );
  await job.done;
  return job.status === TaskJobStatus.DONE ? created : null;
}
