import { afterAll, beforeAll, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { month_file_path, parse_month_file } from "./data";
import { clock_in, clock_out, edit_month, open_month, open_state, set_running_description } from "./store";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

const read = async (path: string) => (await (await files.get_file(path))?.text()) ?? null;

test("a session that crosses into the next month is booked into both files", async () => {
  const state = open_state();
  const january = open_month("2031-01");
  await vi.waitFor(() => expect(state.ready && january.ready).toBe(true));

  await clock_in("Release", new Date(2031, 0, 31, 23, 0));
  await set_running_description("Release 2");
  await vi.waitFor(() => expect(state.value.running?.description).toBe("Release 2"));

  const booked = await clock_out(new Date(2031, 1, 1, 1, 30));
  expect(booked).toHaveLength(2);
  expect(await clock_out()).toEqual([]);

  await vi.waitFor(() => expect(state.value.running).toBeNull());
  await vi.waitFor(() => expect(january.value.days["2031-01-31"]?.entries).toMatchObject([{ start: "23:00", end: "24:00", description: "Release 2" }]));
  const february = parse_month_file((await read(month_file_path("2031-02")))!);
  expect(february?.days["2031-02-01"].entries).toMatchObject([{ start: "00:00", end: "01:30", description: "Release 2" }]);

  state.release();
  january.release();
});

test("refuses to overwrite a file it can't read", async () => {
  await edit_month("2031-03", (file) => ({ ...file, target_hours: 100 }));
  const folder = await files.get_directory("/var/lib/apps/work-hours");
  await files.create_file(folder, "2031-03.json", { content: "{ broken", overwrite: true });
  await expect(edit_month("2031-03", (file) => ({ ...file, target_hours: 120 }))).rejects.toThrow(/valid/);
  expect(await read(month_file_path("2031-03"))).toBe("{ broken");
});
