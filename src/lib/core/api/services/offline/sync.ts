import { createTask, createTaskGroup, type ExecutableTask } from "@lilbunnyrabbit/task-manager";
import type { TaskContext } from "../tasks/type";
import type { AppId } from "../apps/type";
import { assets_cache, parse_list, pool } from "./lists";

// Requests, not bytes, are what an update costs on a phone (ADR-065): a few in flight, never the whole list at once.
const LANES = 6;

export interface SaveOptions {
  build: number;
  base: string;
  signal?: AbortSignal;
  on_file?: (done: number, total: number) => void;
}

export async function save_app(id: AppId, options: SaveOptions): Promise<void> {
  const { build, base, signal } = options;
  const response = await fetch(`${base}offline/${id}.json`, { cache: "no-cache", signal });
  if (!response.ok) throw new Error(`No file list for ${id} (${response.status})`);
  const files = parse_list(await response.text(), build);
  if (!files) throw new Error("WebOS was updated since this page loaded. Reload to keep apps offline.");

  const cache = await caches.open(assets_cache(build));
  let done = 0;
  options.on_file?.(0, files.length);
  await pool(files, LANES, async (file) => {
    signal?.throwIfAborted();
    const url = new URL(base + file, location.origin).href;
    if (!(await cache.match(url, { ignoreVary: true }))) {
      // A file the update didn't rename is still in the previous build's cache (or the precache): copy, don't download.
      const answer = (await caches.match(url, { ignoreVary: true })) ?? (await fetch(url, { signal }));
      if (!answer.ok) throw new Error(`${file}: ${answer.status}`);
      await cache.put(url, answer);
    }
    options.on_file?.(++done, files.length);
  });
}

export interface SyncApp {
  id: AppId;
  name: string;
}

export interface SyncPlan {
  apps: SyncApp[];
  build: number;
  base: string;
  on_start: (id: AppId) => void;
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
          await save_app(app.id, {
            build: plan.build,
            base: plan.base,
            signal: context.signal,
            on_file: (done, total) => {
              this.setProgress(total > 0 ? done / total : 1);
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
  return createTaskGroup({ name: "Keep offline", tasks: () => plan.apps.map(save) })();
}
