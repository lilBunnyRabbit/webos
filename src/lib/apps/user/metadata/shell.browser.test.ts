import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { PDFDocument } from "pdf-lib";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { file_value } from "$lib/core/api/services/files/shell";
import type { CommandContext, Tagged, Value } from "$lib/core/api/services/shell/type";
import { read_metadata } from "$lib/core/utils/exif";
import { jpeg, png, tiff } from "$lib/core/utils/exif/fixtures";
import { meta, strip } from "./shell";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => kernel.services.delete("files"));

function context<T>(args: T, piped: Value[] = [], elevated = false) {
  return {
    args,
    input: (async function* () {
      yield* piped;
    })(),
    piped: piped.length > 0,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated,
  } as unknown as CommandContext<T>;
}

async function seed(name: string, bytes: Uint8Array) {
  const home = await files.get_directory("/home");
  await files.create_file(home, name, { content: new Blob([bytes as BlobPart]), overwrite: true });
}

const PHOTO = jpeg({
  exif: tiff(
    [
      { tag: 0x010f, type: 2, values: "Canon" },
      { tag: 0x0110, type: 2, values: "EOS R6" },
      { tag: 0x0112, type: 3, values: [6] },
    ],
    [{ tag: 0x9003, type: 2, values: "2024:05:01 12:34:56" }],
    [
      { tag: 0x02, type: 5, values: [46, 0, 0] },
      { tag: 0x04, type: 5, values: [14, 0, 0] },
    ]
  ),
});

async function collect(source: AsyncGenerator<Tagged>): Promise<Tagged[]> {
  const out: Tagged[] = [];
  for await (const value of source) out.push(value);
  return out;
}

test("meta yields one record per file, images and PDFs, from args or a pipe", async () => {
  await seed("photo.jpg", PHOTO);
  await seed("plain.png", png());
  const document = await PDFDocument.create();
  document.setTitle("Report");
  document.addPage();
  await seed("report.pdf", await document.save());

  const records = await collect(meta(context({ paths: ["photo.jpg", "plain.png", "report.pdf"] })));
  expect(records).toEqual([
    { $type: "meta", name: "photo.jpg", path: "/home/photo.jpg", format: "jpeg", camera: "Canon EOS R6", date: "2024-05-01 12:34:56", gps: "46.000000, 14.000000", size: PHOTO.length },
    expect.objectContaining({ name: "plain.png", format: "png", camera: null, date: null, gps: null }),
    expect.objectContaining({ name: "report.pdf", format: "pdf" }),
  ]);

  const piped = await collect(meta(context({ paths: [] }, [file_value("/home/photo.jpg", "file")])));
  expect(piped.map((record) => record.name)).toEqual(["photo.jpg"]);
  await expect(collect(meta(context({ paths: ["missing.jpg"] })))).rejects.toThrow(/no such file/);
});

test("meta strip writes clean copies beside the originals under free names", async () => {
  await seed("photo.jpg", PHOTO);

  const [first] = await strip(context({ paths: ["photo.jpg"], keep_orientation: false }));
  expect(first).toMatchObject({ $type: "file", path: "/home/photo-clean.jpg" });
  const clean = new Uint8Array(await (await files.get_file(first.path))!.arrayBuffer());
  expect(read_metadata(clean).exif).toEqual({});

  const [second] = await strip(context({ paths: ["photo.jpg"], keep_orientation: true }));
  expect(second.path).toBe("/home/photo-clean (1).jpg");
  const kept = new Uint8Array(await (await files.get_file(second.path))!.arrayBuffer());
  expect(read_metadata(kept).exif).toEqual({ Orientation: 6 });
});
