import { define_app, type AppManifest, type Kernel } from "$lib/core/api";
import { z } from "zod";
import { define_command } from "../shell/define";
import { AppCategory } from "./type";
import { AppsService } from "./service.svelte";

const never = () => new Promise<never>(() => {});

function stand_in(manifest: Omit<Parameters<typeof define_app>[0], "icon" | "version" | "component">): AppManifest {
  return { ...define_app({ ...manifest, icon: (() => {}) as never, version: "1.0.0", component: never }), system: false };
}

/** Tests only: stand-in user apps, so core tests keep passing when the user apps are deleted. */
export const EXAMPLE_APP = stand_in({
  id: "example",
  name: "Example",
  meta: async () => ({ default: { description: "Test app" } }),
  category: AppCategory.DEVELOPER,
  props: z.object({ count: z.number() }),
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

export const GAME_APP = stand_in({ id: "game", name: "Game", category: AppCategory.GAMES });

/** The system apps plus these: the same registry whether or not the user apps exist. */
export class TestAppsService extends AppsService {
  constructor(kernel: Kernel) {
    super(kernel);
    for (const [id, manifest] of this.registry) if (!manifest.system) this.registry.delete(id);
    for (const app of [EXAMPLE_APP, BOARD_APP, NOTES_APP, GAME_APP]) this.register(app);
  }
}
