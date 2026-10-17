import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { AppWindow as AppWindowIcon, Browser as BrowserIcon, Cards as CardsIcon, FileZip as FileZipIcon } from "phosphor-svelte";

export default [
  { icon: BrowserIcon, title: "Where it lands", text: "See the favicon in a tab and the icon on iOS and Android home screens, light and dark." },
  { icon: AppWindowIcon, title: "Maskable icons", text: "Circle, squircle and rounded masks with the safe zone drawn in." },
  { icon: CardsIcon, title: "Social card", text: "A 1200 × 630 share image with your icon, title and subtitle." },
  { icon: FileZipIcon, title: "One zip", text: "favicon.ico, the PNGs, a web manifest and the head tags, ready to drop into a site." },
] satisfies AppHighlight[];
