import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type FilesService, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import { write_at } from "./pdf-files";
import { latin1, pdf_date, pdf_parts, plan_pdf, type PdfLayout, type TestPdfOptions } from "./test-pdf";

const files = () => kernel.service<FilesService>("files");

const FLUSH = 1 << 20;

export const DOCUMENTS = PATHS.documents;

export async function documents_folder(): Promise<string> {
  if (await files().get_directory(DOCUMENTS)) return DOCUMENTS;
  const home = await files().get_directory(parent_path(DOCUMENTS));
  if (!home) throw new Error("The home folder is missing.");
  await files().create_directory(home, base_name(DOCUMENTS));
  return DOCUMENTS;
}

async function remove(path: string): Promise<void> {
  const folder = await files().get_directory(parent_path(path));
  if (folder) await files().delete_entry(folder, base_name(path)).catch(() => {});
}

export type TestPdfResult = { ok: true; path: string; size: number } | { ok: false; error: string };

// Parts go into Blobs (the browser spills them to disk past its memory limit) and reach `path` in one write at the end,
// so a cancelled run leaves nothing behind.
export async function generate_test_pdf(
  app_id: AppId,
  options: TestPdfOptions,
  target: number | null,
  path: string,
  signal?: AbortSignal
): Promise<TestPdfResult> {
  const existed = (await files().get_file(path)) !== null;
  const name = base_name(path);
  const date = pdf_date(new Date());
  let size = 0;

  const job = kernel.service<TasksService>("tasks").run(
    app_id,
    (context) => {
      let layout: PdfLayout | null = null;
      let total = 0;
      let blob: Blob | null = null;
      const plan = createTask<void, void>({
        name: target === null ? "Lay out" : `Lay out ${format_bytes(target)}`,
        async execute() {
          context.signal.throwIfAborted();
          context.message("Laying out pages");
          const planned = plan_pdf(options, target, date);
          if (!planned.ok) throw new Error(planned.error);
          const { usage, quota } = await files().get_storage_estimate();
          if (planned.bytes > quota - usage)
            throw new Error(`Not enough storage: needs ${format_bytes(planned.bytes)}, ${format_bytes(Math.max(0, quota - usage))} free`);
          layout = planned.layout;
          total = planned.bytes;
          this.logger.info(`${options.pages} pages · ${format_bytes(total)}`);
        },
      });
      const pages = createTask<void, void>({
        name: `Write ${options.pages} ${options.pages === 1 ? "page" : "pages"}`,
        async execute() {
          const parts: Blob[] = [];
          let pending = "";
          let done = 0;
          let page = 0;
          let shown = -1;
          const report = async () => {
            context.signal.throwIfAborted();
            this.setProgress(done / total);
            context.message(`Page ${page + 1} of ${options.pages} · ${format_bytes(done)} of ${format_bytes(total)}`);
            await context.pace();
          };
          const flush = () => {
            if (!pending) return;
            parts.push(new Blob([latin1(pending) as BlobPart]));
            pending = "";
          };
          for (const part of pdf_parts(options, layout!, (index) => (page = index))) {
            if (typeof part === "string") {
              pending += part;
              if (pending.length >= FLUSH) flush();
            } else {
              flush();
              for (const chunk of part.chunks()) {
                parts.push(new Blob([chunk as BlobPart]));
                done += chunk.length;
                await report();
              }
              continue;
            }
            done += part.length;
            if (page !== shown) {
              shown = page;
              await report();
            }
          }
          flush();
          if (done !== total) throw new Error(`Wrote ${done} bytes, expected ${total}`);
          blob = new Blob(parts, { type: "application/pdf" });
        },
      });
      const write = createTask<void, void>({
        name: "Write file",
        async execute() {
          context.signal.throwIfAborted();
          context.message(`Writing ${name}`);
          try {
            await write_at(path, blob!);
          } catch (error) {
            if (!existed) await remove(path);
            throw error;
          }
          size = blob!.size;
          this.logger.info(`${path} · ${format_bytes(size)}`);
        },
      });
      return createTaskGroup({ name: `Test PDF ${name}`, tasks: () => [plan(), pages(), write()] })();
    },
    {
      title: `Generating ${name}`,
      signal,
      done: () => ({
        title: "Test PDF saved",
        message: `${path} · ${options.pages} ${options.pages === 1 ? "page" : "pages"} · ${format_bytes(size)}`,
        actions: [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(path) }],
      }),
      failed: (error, cancelled) => ({
        title: cancelled ? "Test PDF cancelled" : "Couldn't generate the test PDF",
        message: cancelled ? "Nothing was saved" : error_message(error),
      }),
    }
  );
  await job.done;
  if (job.status === TaskJobStatus.DONE) return { ok: true, path, size };
  return { ok: false, error: job.status === TaskJobStatus.CANCELLED ? "stopped" : (job.error ?? "failed") };
}
