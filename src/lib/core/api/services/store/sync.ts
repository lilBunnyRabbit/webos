import { createTask, createTaskGroup, type ExecutableTask } from "@lilbunnyrabbit/task-manager";
import type { TaskContext } from "../tasks/type";
import type { AppId } from "../apps/type";
import { ASSETS_CACHE, file_url, pool, unshared, unused } from "./lists";

// Requests, not bytes, are what an update costs on a phone (ADR-065): a few in flight, never the whole list at once.
const LANES = 6;

export interface SaveOptions {
  base: string;
  signal?: AbortSignal;
  on_file?: (done: number, total: number) => void;
}

export async function save_app(name: string, files: string[], options: SaveOptions): Promise<void> {
  const { base, signal } = options;
  const cache = await caches.open(ASSETS_CACHE);
  let done = 0;
  options.on_file?.(0, files.length);
  await pool(files, LANES, async (file) => {
    signal?.throwIfAborted();
    const url = file_url(base, file);
    if (!(await cache.match(url, { ignoreVary: true }))) {
      // Still in a cache from before one cache held every release (or in the precache): copy, don't download.
      const answer = (await caches.match(url, { ignoreVary: true })) ?? (await fetch(url, { signal }));
      // The host keeps only the latest deploy: a missing file means WebOS changed since this page loaded.
      if (answer.status === 404) throw new Error(`WebOS was updated since this page loaded. Update WebOS to install ${name}.`);
      if (!answer.ok) throw new Error(`${file}: ${answer.status}`);
      await cache.put(url, answer);
    }
    options.on_file?.(++done, files.length);
  });
}

export async function drop_files(own: string[], others: string[][], base: string): Promise<number> {
  const cache = await caches.open(ASSETS_CACHE);
  let removed = 0;
  for (const file of unshared(own, others)) {
    if (await cache.delete(file_url(base, file), { ignoreVary: true })) removed++;
  }
  return removed;
}

export async function prune_files(keep: ReadonlySet<string>, base: string): Promise<number> {
  const cache = await caches.open(ASSETS_CACHE);
  const prefix = new URL(base, location.origin).href;
  const requests = await cache.keys();
  const by_file = new Map(requests.filter((request) => request.url.startsWith(prefix)).map((request) => [request.url.slice(prefix.length), request]));
  const stale = unused([...by_file.keys()], keep);
  await Promise.all(stale.map((file) => cache.delete(by_file.get(file)!, { ignoreVary: true })));
  return stale.length;
}

export interface SyncApp {
  id: AppId;
  name: string;
  files: string[];
}

export interface SyncPlan {
  apps: SyncApp[];
  base: string;
  on_start: (id: AppId) => void;
  on_progress: (id: AppId, fraction: number) => void;
  on_end: (id: AppId, saved: boolean) => void;
}

export function sync_task(plan: SyncPlan, context: TaskContext): ExecutableTask {
  const save = (app: SyncApp) =>
    createTask<void, void>({
      name: app.name,
      async execute() {
        context.signal.throwIfAborted();
        plan.on_start(app.id);
        let saved = false;
        try {
          await save_app(app.name, app.files, {
            base: plan.base,
            signal: context.signal,
            on_file: (done, total) => {
              const fraction = total > 0 ? done / total : 1;
              this.setProgress(fraction);
              plan.on_progress(app.id, fraction);
              context.message(`${app.name} · ${done} of ${total} files`);
            },
          });
          saved = true;
          this.logger.info("Saved");
        } finally {
          plan.on_end(app.id, saved);
        }
      },
    })();
  return createTaskGroup({ name: "Download apps", tasks: () => plan.apps.map(save) })();
}
