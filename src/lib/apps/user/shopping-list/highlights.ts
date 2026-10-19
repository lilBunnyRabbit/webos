import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Camera as CameraIcon, Lightning as LightningIcon, ArrowsClockwise as ArrowsClockwiseIcon, Storefront as StorefrontIcon } from "phosphor-svelte";

export default [
  { icon: StorefrontIcon, title: "In-store mode", text: "Big rows to tick with a thumb, and the screen stays on while you shop." },
  { icon: LightningIcon, title: "Quick entry", text: "Type \"2x milk\" or \"500 g flour\" and the amount comes off; what you buy most is suggested." },
  { icon: CameraIcon, title: "From a photo", text: "Read a handwritten or printed list from a picture, check the lines, then add them." },
  { icon: ArrowsClockwiseIcon, title: "Shared live", text: "Pair two phones by scanning QR codes and both edit the same list, no account or server." },
] satisfies AppHighlight[];
