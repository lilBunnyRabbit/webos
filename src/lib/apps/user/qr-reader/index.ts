import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "qr-reader",
  name: "QR Reader",
  icon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  tools: ["image/*"],
  props: FILE_PROPS,
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 320 },
    },
  },
  component: () => import("./qr-reader.app.svelte"),
});
