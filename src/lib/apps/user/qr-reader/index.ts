import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "qr-reader",
  name: "QR Reader",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Scans QR codes and barcodes from your camera or an image.",
  pitch: {
    problem: "A QR code on screen or in a photo is hard to read without a phone.",
    solution: "Scan QR codes and barcodes from your camera or an image.",
  },
  keywords: ["qr", "barcode", "scan", "scanner", "camera", "code"],
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
