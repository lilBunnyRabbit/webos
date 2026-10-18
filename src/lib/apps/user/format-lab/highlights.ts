import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Gauge as GaugeIcon, Info as InfoIcon, SquareHalf as SquareHalfIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: SquareHalfIcon, title: "Four formats at once", text: "JPEG, WebP, AVIF and JPEG XL from the same picture, compared with a swipe." },
  { icon: GaugeIcon, title: "Size against quality", text: "Bytes, the share of the original, encode time and an SSIM score, with a heatmap of what got lost." },
  { icon: InfoIcon, title: "Inspect AVIF and JPEG XL", text: "Dimensions, bit depth, alpha, animation and HDR, straight from the file's header." },
  { icon: TerminalIcon, title: "convert in the Terminal", text: "Turn images, or whole folders, into any of the formats, with a progress you can cancel." },
] satisfies AppHighlight[];
