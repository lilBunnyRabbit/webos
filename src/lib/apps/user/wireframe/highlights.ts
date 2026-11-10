import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  ArrowsClockwise as ArrowsClockwiseIcon,
  Cube as CubeIcon,
  PencilSimpleLine as PencilSimpleLineIcon,
  Ruler as RulerIcon,
} from "phosphor-svelte";

export default [
  {
    icon: PencilSimpleLineIcon,
    title: "Walk the lines",
    text: "Drag from a corner along X, Y or Z and type the length: every line is exact and to scale, and lines that meet share their corner.",
  },
  {
    icon: ArrowsClockwiseIcon,
    title: "Turn it any way",
    text: "Start in the cavalier view you'd draw by hand, then orbit, or jump to isometric, front, side or top.",
  },
  {
    icon: RulerIcon,
    title: "Every length on show",
    text: "Each line carries its length, upright and off the lines, in mm, cm or m.",
  },
  {
    icon: CubeIcon,
    title: "Boxes and repeats",
    text: "Make a box from three sizes, extrude lines into a frame, or copy a post along a fence as many times as it needs.",
  },
] satisfies AppHighlight[];
