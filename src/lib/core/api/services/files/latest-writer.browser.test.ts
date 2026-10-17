import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as opfs from "./opfs";
import { FilesService } from "./service.svelte";
import { LatestWriter, flush_writers } from "./latest-writer";

const PATH = "/var/lib/writer-test/state.json";
const OTHER = "/var/lib/writer-test/other.json";

let files: FilesService;
let saves: () => number;

const writer = (delay = 0, path = PATH) => new LatestWriter(() => files, path, "test", { delay });
const read = async (path = PATH) => (await (await files.get_file(path))?.text()) ?? null;

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
  const spy = vi.spyOn(files, "create_file");
  saves = () => spy.mock.calls.length;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LatestWriter", () => {
  test("without a delay, saves at once and creates the folders", async () => {
    const target = writer();
    target.write("a");
    expect(target.busy).toBe(true);
    await target.idle();
    expect(target.busy).toBe(false);
    expect(await read()).toBe("a");
  });

  test("a burst of writes within the delay saves once, the newest text", async () => {
    const target = writer(50);
    for (const text of ["a", "b", "c"]) target.write(text);
    expect(target.busy).toBe(true);
    expect(saves()).toBe(0);
    await vi.waitFor(async () => expect(await read()).toBe("c"));
    expect(saves()).toBe(1);
  });

  test("idle() saves a delayed write now", async () => {
    const target = writer(60_000);
    target.write("now");
    await target.idle();
    expect(await read()).toBe("now");
    expect(target.busy).toBe(false);
  });

  test("pagehide flushes delayed writes", async () => {
    const target = writer(60_000);
    target.write("leaving");
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    await vi.waitFor(async () => expect(await read()).toBe("leaving"));
    expect(target.busy).toBe(false);
  });

  test("the page going hidden flushes delayed writes", async () => {
    const target = writer(60_000);
    target.write("hidden");
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(async () => expect(await read()).toBe("hidden"));
  });

  test("flush_writers saves every delayed writer", async () => {
    writer(60_000).write("one");
    writer(60_000, OTHER).write("two");
    await flush_writers();
    expect(await read()).toBe("one");
    expect(await read(OTHER)).toBe("two");
  });

  test("skips text the file already holds, seeded or written", async () => {
    const target = writer();
    target.seed("same");
    target.write("same");
    await target.idle();
    expect(saves()).toBe(0);

    target.write("next");
    await target.idle();
    target.write("next");
    await target.idle();
    expect(saves()).toBe(1);
  });

  test("reuses the folder handle between writes", async () => {
    const target = writer();
    target.write("a");
    await target.idle();
    const walk = vi.spyOn(FileSystemDirectoryHandle.prototype, "getDirectoryHandle");
    target.write("b");
    await target.idle();
    expect(walk).not.toHaveBeenCalled();
  });

  test("walks the path again when the cached folder was removed", async () => {
    const target = writer();
    target.write("before");
    await target.idle();
    const lib = (await files.get_directory("/var/lib"))!;
    await lib.removeEntry("writer-test", { recursive: true });

    target.write("after");
    await target.idle();
    expect(await read()).toBe("after");
  });
});
