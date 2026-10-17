import { describe, expect, test } from "vitest";
import { command_apps, used_apps, type UsageSignals } from "./usage";
import type { AppManifest } from "./type";

const app = (id: string, commands: string[] = []) =>
  ({ id, name: id, shell: commands.length ? async () => ({ default: { commands: commands.map((command) => ({ id: command })) } }) : undefined }) as unknown as AppManifest;
const APPS = [app("kanban", ["kanban add", "kanban ls"]), app("quick-notes", ["quno"]), app("diff"), app("clock"), app("paint"), app("snake")];
const NONE: UsageSignals = { windows: [], desktop: [], storage_keys: [], data_folders: [], history: [], defaults: [] };
const COMMANDS = await command_apps(APPS);

describe("command_apps", () => {
  test("loads each app's shell module for its command ids", () => {
    expect(COMMANDS).toEqual([
      ["kanban add", "kanban"],
      ["kanban ls", "kanban"],
      ["quno", "quick-notes"],
    ]);
  });
});

describe("used_apps", () => {
  test("nothing used", () => {
    expect(used_apps(APPS, NONE, COMMANDS)).toEqual(new Set());
  });

  test("windows, desktop, app storage, data folders and file defaults", () => {
    const used = used_apps(
      APPS,
      {
        ...NONE,
        windows: ["clock"],
        desktop: ["paint"],
        storage_keys: ["app.snake.best", "kernel.debug", "app.gone.x"],
        data_folders: ["diff", "retired-app"],
        defaults: ["kanban"],
      },
      COMMANDS
    );
    expect([...used].sort()).toEqual(["clock", "diff", "kanban", "paint", "snake"]);
  });

  test("shell history: any stage, sudo, whole words only", () => {
    expect(used_apps(APPS, { ...NONE, history: ["ls | kanban add milk"] }, COMMANDS)).toEqual(new Set(["kanban"]));
    expect(used_apps(APPS, { ...NONE, history: ["sudo quno"] }, COMMANDS)).toEqual(new Set(["quick-notes"]));
    expect(used_apps(APPS, { ...NONE, history: ["kanbanx add", "echo quno"] }, COMMANDS)).toEqual(new Set());
  });
});
