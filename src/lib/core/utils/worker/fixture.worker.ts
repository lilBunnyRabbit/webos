import { serve, transfer } from "./serve";

export interface FixtureApi {
  double(value: number): number;
  fill(length: number): Uint8Array;
  fail(message: string): never;
  hang(input: null): never;
  crash(input: null): null;
  ping(times: number): number;
}

export type FixtureEvent = { kind: "pong"; at: number };

const served = serve<FixtureApi, FixtureEvent>({
  double: (value) => value * 2,
  fill: (length) => {
    const bytes = new Uint8Array(length).fill(7);
    return transfer(bytes, [bytes.buffer]);
  },
  fail: (message) => {
    throw new Error(message);
  },
  hang: () => new Promise<never>(() => {}),
  crash: () => {
    setTimeout(() => {
      throw new Error("Boom outside a call");
    });
    return new Promise<never>(() => {}) as never;
  },
  ping: (times) => {
    for (let at = 0; at < times; at++) served.emit({ kind: "pong", at });
    return times;
  },
});
