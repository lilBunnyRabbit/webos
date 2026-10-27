import { spawn, type Input, type WorkerHandle } from "../worker";
import type { CodecApi, EncodeResult } from "./codecs.worker";
import CodecWorker from "./codecs.worker?worker";
import { CODECS, type CodecFormat, type EncodeOptions, type EncoderFormat } from "./formats";
import type { SsimResult } from "./ssim";

export * from "./formats";
export type { EncodeResult } from "./codecs.worker";
export type { Pixels, SsimResult } from "./ssim";
export { SSIM_STEP, SSIM_WINDOW } from "./ssim";

type Method = keyof CodecApi;

interface Job {
  method: Method;
  input: Input<CodecApi[Method]>;
  resolve: (value: never) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  on_abort?: () => void;
}

interface Slot {
  worker: WorkerHandle<CodecApi>;
  job: Job | null;
  idle: ReturnType<typeof setTimeout> | null;
}

// A worker holds its codec's wasm memory, hundreds of MB after a big AVIF, until it's gone.
const IDLE_MS = 30_000;
const max_workers = () => Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 1));

const slots: Slot[] = [];
const queue: Job[] = [];

function retire(slot: Slot) {
  if (slot.idle) clearTimeout(slot.idle);
  slot.worker.terminate();
  const at = slots.indexOf(slot);
  if (at >= 0) slots.splice(at, 1);
}

function add_slot(): Slot {
  const slot: Slot = { worker: spawn<CodecApi>(CodecWorker, { stopped: "The image codec stopped" }), job: null, idle: null };
  slots.push(slot);
  return slot;
}

// The signal goes to `call()`, which ends the worker on abort: a wasm encode can't be interrupted any other way.
function dispatch(slot: Slot, job: Job) {
  if (job.on_abort) job.signal?.removeEventListener("abort", job.on_abort);
  slot.job = job;
  slot.worker
    .call(job.method, job.input as never, { signal: job.signal })
    .then(
      (result) => {
        slot.job = null;
        slot.idle = setTimeout(() => retire(slot), IDLE_MS);
        job.resolve(result as never);
      },
      (reason: unknown) => {
        slot.job = null;
        // A wasm abort can leave the module unusable, so a failed worker isn't reused.
        retire(slot);
        job.reject(reason);
      }
    )
    .finally(pump);
}

function pump() {
  while (queue.length > 0) {
    let slot = slots.find((candidate) => candidate.job === null);
    if (!slot) {
      if (slots.length >= max_workers()) return;
      slot = add_slot();
    }
    if (slot.idle) clearTimeout(slot.idle);
    slot.idle = null;
    dispatch(slot, queue.shift()!);
  }
}

function run<T>(method: Method, input: Job["input"], signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const job: Job = { method, input, resolve: resolve as (value: never) => void, reject, signal };
    if (signal) {
      job.on_abort = () => {
        queue.splice(queue.indexOf(job), 1);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener("abort", job.on_abort, { once: true });
    }
    queue.push(job);
    pump();
  });
}

export interface CodecCallOptions {
  signal?: AbortSignal;
}

export function encode(
  format: EncoderFormat,
  image: ImageData,
  options: EncodeOptions = {},
  { signal }: CodecCallOptions = {}
): Promise<EncodeResult> {
  return run("encode", { format, image, options }, signal);
}

/** The browser's own decoder when it has one (with jSquash for AVIF where it doesn't), jSquash for JPEG XL. */
export function decode(blob: Blob, { signal }: CodecCallOptions = {}): Promise<ImageData> {
  return run("decode", { blob }, signal);
}

export function compare(a: ImageData, b: ImageData, { signal }: CodecCallOptions = {}): Promise<SsimResult> {
  return run("compare", { a, b }, signal);
}

const probes = new Map<CodecFormat, Promise<boolean>>();

/** Whether this browser can encode the format: the canvas ones are probed once, the wasm ones need WebAssembly. */
export function supported(format: CodecFormat): Promise<boolean> {
  const info = CODECS[format];
  if (info.wasm) return Promise.resolve(typeof WebAssembly === "object");
  let probe = probes.get(format);
  if (!probe) {
    const canvas = new OffscreenCanvas(1, 1);
    canvas.getContext("2d");
    probe = canvas
      .convertToBlob({ type: info.mime })
      .then((blob) => blob.type === info.mime)
      .catch(() => false);
    probes.set(format, probe);
  }
  return probe;
}
