import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { Compass as CompassIcon } from "phosphor-svelte";
import { TOPIC_IDS } from "./ids";

export const GETTING_STARTED_PROPS = z.object({ topic: z.enum(TOPIC_IDS).optional() });

export default define_app({
  id: "getting-started",
  name: "Getting started",
  icon: CompassIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "A tour of what WebOS can do, with a Try it button for each part.",
  keywords: ["tour", "help", "tips", "welcome", "intro", "guide", "how to", "features", "onboarding"],
  props: GETTING_STARTED_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: {
    commands: [
      define_command({
        id: "tour",
        description: "Open Getting started, optionally at a topic",
        args: z.object({ topic: z.enum(TOPIC_IDS).optional() }),
        positional: ["topic"],
        run: async ({ args }) => (await import("./shell")).tour(args.topic),
      }),
    ],
  },
  component: () => import("./getting-started.app.svelte"),
});
