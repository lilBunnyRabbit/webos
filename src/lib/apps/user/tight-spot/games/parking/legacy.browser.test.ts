import { afterAll, beforeAll, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { app_data_path, json_file } from "$lib/core/contexts/app";
import { data_schema, EMPTY_DATA } from "./game";
import { adopt_legacy } from "./legacy";

const PATH = app_data_path("tight-spot", "parking.json");
let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

test("old bests, levels and kinds in storage.json move into parking.json, the better best winning; the keys go once the file on disk holds them", async () => {
  const prefs = {
    value: {
      "parking.best": { "garage:hatch": { moves: 3, ms: 9000, precision: 80 } },
      "parking.levels": { "1": 3, "2": 1 },
      "parking.kinds": "not a list",
      "parking.level": 2,
    } as Record<string, unknown>,
  };

  const first = json_file(PATH, EMPTY_DATA, data_schema);
  await vi.waitFor(() => expect(first.ready).toBe(true));
  first.value = { bests: { "garage:hatch": { moves: 5, ms: 4000, precision: 88 } }, levels: {}, kinds: ["garage"] };
  await adopt_legacy(prefs, first);
  const expected = { bests: { "garage:hatch": { moves: 3, ms: 9000, precision: 88 } }, levels: { "1": 3, "2": 1 }, kinds: ["garage"] };
  expect(first.value).toEqual(expected);
  expect(prefs.value["parking.best"]).toBeDefined();

  const window_two = json_file(PATH, EMPTY_DATA, data_schema);
  await adopt_legacy(prefs, window_two);
  expect(prefs.value["parking.best"]).toBeDefined();
  window_two.release();
  first.release();
  await vi.waitFor(async () => expect(await (await files.get_file(PATH))?.text()).toContain('"moves": 3'));

  const second = json_file(PATH, EMPTY_DATA, data_schema);
  await vi.waitFor(() => expect(second.ready).toBe(true));
  await adopt_legacy(prefs, second);
  expect(second.value).toEqual(expected);
  expect(prefs.value).toEqual({ "parking.level": 2 });
  second.release();
});
