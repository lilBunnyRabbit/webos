export type Method = (input: never) => unknown;

export type WorkerApi<Api> = { [K in keyof Api]: Method };

export type Input<M> = M extends (input: infer I) => unknown ? I : never;
export type Output<M> = M extends (input: never) => infer O ? Awaited<O> : never;

export interface CallMessage {
  id: number;
  method: string;
  input: unknown;
}

export type WorkerMessage =
  | { kind: "reply"; id: number; ok: true; result: unknown }
  | { kind: "reply"; id: number; ok: false; error: string }
  | { kind: "event"; event: unknown };

const marked = new WeakMap<object, Transferable[]>();

export function transfer<T extends object>(value: T, list: Transferable[]): T {
  marked.set(value, list);
  return value;
}

export function transfers_of(value: unknown): Transferable[] {
  return value !== null && typeof value === "object" ? (marked.get(value) ?? []) : [];
}
