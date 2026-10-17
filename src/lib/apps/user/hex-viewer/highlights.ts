import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Crosshair as CrosshairIcon, Gauge as GaugeIcon, MagnifyingGlass as MagnifyingGlassIcon, Terminal as TerminalIcon } from "phosphor-svelte";

export default [
  { icon: GaugeIcon, title: "Any size", text: "Only the rows on screen are read, so even huge files open instantly." },
  { icon: CrosshairIcon, title: "Go to offset", text: "Jump to any byte, select a range and copy it as hex or text." },
  { icon: MagnifyingGlassIcon, title: "Byte inspector", text: "See the bytes under the cursor as integers and floats, little or big endian." },
  { icon: TerminalIcon, title: "hexdump", text: "Dump a file in the Terminal and click a row to open it right there." },
] satisfies AppHighlight[];
