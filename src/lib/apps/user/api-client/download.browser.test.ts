import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext, Value } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { download } from "./download";
import { prepare } from "./request";
import { empty_request } from "./http-file";
import { http, wget, type HttpArgs } from "./shell";

let files: FilesService;
let notifications: NotificationsService;
const urls: string[] = [];

beforeAll(() => {
  files = new FilesService();
  notifications = new NotificationsService();
  kernel.services.set("files", files);
  kernel.services.set("notifications", notifications);
  kernel.services.set("tasks", new TasksService(kernel));
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterEach(() => {
  for (const url of urls.splice(0)) URL.revokeObjectURL(url);
});

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
  kernel.services.delete("tasks");
});

function served(content: BlobPart, type = "text/plain"): string {
  const url = URL.createObjectURL(new Blob([content], { type }));
  urls.push(url);
  return url;
}

function context<T>(args: T, signal = new AbortController().signal): CommandContext<T> {
  return {
    args,
    input: (async function* (): AsyncGenerator<Value> {})(),
    piped: false,
    session: { cwd: "/home" },
    signal,
    elevated: false,
  } as unknown as CommandContext<T>;
}

const get = (url: string) => prepare({ ...empty_request(), url });

test("streams the body into the folder under the given name, never over an existing file", async () => {
  const bytes = new Uint8Array(300_000).map((_, index) => index % 251);
  const url = served(bytes, "application/octet-stream");
  const first = await download("api-client", get(url), { folder: "/home", name: "data.bin" });
  const second = await download("api-client", get(url), { folder: "/home", name: "data.bin" });

  expect(first).toEqual({ ok: true, path: "/home/data.bin", size: bytes.length });
  expect(second).toMatchObject({ ok: true, path: "/home/data (1).bin" });
  expect(new Uint8Array(await (await files.get_file("/home/data.bin"))!.arrayBuffer())).toEqual(bytes);
  expect((await files.list(await files.get_directory("/tmp"))).filter((item) => item.name.endsWith(".part"))).toEqual([]);
});

test("a cancelled download leaves nothing behind", async () => {
  const controller = new AbortController();
  const pending = download("api-client", get(served("hello")), { folder: "/home", name: "never.txt" }, controller.signal);
  controller.abort();
  const result = await pending;

  expect(result).toMatchObject({ ok: false, cancelled: true });
  expect(await files.get_file("/home/never.txt")).toBeNull();
});

test("a URL that can't be fetched fails with an explanation", async () => {
  const url = served("gone");
  URL.revokeObjectURL(url);
  const result = await download("api-client", get(url), { folder: "/home", name: "gone.txt" });

  expect(result).toMatchObject({ ok: false, cancelled: false });
  expect(await files.get_file("/home/gone.txt")).toBeNull();
});

test("wget saves into --to and yields the file", async () => {
  const value = await wget(context({ url: served("hi there"), to: "/home/Documents", output: "note.txt" }));

  expect(value).toMatchObject({ $type: "file", path: "/home/Documents/note.txt", size: 8 });
  expect(await (await files.get_file("/home/Documents/note.txt"))!.text()).toBe("hi there");
});

test("wget names the file from the URL and the content type", async () => {
  const value = await wget(context({ url: served('{"a":1}', "application/json") }));

  expect(value.path).toMatch(/^\/home\/[\w-]+\.json$/);
});

async function collect(args: Partial<HttpArgs>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const value of http(context({ method: "get", url: "", header: [], ...args } as HttpArgs))) out.push(value);
  return out;
}

test("http yields the status line and a pretty JSON body", async () => {
  const [status, body] = await collect({ url: served('{"a":[1,2]}', "application/json") });

  expect(status).toMatch(/^200 OK · \d+ ms · 11 B$/);
  expect(body).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
});

test("http -o writes the body to that path", async () => {
  const [value] = await collect({ url: served("saved"), output: "/home/out.txt" });

  expect(value).toMatchObject({ $type: "file", path: "/home/out.txt" });
  expect(await (await files.get_file("/home/out.txt"))!.text()).toBe("saved");
});

test("http rejects an unknown method and a malformed header", async () => {
  await expect(collect({ method: "fetch", url: served("x") })).rejects.toThrow("not a method");
  await expect(collect({ url: served("x"), header: ["nope"] })).rejects.toThrow("Name: value");
});
