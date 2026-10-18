import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext, Value } from "$lib/core/api/services/shell/type";
import { create_qr_detector, detect_qr } from "$kit/utils/qr";
import type { Ecc } from "./encode/tables";
import { qr } from "./shell";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  kernel.services.delete("files");
});

function context(args: { text: string[]; ecc: Ecc; out?: string }, piped: Value[] = []) {
  return {
    args,
    input: (async function* () {
      yield* piped;
    })(),
    piped: piped.length > 0,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<{ text: string[]; ecc: Ecc; out?: string }>;
}

test("qr writes a PNG that decodes back", async () => {
  const value = await qr(context({ text: ["hello", "world"], ecc: "M" }));
  expect(value.path).toBe("/home/qr.png");
  const file = await files.get_file("/home/qr.png");
  const bitmap = await createImageBitmap(file!);
  expect(await detect_qr(await create_qr_detector(), bitmap)).toBe("hello world");
});

test("a second run takes a free name, -o writes SVG, piped text is read", async () => {
  await qr(context({ text: ["a"], ecc: "L" }));
  expect((await qr(context({ text: ["b"], ecc: "L" }))).path).toBe("/home/qr (1).png");
  const svg = await qr(context({ text: [], ecc: "H", out: "code.svg" }, ["piped"]));
  expect(svg.path).toBe("/home/code.svg");
  expect(await (await files.get_file("/home/code.svg"))!.text()).toMatch(/^<svg /);
});

test("nothing to encode", async () => {
  await expect(qr(context({ text: [], ecc: "M" }))).rejects.toThrow("nothing to encode");
});
