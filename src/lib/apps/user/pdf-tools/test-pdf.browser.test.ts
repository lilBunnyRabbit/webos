import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { NotificationsService } from "$lib/core/api/services/notifications/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { TasksService } from "$lib/core/api/services/tasks/service.svelte";
import { open_document, render_page } from "./render";
import { testpdf, type TestPdfArgs } from "./shell";
import { DEFAULT_PDF, Orientation, Paper } from "./test-pdf";
import { generate_test_pdf } from "./test-pdf-job";

let files: FilesService;
let notifications: NotificationsService;

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

afterAll(() => {
  notifications.destroy();
  kernel.services.delete("files");
  kernel.services.delete("notifications");
  kernel.services.delete("tasks");
});

async function bytes_at(path: string): Promise<Uint8Array> {
  return new Uint8Array(await (await files.get_file(path))!.arrayBuffer());
}

test("pdf.js opens and draws every kind of page", async () => {
  const options = { ...DEFAULT_PDF, pages: 6, paper: Paper.MIXED, orientation: Orientation.MIXED, text: 3, images: 4, image_size: 32, grid: 10 };
  const result = await generate_test_pdf("pdf-tools", options, null, "/home/a.pdf");
  expect(result.ok).toBe(true);
  const document = await open_document(await bytes_at("/home/a.pdf"), "a.pdf");
  try {
    expect(document.numPages).toBe(6);
    for (let index = 0; index < 6; index++) {
      const canvas = await render_page(document, index, 0.5);
      expect(canvas.width).toBeGreaterThan(0);
    }
    const content = await (await document.getPage(3)).getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    expect(text).toContain("Page 3 of 6");
    expect(text).toContain("Page 3, paragraph 1.");
  } finally {
    void document.loadingTask.destroy();
  }
});

test("an exact size lands on the byte and still opens", async () => {
  const result = await generate_test_pdf("pdf-tools", { ...DEFAULT_PDF, pages: 3 }, 5 * 1024 * 1024 + 7, "/home/b.pdf");
  expect(result).toMatchObject({ ok: true, size: 5 * 1024 * 1024 + 7 });
  expect((await files.get_file("/home/b.pdf"))!.size).toBe(5 * 1024 * 1024 + 7);
  const document = await open_document(await bytes_at("/home/b.pdf"), "b.pdf");
  expect(document.numPages).toBe(3);
  void document.loadingTask.destroy();
});

test("cancel stops the run and leaves no file", async () => {
  const controller = new AbortController();
  const run = generate_test_pdf("pdf-tools", { ...DEFAULT_PDF, pages: 20 }, 300 * 1024 * 1024, "/home/c.pdf", controller.signal);
  setTimeout(() => controller.abort(), 50);
  expect(await run).toEqual({ ok: false, error: "stopped" });
  expect(await files.get_file("/home/c.pdf")).toBeNull();
});

const context = (args: Partial<TestPdfArgs>) =>
  ({
    args: { pages: 10, page: "a4", orientation: "portrait", images: 0, text: 0, grid: 0, plain: false, ...args },
    input: (async function* () {})(),
    piped: false,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  }) as unknown as CommandContext<TestPdfArgs>;

test("testpdf saves into /home/Documents under a free name, or where --to says", async () => {
  const first = await testpdf(context({}));
  expect(first).toMatchObject({ $type: "file", path: "/home/Documents/test-10p-a4.pdf" });
  expect((await testpdf(context({}))).path).toBe("/home/Documents/test-10p-a4 (1).pdf");
  const custom = await testpdf(context({ pages: 2, page: "100x50", to: "card" }));
  expect(custom.path).toBe("/home/card.pdf");
  const sized = await testpdf(context({ pages: 2, size: "1MB" }));
  expect(sized.size).toBe(1024 * 1024);
});

test("testpdf explains bad input", async () => {
  await expect(testpdf(context({ page: "huge" }))).rejects.toThrow(/WxH in mm/);
  await expect(testpdf(context({ size: "lots" }))).rejects.toThrow(/500MB/);
  await expect(testpdf(context({ pages: 500, size: "10kb" }))).rejects.toThrow(/already take/);
});
