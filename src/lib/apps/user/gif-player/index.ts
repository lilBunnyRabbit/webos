import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "gif-player",
  name: "GIF Player",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Plays animated GIFs with pause, frame-by-frame stepping and speed control.",
  keywords: ["gif", "animation", "frames", "player", "image", "animated"],
  tools: ["image/gif", ".gif", "video/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 420 },
      height: { min: 380 },
    },
  },
  component: () => import("./gif-player.app.svelte"),
});
