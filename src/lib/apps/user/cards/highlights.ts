import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Barcode as BarcodeIcon, Camera as CameraIcon, PushPin as PushPinIcon, Storefront as StorefrontIcon } from "phosphor-svelte";

export default [
  { icon: CameraIcon, title: "Scan it once", text: "Point the camera at a card or drop in a photo of it, and the number and format are filled in." },
  { icon: BarcodeIcon, title: "Every barcode kind", text: "EAN, UPC, Code 128, Code 39, Code 93, ITF, Codabar, QR, PDF417, Aztec and Data Matrix, or just the number." },
  { icon: StorefrontIcon, title: "Checkout mode", text: "The code fills the screen at full contrast, and the screen stays on until you tap." },
  { icon: PushPinIcon, title: "Your cards first", text: "The cards you use most come first, pinned ones above them, with search for the rest." },
] satisfies AppHighlight[];
