import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Bell as BellIcon, ClockCounterClockwise as ClockCounterClockwiseIcon, GridFour as GridFourIcon, VideoCamera as VideoCameraIcon } from "phosphor-svelte";

export default [
  { icon: ClockCounterClockwiseIcon, title: "Five seconds before", text: "Every clip starts before the movement did, so you see what set it off." },
  { icon: VideoCameraIcon, title: "Keeps watching", text: "Close the window and it carries on in the background until you disarm it." },
  { icon: GridFourIcon, title: "Zones", text: "Switch off the parts of the picture that always move: a window, a screen, a tree." },
  { icon: BellIcon, title: "A timeline of the day", text: "A notification when something moves, and every event on a strip you can play back." },
] satisfies AppHighlight[];
