import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "video-tools",
  name: "Video Tools",
  icon: AppIcon,
  version: "1.0.0",
  description: "Trim a video to a WebM clip, turn part of it into a GIF, or save its sound.",
  keywords: ["trim", "cut", "clip", "gif", "webm", "audio", "sound"],
  category: AppCategory.MEDIA,
  tools: ["video/*"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 380 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./video-tools.app.svelte"),
});
