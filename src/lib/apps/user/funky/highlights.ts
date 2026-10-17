import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { AirplaneTilt as AirplaneTiltIcon, ChartLine as ChartLineIcon, Code as CodeIcon, FileArrowUp as FileArrowUpIcon } from "phosphor-svelte";

export default [
  { icon: CodeIcon, title: "Readable Funky Trees", text: "Functions, named values and comments in any order, compiled to ordered setters and part inputs." },
  { icon: ChartLineIcon, title: "Simulate before you fly", text: "Flight presets, scripted steps and live graphs show how PID, smooth and latches settle." },
  { icon: FileArrowUpIcon, title: "Import a craft", text: "Open a SimplePlanes save to list its setters and part inputs and turn them into code." },
  { icon: AirplaneTiltIcon, title: "Copy into the game", text: "Copy the Variables block, one setter, one part input, or a DebugExpression to watch it live." },
] satisfies AppHighlight[];
