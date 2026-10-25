import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  Cube as CubeIcon,
  NumberSquareOne as NumberSquareOneIcon,
  Polygon as PolygonIcon,
  Ruler as RulerIcon,
} from "phosphor-svelte";

export default [
  {
    icon: PolygonIcon,
    title: "Clean lines by tapping",
    text: "Tap the corners with 45° snapping, or walk a shape by typing a length and picking a direction.",
  },
  {
    icon: NumberSquareOneIcon,
    title: "A numpad for your thumb",
    text: "Big keys step through every length still to measure, and the number lands on its edge.",
  },
  {
    icon: RulerIcon,
    title: "Numbers that add up",
    text: "Each closed shape checks that its lengths close, offers the missing one, and gives area and perimeter.",
  },
  {
    icon: CubeIcon,
    title: "Turn it around in 3D",
    text: "Give any shape a height and see it built from your numbers, with dimensions and markers on the floor; tap a line in 3D to measure it.",
  },
] satisfies AppHighlight[];
