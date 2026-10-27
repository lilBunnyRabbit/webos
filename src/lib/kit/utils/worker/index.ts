import type { CallMessage, Input, Output, WorkerApi, WorkerMessage } from "./protocol";

export { transfer } from "./protocol";
export type { Input, Method, Output, WorkerApi } from "./protocol";

export interface CallOptions {
  transfer?: Transferable[];
  /** Aborting ends the worker, since a busy worker can't be interrupted otherwise: every pending call rejects. */
  signal?: AbortSignal;
}

export interface SpawnOptions<Event> {
  on_event?: (event: Event) => void;
  stopped?: string;
}

export interface WorkerHandle<Api extends WorkerApi<Api>> {
  call<K extends keyof Api & string>(method: K, input: Input<Api[K]>, options?: CallOptions): Promise<Output<Api[K]>>;
  terminate(reason?: unknown): void;
  readonly alive: boolean;
  readonly pending: number;
}

interface Pending {
  resolve: (value: never) => void;
  reject: (reason: unknown) => void;
  cleanup: () => void;
}

/**
 * Starts a worker (a Vite `?worker` constructor) whose module calls `serve<Api>(handlers)`, and calls its methods by
 * name. An uncaught error in the worker rejects every pending call; the worker is left running for the caller to end.
 */
export function spawn<Api extends WorkerApi<Api>, Event = never>(
  WorkerCtor: new () => Worker,
  options: SpawnOptions<Event> = {}
): WorkerHandle<Api> {
  const worker = new WorkerCtor();
  const pending = new Map<number, Pending>();
  const stopped = () => new Error(options.stopped || "The worker stopped");
  let next_id = 0;
  let alive = true;

  const settle = (id: number) => {
    const job = pending.get(id);
    pending.delete(id);
    job?.cleanup();
    return job;
  };

  const fail_all = (reason: unknown) => {
    for (const id of [...pending.keys()]) settle(id)?.reject(reason);
  };

  worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
    if (data.kind === "event") return options.on_event?.(data.event as Event);
    const job = settle(data.id);
    if (!job) return;
    if (data.ok) job.resolve(data.result as never);
    else job.reject(new Error(data.error));
  };
  worker.onerror = (event) => {
    event.preventDefault();
    fail_all(event.message ? new Error(event.message) : stopped());
  };

  const terminate = (reason: unknown = new DOMException("Aborted", "AbortError")) => {
    if (alive) worker.terminate();
    alive = false;
    fail_all(reason);
  };

  return {
    call(method, input, { transfer = [], signal } = {}) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        if (!alive) return reject(stopped());
        const id = next_id++;
        const on_abort = () => terminate(signal!.reason);
        signal?.addEventListener("abort", on_abort, { once: true });
        pending.set(id, {
          resolve: resolve as (value: never) => void,
          reject,
          cleanup: () => signal?.removeEventListener("abort", on_abort),
        });
        worker.postMessage({ id, method, input } satisfies CallMessage, { transfer });
      });
    },
    terminate,
    get alive() {
      return alive;
    },
    get pending() {
      return pending.size;
    },
  };
}
