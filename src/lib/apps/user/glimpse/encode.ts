import { spawn, type WorkerHandle } from "$kit/utils/worker";
import type { Turn } from "./orientation";
import type { EncodeApi, Encoded } from "./encode.worker";
import EncodeWorker from "./encode.worker?worker";

export type { Encoded };

const IDLE_MS = 30_000;

let worker: WorkerHandle<EncodeApi> | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;

export async function encode(frame: ImageBitmap, turn: Turn): Promise<Encoded> {
  clearTimeout(idle);
  if (!worker?.alive) worker = spawn<EncodeApi>(EncodeWorker, { stopped: "The photo encoder stopped" });
  const handle = worker;
  try {
    return await handle.call("encode", { frame, turn }, { transfer: [frame] });
  } finally {
    if (handle.pending === 0) idle = setTimeout(() => handle.terminate(), IDLE_MS);
  }
}
