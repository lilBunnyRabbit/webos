import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Barcode as BarcodeIcon, HandHeart as HandHeartIcon, Star as StarIcon } from "phosphor-svelte";

export default [
  { icon: BarcodeIcon, title: "Scan and ring up", text: "Tap each item, then type the total on your keys or the register's keypad." },
  { icon: HandHeartIcon, title: "Say sorry", text: "Clean sales earn Sorry tokens; one lets you retype a wrong total for half the damage." },
  { icon: StarIcon, title: "Keep the shop open", text: "Minute-long days earn stars for accuracy. Empty the health bar three times and the shop is lost." },
] satisfies AppHighlight[];
