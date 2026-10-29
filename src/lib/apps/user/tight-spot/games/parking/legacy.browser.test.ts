import { afterAll, beforeAll, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { app_data_path, create_storage_handle, json_file } from "$lib/core/contexts/app";
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

test("old localStorage bests, levels and kinds move into parking.json, the better best winning; the keys go once the file on disk holds them", async () => {
  localStorage.setItem("app.tight-spot.parking.best", JSON.stringify({ "garage:hatch": { moves: 3, ms: 9000, precision: 80 } }));
  localStorage.setItem("app.tight-spot.parking.levels", JSON.stringify({ "1": 3, "2": 1 }));
  localStorage.setItem("app.tight-spot.parking.kinds", JSON.stringify(["garage"]));
  localStorage.setItem("app.tight-spot.parking.level", "2");
  const storage = create_storage_handle("tight-spot", {});

  const first = json_file(PATH, EMPTY_DATA, data_schema);
  await vi.waitFor(() => expect(first.ready).toBe(true));
  first.value = { bests: { "garage:hatch": { moves: 5, ms: 4000, precision: 88 } }, levels: {}, kinds: [] };
  await adopt_legacy(storage, first);
  const expected = { bests: { "garage:hatch": { moves: 3, ms: 9000, precision: 88 } }, levels: { "1": 3, "2": 1 }, kinds: ["garage"] };
  expect(first.value).toEqual(expected);
  expect(localStorage.getItem("app.tight-spot.parking.best")).not.toBeNull();

  const window_two = json_file(PATH, EMPTY_DATA, data_schema);
  await adopt_legacy(storage, window_two);
  expect(localStorage.getItem("app.tight-spot.parking.best")).not.toBeNull();
  window_two.release();
  first.release();
  await vi.waitFor(async () => expect(await (await files.get_file(PATH))?.text()).toContain('"moves": 3'));

  const second = json_file(PATH, EMPTY_DATA, data_schema);
  await vi.waitFor(() => expect(second.ready).toBe(true));
  await adopt_legacy(storage, second);
  expect(second.value).toEqual(expected);
  expect(localStorage.getItem("app.tight-spot.parking.best")).toBeNull();
  expect(localStorage.getItem("app.tight-spot.parking.levels")).toBeNull();
  expect(localStorage.getItem("app.tight-spot.parking.kinds")).toBeNull();
  expect(localStorage.getItem("app.tight-spot.parking.level")).toBe("2");
  second.release();
});
