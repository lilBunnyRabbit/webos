import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { page_count } from "./pdf";
import { merge } from "./shell";

let files: FilesService;
let notifications: NotificationsService;

beforeAll(() => {
  files = new FilesService();
  notifications = new NotificationsService();
  kernel.services.set("files", files);
  kernel.services.set("notifications", notifications);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
});

const context = <T>(args: T) =>
  ({ args, input: (async function* () {})(), piped: false, session: { cwd: "/home" }, signal: new AbortController().signal, elevated: false }) as unknown as CommandContext<T>;

async function seed_pdf(name: string, pages: number): Promise<void> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pages; index++) document.addPage([200, 300]);
  const home = await files.get_directory("/home");
  await files.create_file(home, name, { content: new Blob([(await document.save()) as BlobPart]), overwrite: true });
}

async function pages_at(path: string): Promise<number> {
  const file = await files.get_file(path);
  return page_count(new Uint8Array(await file!.arrayBuffer()));
}

test("pdf merge writes the pages of both, next to the first, under a free name", async () => {
  await seed_pdf("a.pdf", 2);
  await seed_pdf("b.pdf", 3);
  await seed_pdf("a (merged).pdf", 1);

  const out = await merge(context({ paths: ["a.pdf", "~/b.pdf"] }));
  expect(out).toMatchObject({ $type: "file", path: "/home/a (merged) (1).pdf" });
  expect(await pages_at(out.path)).toBe(5);

  const named = await merge(context({ paths: ["b.pdf", "a.pdf"], out: "both" }));
  expect(named.path).toBe("/home/both.pdf");
  expect(await pages_at(named.path)).toBe(5);
});

test("pdf merge refuses one file, missing files and system folders", async () => {
  await seed_pdf("a.pdf", 1);
  await expect(merge(context({ paths: ["a.pdf"] }))).rejects.toThrow("at least two");
  await expect(merge(context({ paths: ["a.pdf", "nope.pdf"] }))).rejects.toThrow("/home/nope.pdf: no such file");
  await expect(merge(context({ paths: ["a.pdf", "a.pdf"], out: "/etc" }))).rejects.toThrow("read-only");
});
