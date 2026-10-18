import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { TOPIC_IDS } from "./ids";
import AppIcon from "./icon.svelte";

export const GETTING_STARTED_PROPS = z.object({ topic: z.enum(TOPIC_IDS).optional() });

export default define_app({
  id: "getting-started",
  name: "Getting started",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  props: GETTING_STARTED_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  component: () => import("./getting-started.app.svelte"),
});
