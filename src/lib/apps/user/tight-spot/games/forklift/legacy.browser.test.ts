import { afterAll, beforeAll, expect, test, vi } from "vitest";
import kernel from "$lib/core/api";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { app_data_path, create_storage_handle, json_file } from "$lib/core/contexts/app";
import { data_schema, EMPTY_DATA } from "./game";
import { adopt_legacy } from "./legacy";

let files: FilesService;

beforeAll(async () => {
  files = new FilesService();
  await files.init();
  kernel.services.set("files", files);
});

afterAll(() => {
  kernel.services.delete("files");
});

test("old localStorage keys fold in, the better best winning, and go only once the file on disk holds them", async () => {
  localStorage.setItem("app.tight-spot.forklift.best", JSON.stringify({ "level:1": { stars: 2, ms: 50000 }, "jobs:2": { stars: 1, ms: 9 } }));
  localStorage.setItem("app.tight-spot.forklift.levels", JSON.stringify({ "1": 2, "3": 3 }));
  const storage = create_storage_handle("tight-spot", {});

  const data = json_file(app_data_path("tight-spot", "forklift.json"), EMPTY_DATA, data_schema);
  await vi.waitFor(() => expect(data.ready).toBe(true));
  data.value = { bests: { "level:1": { stars: 3, ms: 40000 }, "jobs:2": { stars: 1, ms: 20 } }, levels: { "1": 3 } };
  await adopt_legacy(storage, data);
  expect(data.value).toEqual({ bests: { "level:1": { stars: 3, ms: 40000 }, "jobs:2": { stars: 1, ms: 9 } }, levels: { "1": 3, "3": 3 } });
  await adopt_legacy(storage, data);
  expect(localStorage.getItem("app.tight-spot.forklift.best")).not.toBeNull();
  await vi.waitFor(async () => {
    await adopt_legacy(storage, data);
    expect(localStorage.getItem("app.tight-spot.forklift.best")).toBeNull();
  });
  expect(localStorage.getItem("app.tight-spot.forklift.levels")).toBeNull();
  data.release();
});
