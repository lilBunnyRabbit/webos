import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "activity-monitor",
  name: "Activity Monitor",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description:
    "What's running and how hard it works: windows, widgets, frame rate, network, storage and background tasks.",
  pitch: {
    problem: "Something feels slow and you can't tell what's doing it.",
    solution: "See every window, widget, background task and the frame rate live, and close what's heavy.",
  },
  keywords: [
    "task manager",
    "processes",
    "performance",
    "fps",
    "memory",
    "storage",
    "network",
    "profiler",
    "monitor",
    "widgets",
    "tasks",
    "background",
  ],
  defaults: {
    constraints: {
      width: { min: 480 },
      height: { min: 360 },
    },
  },
  /** `section` opens on that section, e.g. Tasks from the taskbar. */
  props: z.object({ section: z.enum(SECTION_IDS) }),
  component: () => import("./activity-monitor.app.svelte"),
});
