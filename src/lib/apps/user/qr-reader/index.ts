import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { QrCode as QrCodeIcon } from "phosphor-svelte";

export default define_app({
  id: "qr-reader",
  name: "QR Reader",
  icon: QrCodeIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
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
