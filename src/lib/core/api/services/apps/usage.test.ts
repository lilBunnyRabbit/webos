import { describe, expect, test } from "vitest";
import { used_apps, type UsageSignals } from "./usage";
import type { AppManifest } from "./type";

const app = (id: string, commands: string[] = []) => ({ id, name: id, shell: { commands: commands.map((command) => ({ id: command })) } }) as unknown as AppManifest;
const APPS = [app("kanban", ["kanban add", "kanban ls"]), app("quick-notes", ["quno"]), app("diff"), app("clock"), app("paint"), app("snake")];
const NONE: UsageSignals = { windows: [], desktop: [], storage_keys: [], data_folders: [], history: [], defaults: [] };

describe("used_apps", () => {
  test("nothing used", () => {
    expect(used_apps(APPS, NONE)).toEqual(new Set());
  });

  test("windows, desktop, app storage, data folders and file defaults", () => {
    const used = used_apps(APPS, {
      ...NONE,
      windows: ["clock"],
      desktop: ["paint"],
      storage_keys: ["app.snake.best", "kernel.debug", "app.gone.x"],
      data_folders: ["diff", "retired-app"],
      defaults: ["kanban"],
    });
    expect([...used].sort()).toEqual(["clock", "diff", "kanban", "paint", "snake"]);
  });

  test("shell history: any stage, sudo, whole words only", () => {
    expect(used_apps(APPS, { ...NONE, history: ["ls | kanban add milk"] })).toEqual(new Set(["kanban"]));
    expect(used_apps(APPS, { ...NONE, history: ["sudo quno"] })).toEqual(new Set(["quick-notes"]));
    expect(used_apps(APPS, { ...NONE, history: ["kanbanx add", "echo quno"] })).toEqual(new Set());
  });
});
