import type { Quad } from "$kit/utils/perspective";
import { spawn, type WorkerHandle } from "$kit/utils/worker";
import type { Detected, ScanApi, Straightened } from "./scan.worker";
import ScanWorker from "./scan.worker?worker";
import { MAX_SIDE, type PageFilter } from "./warp";

export type { Detected, Straightened };

const IDLE_MS = 30_000;

let worker: WorkerHandle<ScanApi> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

// One worker for every window and sheet, ended once nothing has been asked of it for a while.
async function scan<T>(call: (handle: WorkerHandle<ScanApi>) => Promise<T>): Promise<T> {
  clearTimeout(idle);
  if (!worker?.alive) worker = spawn<ScanApi>(ScanWorker, { stopped: "The scanner stopped" });
  const handle = worker;
  try {
    return await call(handle);
  } finally {
    if (handle.pending === 0) idle = setTimeout(() => handle.terminate(), IDLE_MS);
  }
}

export function detect(source: Blob): Promise<Detected> {
  return scan((handle) => handle.call("detect", source));
}

/** The page inside `quad` (upright photo pixels), flat and filtered: PNG for B&W, JPEG otherwise. */
export function straighten(source: Blob, quad: Quad, filter: PageFilter, max_side = MAX_SIDE): Promise<Straightened> {
  return scan((handle) => handle.call("straighten", { source, quad, filter, max_side }));
}
