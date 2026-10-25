import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Coffee as CoffeeIcon, Leaf as LeafIcon, Repeat as RepeatIcon, Thermometer as ThermometerIcon } from "phosphor-svelte";

export default [
  { icon: LeafIcon, title: "Every common tea", text: "Black, green, white, oolong, herbal, fruit and more, each with its temperature and time." },
  { icon: CoffeeIcon, title: "One timer per cup", text: "Brew several at once; each rings when its cup is ready, window open or not." },
  { icon: RepeatIcon, title: "Re-steeps", text: "Teas that brew again offer the next steep with a little more time." },
  { icon: ThermometerIcon, title: "Your teas, your units", text: "Add your own, edit the built-ins, and read temperatures in °C or °F." },
] satisfies AppHighlight[];
