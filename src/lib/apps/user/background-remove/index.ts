import { define_app } from "$lib/core/api";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Eraser as EraserIcon } from "phosphor-svelte";

export default define_app({
  id: "background-remove",
  name: "Background Remove",
  icon: EraserIcon,
  version: "1.0.0",
  description: "Makes chosen colours in an image transparent.",
  keywords: ["transparent", "colour key", "chroma", "image"],
  categories: ["user"],
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 420 },
      height: { min: 360 },
    },
  },
  component: () => import("./background-remove.app.svelte"),
});
