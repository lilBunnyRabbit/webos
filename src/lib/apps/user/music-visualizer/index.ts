import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "music-visualizer",
  name: "Music Visualizer",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  tools: ["audio/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 300 },
    },
  },
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  component: () => import("./music-visualizer.app.svelte"),
});
