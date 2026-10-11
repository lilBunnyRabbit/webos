import { define_app } from "$lib/core/api";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { FilmStrip as FilmStripIcon } from "phosphor-svelte";

export default define_app({
  id: "sprite-extract",
  name: "Sprite Extractor",
  icon: FilmStripIcon,
  version: "1.0.0",
  categories: ["user"],
  description: "Slice a sprite sheet into frames, fix the grid, preview the animation and export frames or a clean sheet",
  keywords: ["sprite", "sheet", "frames", "animation", "extract", "slice"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 480 },
      height: { min: 360 },
    },
  },
  component: () => import("./sprite-extract.app.svelte"),
});
