import { define_app, type AppManifest } from "$lib/core/api";
import { z } from "zod";
import { define_command } from "../shell/define";
import { AppCategory } from "./type";
import { AppsService } from "./service.svelte";
import type { CatalogueSource } from "./source";
import { glob_source } from "./glob-source";

const never = () => new Promise<never>(() => {});

function stand_in(manifest: Omit<Parameters<typeof define_app>[0], "icon" | "version" | "component">): AppManifest {
  return { ...define_app({ ...manifest, icon: (() => {}) as never, component: never }), version: "1.0.0", system: false };
}

/** Tests only: stand-in user apps, so core tests keep passing when the user apps are deleted. */
export const EXAMPLE_APP = stand_in({
  id: "example",
  name: "Example",
  meta: async () => ({ default: { description: "Test app" } }),
  category: AppCategory.DEVELOPER,
  props: z.object({ count: z.number() }),
  replaces: [{ app: "old-games", props: { mode: "count" } }],
});

export const BOARD_APP = stand_in({
  id: "board",
  name: "Board",
  category: AppCategory.PRODUCTIVITY,
  widget: never,
  widget_size: { min: { w: 2, h: 2 }, max: { w: 4, h: 4 }, default: { w: 2, h: 2 } },
});

export const NOTES_APP = stand_in({
  id: "notes",
  name: "Notes",
  category: AppCategory.PRODUCTIVITY,
  shell: async () => ({
    default: { commands: [define_command({ id: "notes add", description: "Add a note", args: z.object({}), run: () => {} })] },
  }),
});

export const GAME_APP = stand_in({ id: "game", name: "Game", category: AppCategory.GAMES, replaces: [{ app: "old-games" }] });

export const TEST_APPS = [EXAMPLE_APP, BOARD_APP, NOTES_APP, GAME_APP];

/** The system apps plus these: the same catalogue whether or not the user apps exist. */
export class TestAppsService extends AppsService {
  protected override async catalogue_source(): Promise<CatalogueSource> {
    const { apps } = await import("$lib/apps");
    return glob_source([...apps.filter((manifest) => manifest.system), ...TEST_APPS]);
  }
}
