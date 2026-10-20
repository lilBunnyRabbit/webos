import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { flushSync } from "svelte";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { app_data_path } from "$lib/core/contexts/app";
import { APP_ID, DATA_FILE, stopwatch_of, toggle_stopwatch } from "./clock";
import { open_clock_file } from "./ringer.svelte";

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

async function on_disk(): Promise<unknown> {
  const text = await (await files.get_file(app_data_path(APP_ID, DATA_FILE)))?.text();
  return text ? JSON.parse(text) : null;
}

test("every Clock window shares one stopwatch, saved in the data file", async () => {
  const one = open_clock_file();
  const two = open_clock_file();
  await vi.waitFor(() => expect(one.ready && two.ready).toBe(true));
  expect(stopwatch_of(two.value).started_at).toBeNull();

  one.value.stopwatch = toggle_stopwatch(stopwatch_of(one.value), 1_000);
  flushSync();
  expect(stopwatch_of(two.value).started_at).toBe(1_000);

  await vi.waitFor(async () => expect(await on_disk()).toMatchObject({ stopwatch: { started_at: 1_000, before_ms: 0, laps: [] } }));
  one.release();
  two.release();

  const reopened = open_clock_file();
  await vi.waitFor(() => expect(reopened.ready).toBe(true));
  expect(stopwatch_of(reopened.value).started_at).toBe(1_000);
  reopened.release();
});
