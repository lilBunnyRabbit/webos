import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  ArrowsClockwise as ArrowsClockwiseIcon,
  NumberSquareOne as NumberSquareOneIcon,
  Polygon as PolygonIcon,
  Ruler as RulerIcon,
} from "phosphor-svelte";

export default [
  {
    icon: PolygonIcon,
    title: "Clean lines by tapping",
    text: "Tap the corners with the magnet on 45°, iso or your own angles, or walk a shape by typing a length and picking a direction.",
  },
  {
    icon: NumberSquareOneIcon,
    title: "A numpad for your thumb",
    text: "Big keys that buzz under your thumb step through every length still to measure, and the number lands on its edge.",
  },
  {
    icon: RulerIcon,
    title: "Numbers that add up",
    text: "Each closed shape checks that its lengths close, offers the missing one, and gives area and perimeter. Turn the check off for a box drawn in 3D.",
  },
  {
    icon: ArrowsClockwiseIcon,
    title: "Turn it with two fingers",
    text: "Pinch to zoom and twist to turn the sketch; it settles square near each quarter turn and the numbers stay upright.",
  },
] satisfies AppHighlight[];
