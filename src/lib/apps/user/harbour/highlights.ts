import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Anchor as AnchorIcon, Boat as BoatIcon, Waves as WavesIcon } from "phosphor-svelte";

export default [
  { icon: WavesIcon, title: "It keeps going", text: "Momentum, a rudder that needs water flowing past it and a prop that walks the stern astern." },
  { icon: BoatIcon, title: "Two boats", text: "A nimble RIB with an outboard, and a 10 m yacht that carries its way and turns on prop wash." },
  { icon: AnchorIcon, title: "Kiss the fenders", text: "Alongside or into a box berth: stop square, the crew put the lines on, and a gentle touch earns a star." },
] satisfies AppHighlight[];
