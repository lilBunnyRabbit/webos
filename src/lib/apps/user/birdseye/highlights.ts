import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  Crosshair as CrosshairIcon,
  FilmStrip as FilmStripIcon,
  FrameCorners as FrameCornersIcon,
  MagnifyingGlassPlus as MagnifyingGlassPlusIcon,
} from "phosphor-svelte";

export default [
  {
    icon: CrosshairIcon,
    title: "Box it once",
    text: "Pause on a frame, draw a box around the subject and press Track. It follows on its own, on your device.",
  },
  {
    icon: FrameCornersIcon,
    title: "The world moves, it doesn't",
    text: "The subject stays in the middle of the picture, smoothed so the camera never jerks or lags.",
  },
  {
    icon: FilmStripIcon,
    title: "Fix where it slipped",
    text: "The timeline shows where the track got lost. Jump there, box it again, and it carries on.",
  },
  {
    icon: MagnifyingGlassPlusIcon,
    title: "Zoom and save",
    text: "Zoom in, fill the edges with a blurred copy, black or a theme colour, and save a WebM with the sound.",
  },
] satisfies AppHighlight[];
