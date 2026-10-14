import { afterAll, beforeAll, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import type { CommandContext } from "$lib/core/api/services/shell/type";
import { add, list, target } from "./shell";
import { open_month } from "./store";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

const context = <T>(args: T) => ({ args, input: (async function* () {})(), piped: false, signal: new AbortController().signal, elevated: false }) as unknown as CommandContext<T>;

test("wh add and wh target write through the store, and an open month sees them", async () => {
  const month = open_month("2032-05");
  await vi.waitFor(() => expect(month.ready).toBe(true));

  expect(await add(context({ date: "2032-05-03", start: "9", end: "12:30", description: ["Review"] }))).toMatchObject({
    $type: "workday",
    day: "2032-05-03",
    in: "09:00",
    out: "12:30",
    hours: 3.5,
    work: "Review",
  });
  await add(context({ date: "2032-05-03", start: "13:00", end: "14:00", description: [] }));
  await expect(add(context({ date: "2032-05-03", start: "14:00", end: "13:00", description: [] }))).rejects.toThrow(/after the start/);

  expect(await target(context({ hours: "120", month: "2032-05" }))).toMatch(/120:00/);
  await vi.waitFor(() => expect(month.value.target_hours).toBe(120));
  await vi.waitFor(() => expect(month.value.days["2032-05-03"]?.entries).toHaveLength(2));

  const rows = [];
  for await (const row of list(context({ month: "2032-05" }))) rows.push(row);
  expect(rows).toMatchObject([{ day: "2032-05-03", in: "09:00", out: "14:00", minutes: 270, work: "Review" }]);

  expect(await target(context({ hours: "none", month: "2032-05" }))).toMatch(/no target/);
  await expect(target(context({ hours: "lots", month: "2032-05" }))).rejects.toThrow(/isn't a number/);
  month.release();
});
