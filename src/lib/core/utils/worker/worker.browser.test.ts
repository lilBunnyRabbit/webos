import { afterEach, describe, expect, test } from "vitest";
import { spawn, type WorkerHandle } from ".";
import type { FixtureApi, FixtureEvent } from "./fixture.worker";
import FixtureWorker from "./fixture.worker?worker";

const handles: WorkerHandle<FixtureApi>[] = [];

function start(on_event?: (event: FixtureEvent) => void) {
  const handle = spawn<FixtureApi, FixtureEvent>(FixtureWorker, { on_event, stopped: "Fixture stopped" });
  handles.push(handle);
  return handle;
}

afterEach(() => {
  for (const handle of handles.splice(0)) handle.terminate();
});

describe("spawn and serve", () => {
  test("calls a method by name and resolves its result", async () => {
    const worker = start();
    await expect(worker.call("double", 21)).resolves.toBe(42);
    expect(worker.pending).toBe(0);
  });

  test("a transferred result arrives whole", async () => {
    const bytes = await start().call("fill", 1024);
    expect(bytes.length).toBe(1024);
    expect(bytes[1023]).toBe(7);
  });

  test("a handler's error rejects only its call", async () => {
    const worker = start();
    await expect(worker.call("fail", "nope")).rejects.toThrow("nope");
    await expect(worker.call("double", 2)).resolves.toBe(4);
  });

  test("aborting ends the worker and rejects every pending call", async () => {
    const worker = start();
    const abort = new AbortController();
    const hanging = worker.call("hang", null, { signal: abort.signal });
    const other = worker.call("hang", null);
    abort.abort(new Error("Stop"));
    await expect(hanging).rejects.toThrow("Stop");
    await expect(other).rejects.toThrow("Stop");
    expect(worker.alive).toBe(false);
    await expect(worker.call("double", 1)).rejects.toThrow("Fixture stopped");
  });

  test("an already aborted signal rejects without ending the worker", async () => {
    const worker = start();
    await expect(worker.call("double", 1, { signal: AbortSignal.abort(new Error("Early")) })).rejects.toThrow("Early");
    expect(worker.alive).toBe(true);
  });

  test("an uncaught error in the worker rejects what's pending", async () => {
    const worker = start();
    await expect(worker.call("crash", null)).rejects.toThrow("Boom outside a call");
  });

  test("events reach on_event before the call's reply", async () => {
    const events: FixtureEvent[] = [];
    const worker = start((event) => events.push(event));
    await expect(worker.call("ping", 3)).resolves.toBe(3);
    expect(events.map((event) => event.at)).toEqual([0, 1, 2]);
  });
});
