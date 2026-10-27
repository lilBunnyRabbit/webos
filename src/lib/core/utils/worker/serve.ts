import { transfers_of, type CallMessage, type Input, type Output, type WorkerApi, type WorkerMessage } from "./protocol";

export { transfer } from "./protocol";

export type Handlers<Api extends WorkerApi<Api>> = {
  [K in keyof Api]: (input: Input<Api[K]>) => Output<Api[K]> | Promise<Output<Api[K]>>;
};

export interface Served<Event> {
  emit(event: Event): void;
}

export function serve<Api extends WorkerApi<Api>, Event = never>(handlers: Handlers<Api>): Served<Event> {
  const post = (message: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer });
  self.onmessage = async ({ data }: MessageEvent<CallMessage>) => {
    try {
      const handler = handlers[data.method as keyof Api] as ((input: unknown) => unknown) | undefined;
      if (!handler) throw new Error(`No worker method ${data.method}`);
      const result = await handler(data.input);
      post({ kind: "reply", id: data.id, ok: true, result }, transfers_of(result));
    } catch (error) {
      post({ kind: "reply", id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  return { emit: (event) => post({ kind: "event", event }, transfers_of(event)) };
}
