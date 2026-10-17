import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type FilesService, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import { download_name, explain_fetch_error, status_line, type Prepared } from "./request";

const files = () => kernel.service<FilesService>("files");

export interface DownloadTarget {
  folder: string;
  name?: string;
}

export type DownloadResult = { ok: true; path: string; size: number } | { ok: false; error: string; cancelled: boolean };

interface Part {
  handle: FileSystemFileHandle;
  name: string;
  size: number;
}

const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export async function downloads_folder(): Promise<string> {
  if (await files().get_directory(PATHS.downloads)) return PATHS.downloads;
  const home = await files().get_directory(parent_path(PATHS.downloads));
  if (!home) throw new Error("The home folder is missing.");
  await files().create_directory(home, base_name(PATHS.downloads));
  return PATHS.downloads;
}

function problem(error: unknown, url: string): string {
  if (!(error instanceof TypeError)) return error_message(error);
  const { title, detail } = explain_fetch_error(error, url, { online: navigator.onLine, protocol: location.protocol });
  return `${title}. ${detail}`;
}

// The body streams into a part file in /tmp and moves into place once complete, so a cancelled or failed run leaves
// nothing in the target folder and the folder never shows a half-written file.
export async function download(app_id: AppId, request: Prepared, target: DownloadTarget, signal?: AbortSignal): Promise<DownloadResult> {
  if (signal?.aborted) return { ok: false, error: "stopped", cancelled: true };
  const label = target.name ?? download_name(request.url, null, null);
  let path = "";
  let size = 0;

  const job = kernel.service<TasksService>("tasks").run(
    app_id,
    (context) => {
      let part: Part | null = null;
      const fetch_body = createTask<void, void>({
        name: "Download",
        parse() {
          if (this.status === "in-progress") return { status: request.url };
        },
        async execute() {
          context.signal.throwIfAborted();
          const response = await fetch(request.url, { ...request.init, signal: context.signal }).catch((error: unknown) => {
            throw new Error(problem(error, request.url));
          });
          if (!response.ok) throw new Error(`The server answered ${status_line(response.status, response.statusText)}`);
          const name = target.name ?? download_name(response.url || request.url, response.headers.get("content-disposition"), response.headers.get("content-type"));
          const length = Number(response.headers.get("content-length"));
          const total = Number.isFinite(length) && length > 0 && !response.headers.get("content-encoding") ? length : null;
          this.logger.info(`${status_line(response.status, response.statusText)} · ${total === null ? "size unknown" : format_bytes(total)}`);

          const tmp = await files().get_directory(PATHS.tmp);
          if (!tmp) throw new Error("The /tmp folder is missing.");
          const handle = await files().create_file(tmp, `api-client-${crypto.randomUUID()}.part`);
          const writable = await handle.createWritable();
          let received = 0;
          try {
            const reader = response.body?.getReader();
            while (reader) {
              const { done, value } = await reader.read();
              if (done) break;
              await writable.write(value);
              received += value.byteLength;
              if (total !== null) this.setProgress(Math.min(received / total, 0.99));
              context.message(total === null ? format_bytes(received) : `${format_bytes(received)} of ${format_bytes(total)}`);
            }
            await writable.close();
          } catch (error) {
            await writable.abort().catch(() => {});
            await files().delete_entry(tmp, handle.name).catch(() => {});
            throw error;
          }
          part = { handle, name, size: received };
        },
      });

      const save = createTask<void, void>({
        name: "Save",
        async execute() {
          const { handle, name, size: bytes } = part!;
          const tmp = await files().get_directory(PATHS.tmp);
          const folder = await files().get_directory(target.folder);
          if (!folder) {
            await files().delete_entry(tmp, handle.name).catch(() => {});
            throw new Error(`${target.folder}: no such folder`);
          }
          const moved = await files().move_file(tmp, handle, folder, name);
          path = child_path(target.folder, moved.name);
          size = bytes;
          context.message(null);
          this.logger.info(`${path} · ${format_bytes(size)}`);
        },
      });

      return createTaskGroup({ name: `Download ${label}`, tasks: () => [fetch_body(), save()] })();
    },
    {
      title: `Downloading ${label}`,
      signal,
      done: () => ({
        title: "Downloaded",
        message: `${path} · ${format_bytes(size)}`,
        actions: [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(path) }],
      }),
      failed: (error, cancelled) => ({
        title: cancelled ? "Download cancelled" : "Download failed",
        message: cancelled ? "Nothing was saved" : error_message(error),
      }),
    }
  );
  await job.done;
  if (job.status === TaskJobStatus.DONE) return { ok: true, path, size };
  const cancelled = job.status === TaskJobStatus.CANCELLED;
  return { ok: false, error: cancelled ? "stopped" : (job.error ?? "failed"), cancelled };
}
