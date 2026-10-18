import type { CodecRequest, CodecResponse, EncodeResult } from "./codecs.worker";
import CodecWorker from "./codecs.worker?worker";
import { CODECS, CodecFormat, type EncodeOptions } from "./formats";
import type { SsimResult } from "./ssim";

export * from "./formats";
export type { EncodeResult } from "./codecs.worker";
export type { Pixels, SsimResult } from "./ssim";
export { SSIM_STEP, SSIM_WINDOW } from "./ssim";

type Request = CodecRequest extends infer R ? (R extends CodecRequest ? Omit<R, "id"> : never) : never;

interface Job {
  request: CodecRequest;
  resolve: (value: never) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  on_abort?: () => void;
}

interface Slot {
  worker: Worker;
  job: Job | null;
  idle: ReturnType<typeof setTimeout> | null;
}

// A worker holds its codec's wasm memory, hundreds of MB after a big AVIF, until it's gone.
const IDLE_MS = 30_000;
const max_workers = () => Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 2) - 1));

const slots: Slot[] = [];
const queue: Job[] = [];
let next_id = 0;

function retire(slot: Slot) {
  if (slot.idle) clearTimeout(slot.idle);
  slot.worker.terminate();
  slots.splice(slots.indexOf(slot), 1);
}

function finish(job: Job) {
  if (job.on_abort) job.signal?.removeEventListener("abort", job.on_abort);
}

function spawn(): Slot {
  const slot: Slot = { worker: new CodecWorker(), job: null, idle: null };
  slot.worker.onmessage = ({ data }: MessageEvent<CodecResponse>) => {
    const job = slot.job;
    slot.job = null;
    if (job && job.request.id === data.id) {
      finish(job);
      if (data.ok) job.resolve(data.result as never);
      else job.reject(new Error(data.error));
    }
    // A wasm abort can leave the module unusable, so a failed worker isn't reused.
    if (!data.ok) retire(slot);
    else slot.idle = setTimeout(() => retire(slot), IDLE_MS);
    pump();
  };
  slot.worker.onerror = (event) => {
    event.preventDefault();
    const job = slot.job;
    retire(slot);
    if (job) {
      finish(job);
      job.reject(new Error(event.message || "The image codec stopped"));
    }
    pump();
  };
  slots.push(slot);
  return slot;
}

function pump() {
  while (queue.length > 0) {
    let slot = slots.find((candidate) => candidate.job === null);
    if (!slot) {
      if (slots.length >= max_workers()) return;
      slot = spawn();
    }
    if (slot.idle) clearTimeout(slot.idle);
    slot.idle = null;
    const job = queue.shift()!;
    slot.job = job;
    slot.worker.postMessage(job.request);
  }
}

function cancel(job: Job) {
  finish(job);
  const queued = queue.indexOf(job);
  if (queued >= 0) queue.splice(queued, 1);
  // A wasm encode can't be interrupted; ending its worker is the only way to stop it.
  const slot = slots.find((candidate) => candidate.job === job);
  if (slot) retire(slot);
  job.reject(job.signal?.reason ?? new DOMException("Aborted", "AbortError"));
  pump();
}

function run<T>(request: Request, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const job: Job = { request: { ...request, id: next_id++ } as CodecRequest, resolve: resolve as (value: never) => void, reject, signal };
    if (signal) {
      job.on_abort = () => cancel(job);
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
  format: CodecFormat,
  image: ImageData,
  options: EncodeOptions = {},
  { signal }: CodecCallOptions = {}
): Promise<EncodeResult> {
  return run({ op: "encode", format, image, options }, signal);
}

/** The browser's own decoder when it has one (with jSquash for AVIF where it doesn't), jSquash for JPEG XL. */
export function decode(blob: Blob, { signal }: CodecCallOptions = {}): Promise<ImageData> {
  return run({ op: "decode", blob }, signal);
}

export function compare(a: ImageData, b: ImageData, { signal }: CodecCallOptions = {}): Promise<SsimResult> {
  return run({ op: "compare", a, b }, signal);
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
