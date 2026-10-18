import { define_app, type AppManifest, type Kernel } from "$lib/core/api";
import { z } from "zod";
import { AppCategory } from "./type";
import { AppsService } from "./service.svelte";

/** Tests only: a stand-in user app, so core tests keep passing when the user apps are deleted. */
export const EXAMPLE_APP: AppManifest = {
  ...define_app({
    id: "example",
    name: "Example",
    icon: (() => {}) as never,
    version: "1.0.0",
    meta: async () => ({ default: { description: "Test app" } }),
    category: AppCategory.DEVELOPER,
    props: z.object({ count: z.number() }),
    component: () => new Promise<never>(() => {}),
  }),
  system: false,
};

export class TestAppsService extends AppsService {
  constructor(kernel: Kernel) {
    super(kernel);
    this.register(EXAMPLE_APP);
  }
}
